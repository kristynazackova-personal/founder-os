import { createSign } from "node:crypto";
import { jsonFetch, ProviderError } from "../checkout/provider";
import type { InstallRow } from "../domain/attribution";
import { CAMPAIGN_FUNNEL_EVENTS, pickAdRows, TOTAL_SCOPE, type AdRowScope, type CampaignAdRow, type CampaignEventRow } from "../domain/campaigns";
import { ga4Date, isEventAllowed, readFrom } from "../domain/eventSettings";
import type { CatalogEvent } from "../services/eventCatalog";
import type { AnalyticsAdapter, Ga4Credentials, ReadOpts } from "./types";

/**
 * GA4 Data API, read with a service account (the founder adds it as a Viewer
 * on the property). Only two numbers are read: active users in the last 30
 * days and `sign_up` events.
 */
type ServiceAccount = { client_email: string; private_key: string; token_uri?: string };

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export async function serviceAccountToken(sa: ServiceAccount, scope = "https://www.googleapis.com/auth/analytics.readonly"): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope, aud: sa.token_uri ?? "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const jwt = `${header}.${claims}.${b64url(signer.sign(sa.private_key))}`;
  const res = await jsonFetch<{ access_token: string }>(sa.token_uri ?? "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }).toString(),
  });
  return res.access_token;
}

type RunReport = { rows?: Array<{ dimensionValues?: Array<{ value: string }>; metricValues: Array<{ value: string }> }> };

/** The read window for a report: `days` back, floored at the founder's "from now on" date when set. */
function dateRanges(opts: ReadOpts | undefined, days: number, now: Date) {
  return [{ startDate: ga4Date(readFrom(opts?.events ?? null, days, now)), endDate: "today" }];
}

async function reportClient(credentials: Ga4Credentials) {
  const sa = JSON.parse(credentials.serviceAccountJson) as ServiceAccount;
  const token = await serviceAccountToken(sa);
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(credentials.propertyId)}:runReport`;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  return (body: Record<string, unknown>) => jsonFetch<RunReport>(url, { method: "POST", headers, body: JSON.stringify(body) });
}

export const ga4Adapter: AnalyticsAdapter = {
  async fetchSignals(credentials, now = new Date(), opts) {
    const run = await reportClient(credentials as Ga4Credentials);
    const ranges = dateRanges(opts, 30, now);
    const allowed = (event: string) => isEventAllowed(opts?.events ?? null, event);
    const countEvent = async (event: string): Promise<number | null> => {
      if (!allowed(event)) return null;
      const r = await run({ dateRanges: ranges, metrics: [{ name: "eventCount" }], dimensionFilter: { filter: { fieldName: "eventName", stringFilter: { value: event } } } });
      return r.rows?.length ? Number(r.rows[0].metricValues[0].value) : null;
    };
    const users = await run({ dateRanges: ranges, metrics: [{ name: "activeUsers" }] });
    // Firebase's automatic first_open = one per app install. A web-only
    // property never has it, so "no rows" stays null rather than 0.
    const [signups, installs] = await Promise.all([countEvent("sign_up"), countEvent("first_open")]);
    return {
      visitors30d: Number(users.rows?.[0]?.metricValues?.[0]?.value ?? 0),
      signups30d: signups,
      installs30d: installs,
    };
  },
};

/** Every event the property has ever collected, with all-time counts (GA4's earliest supported date), most frequent first. */
export async function listGa4Events(credentials: Ga4Credentials): Promise<CatalogEvent[]> {
  const run = await reportClient(credentials);
  const report = await run({
    dateRanges: [{ startDate: "2015-08-14", endDate: "today" }],
    dimensions: [{ name: "eventName" }],
    metrics: [{ name: "eventCount" }],
    orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
    limit: 500,
  });
  return (report.rows ?? []).map((r) => ({ name: r.dimensionValues?.[0]?.value ?? "", count: Number(r.metricValues?.[0]?.value ?? 0) || 0 })).filter((e) => e.name);
}

/** Rows of a first_open report with dimensions [firstUserSource, firstUserMedium, firstUserCampaignName]. */
export function installRowsFromReport(report: RunReport): InstallRow[] {
  return (report.rows ?? []).map((r) => ({
    source: r.dimensionValues?.[0]?.value ?? null,
    medium: r.dimensionValues?.[1]?.value ?? null,
    campaign: r.dimensionValues?.[2]?.value ?? null,
    installs: Number(r.metricValues?.[0]?.value ?? 0) || 0,
  }));
}

/** App installs in the last `days` days: GA4 / Firebase `first_open`, split by the user's first-touch source, medium and campaign. */
export async function fetchGa4Installs(credentials: Ga4Credentials, days = 30, opts?: ReadOpts, now = new Date()): Promise<InstallRow[]> {
  if (!isEventAllowed(opts?.events ?? null, "first_open")) return [];
  const run = await reportClient(credentials);
  const report = await run({
    dateRanges: dateRanges(opts, days, now),
    dimensions: [{ name: "firstUserSource" }, { name: "firstUserMedium" }, { name: "firstUserCampaignName" }],
    metrics: [{ name: "eventCount" }],
    dimensionFilter: { filter: { fieldName: "eventName", stringFilter: { value: "first_open" } } },
    limit: 500,
  });
  return installRowsFromReport(report);
}

/** Rows of a report with dimension [<scope>GoogleAdsCampaignName] and metrics [advertiserAdClicks, advertiserAdImpressions, advertiserAdCost]. */
export function campaignAdRowsFromReport(report: RunReport): CampaignAdRow[] {
  return (report.rows ?? []).map((r) => ({
    campaign: r.dimensionValues?.[0]?.value || "(not set)",
    clicks: Number(r.metricValues?.[0]?.value ?? 0) || 0,
    impressions: Number(r.metricValues?.[1]?.value ?? 0) || 0,
    costCents: Math.round((Number(r.metricValues?.[2]?.value ?? 0) || 0) * 100),
  }));
}

/** Rows of a report with dimensions [firstUserGoogleAdsCampaignName, eventName] and metric [totalUsers]. */
export function campaignEventRowsFromReport(report: RunReport): CampaignEventRow[] {
  return (report.rows ?? []).map((r) => ({
    campaign: r.dimensionValues?.[0]?.value ?? "(not set)",
    event: r.dimensionValues?.[1]?.value ?? "",
    users: Number(r.metricValues?.[0]?.value ?? 0) || 0,
  }));
}

export type CampaignScope = AdRowScope;

/**
 * Dimensions to try for ad cost, best first. Cost is SESSION-scoped in GA4:
 * paired with a user-scoped dimension the API answers 200 with blank cost
 * instead of an error, and some combinations are rejected outright with 400,
 * so the only reliable approach is to try each and keep the one that reports
 * cost. `sessionCampaignName` is included because GA4 commonly serves
 * advertiser cost against the plain session campaign rather than the
 * Google-Ads-specific dimension.
 */
const AD_DIMENSIONS = ["sessionGoogleAdsCampaignName", "sessionCampaignName", "firstUserGoogleAdsCampaignName"] as const;

/** Google's own explanation of a rejected report, which is what says why a dimension/metric pair is invalid. */
export function ga4ErrorText(err: unknown): string {
  const google = err instanceof ProviderError ? (err.body as { error?: { message?: string } } | null)?.error?.message : undefined;
  const status = err instanceof ProviderError && err.status ? `HTTP ${err.status}` : "";
  const fallback = err instanceof Error ? err.message : String(err);
  return google ? `${status ? `${status}: ` : ""}${google}` : fallback;
}

export type AdReadNote = { request: string; message: string };

/**
 * Ad spend per Google Ads campaign plus the funnel events GA4 attributes to
 * each campaign's first touch.
 *
 * The funnel events are the card's backbone, so they are read first and are
 * the only failure that propagates. Every ad-cost attempt is best-effort:
 * each candidate dimension is tried, then the property-wide total with no
 * dimension at all, and whatever GA4 says about a rejected combination is
 * returned in `notes` so the page can show it instead of dying. A card with
 * installs and purchases but unknown spend is far more useful than an error.
 */
export async function fetchGa4Campaigns(
  credentials: Ga4Credentials,
  days = 30,
  opts?: ReadOpts,
  now = new Date(),
): Promise<{ ads: CampaignAdRow[]; events: CampaignEventRow[]; scope: CampaignScope; notes: AdReadNote[] }> {
  const run = await reportClient(credentials);
  const ranges = dateRanges(opts, days, now);
  const funnelEvents = CAMPAIGN_FUNNEL_EVENTS.filter((e) => isEventAllowed(opts?.events ?? null, e));
  const adMetrics = [{ name: "advertiserAdClicks" }, { name: "advertiserAdImpressions" }, { name: "advertiserAdCost" }];
  const notes: AdReadNote[] = [];

  const eventFilter = { filter: { fieldName: "eventName", inListFilter: { values: funnelEvents } } };
  let events: CampaignEventRow[] = [];
  if (funnelEvents.length) {
    try {
      events = campaignEventRowsFromReport(
        await run({ dateRanges: ranges, dimensions: [{ name: "firstUserGoogleAdsCampaignName" }, { name: "eventName" }], metrics: [{ name: "totalUsers" }], dimensionFilter: eventFilter, limit: 500 }),
      );
    } catch (err) {
      notes.push({ request: "funnel by campaign", message: ga4ErrorText(err) });
    }
    // Property-wide funnel: no campaign dimension, so nothing to reject and
    // nothing for GA4's low-volume thresholding to withhold. Used when the
    // campaign-scoped read failed or returned fewer users than the property
    // actually has, which is exactly what thresholding looks like.
    try {
      const wide = campaignEventRowsFromReport(await run({ dateRanges: ranges, dimensions: [{ name: "eventName" }], metrics: [{ name: "totalUsers" }], dimensionFilter: eventFilter, limit: 100 })).map((r) => ({
        // eventName is the only dimension, so it lands in `campaign`; re-read it into the right field.
        campaign: "(not set)",
        event: r.campaign,
        users: r.users,
      }));
      const wideTotal = wide.reduce((n, r) => n + r.users, 0);
      const narrowTotal = events.reduce((n, r) => n + r.users, 0);
      if (wideTotal > narrowTotal) {
        if (narrowTotal > 0) notes.push({ request: "funnel by campaign", message: `GA4 returned ${narrowTotal} users split by campaign but ${wideTotal} property-wide, so the split is being withheld for low volume. Showing the property-wide figures.` });
        events = wide;
      }
    } catch (err) {
      if (events.length === 0) notes.push({ request: "funnel property-wide", message: ga4ErrorText(err) });
    }
  }
  if (funnelEvents.length && events.length === 0 && notes.length) {
    // Nothing about the funnel could be read; that is the card's backbone, so say so loudly.
    throw new Error(notes.map((n) => `${n.request}: ${n.message}`).join(" · "));
  }

  const attempts: Array<{ scope: string; rows: CampaignAdRow[] }> = [];
  for (const dimension of AD_DIMENSIONS) {
    try {
      const rows = campaignAdRowsFromReport(
        await run({ dateRanges: ranges, dimensions: [{ name: dimension }], metrics: adMetrics, orderBys: [{ metric: { metricName: "advertiserAdCost" }, desc: true }], limit: 100 }),
      );
      attempts.push({ scope: dimension, rows });
    } catch (err) {
      notes.push({ request: dimension, message: ga4ErrorText(err) });
    }
  }
  const { ads, scope } = pickAdRows(attempts);
  return { ads, events, scope, notes };
}

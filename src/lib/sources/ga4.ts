import { createSign } from "node:crypto";
import { jsonFetch } from "../checkout/provider";
import type { InstallRow } from "../domain/attribution";
import { CAMPAIGN_FUNNEL_EVENTS, pickAdRows, type AdRowScope, type CampaignAdRow, type CampaignEventRow } from "../domain/campaigns";
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

/** Ad-cost metrics are SESSION-scoped in GA4. Paired with a user-scoped dimension the API returns 200 with
 *  blank cost rather than an error, so both candidates are tried and `pickAdRows` judges which to trust. */
const AD_DIMENSION: Record<"session" | "firstUser", string> = {
  session: "sessionGoogleAdsCampaignName",
  firstUser: "firstUserGoogleAdsCampaignName",
};

/**
 * Ad spend per Google Ads campaign plus the funnel events GA4 attributes to
 * each campaign's first touch.
 *
 * Scope matters and GA4 fails softly: `advertiserAdCost` is session-scoped,
 * and pairing it with `firstUserGoogleAdsCampaignName` returns zeros with a
 * 200, not an error. So every candidate dimension is tried until one
 * actually reports cost, and when none does (common for iOS App campaigns,
 * where per-user campaign attribution never reaches GA4) the property-wide
 * total is read with no dimension at all and returned as a single
 * unattributed row — spend is never silently zero when Google has it.
 */
export async function fetchGa4Campaigns(credentials: Ga4Credentials, days = 30, opts?: ReadOpts, now = new Date()): Promise<{ ads: CampaignAdRow[]; events: CampaignEventRow[]; scope: CampaignScope }> {
  const run = await reportClient(credentials);
  const ranges = dateRanges(opts, days, now);
  const funnelEvents = CAMPAIGN_FUNNEL_EVENTS.filter((e) => isEventAllowed(opts?.events ?? null, e));
  const adMetrics = [{ name: "advertiserAdClicks" }, { name: "advertiserAdImpressions" }, { name: "advertiserAdCost" }];

  const attempts: Array<{ scope: "session" | "firstUser"; rows: CampaignAdRow[] }> = [];
  let firstError: unknown = null;
  for (const candidate of ["session", "firstUser"] as const) {
    try {
      const rows = campaignAdRowsFromReport(
        await run({ dateRanges: ranges, dimensions: [{ name: AD_DIMENSION[candidate] }], metrics: adMetrics, orderBys: [{ metric: { metricName: "advertiserAdCost" }, desc: true }], limit: 100 }),
      );
      attempts.push({ scope: candidate, rows });
    } catch (err) {
      firstError = firstError ?? err;
    }
  }
  // No dimension can be scope-mismatched, so this is the last word on whether spend exists at all.
  let totals: CampaignAdRow | null = null;
  try {
    totals = campaignAdRowsFromReport(await run({ dateRanges: ranges, metrics: adMetrics }))[0] ?? null;
  } catch (err) {
    firstError = firstError ?? err;
  }
  const { ads, scope } = pickAdRows(attempts, totals);
  if (ads.length === 0 && firstError) throw firstError;

  const eventsReport = funnelEvents.length
    ? await run({
        dateRanges: ranges,
        dimensions: [{ name: "firstUserGoogleAdsCampaignName" }, { name: "eventName" }],
        metrics: [{ name: "totalUsers" }],
        dimensionFilter: { filter: { fieldName: "eventName", inListFilter: { values: funnelEvents } } },
        limit: 500,
      })
    : {};
  return { ads, events: campaignEventRowsFromReport(eventsReport), scope };
}

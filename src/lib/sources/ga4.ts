import { createSign } from "node:crypto";
import { jsonFetch } from "../checkout/provider";
import type { InstallRow } from "../domain/attribution";
import { CAMPAIGN_FUNNEL_EVENTS, type CampaignAdRow, type CampaignEventRow } from "../domain/campaigns";
import type { AnalyticsAdapter, Ga4Credentials } from "./types";

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

export const ga4Adapter: AnalyticsAdapter = {
  async fetchSignals(credentials) {
    const { propertyId, serviceAccountJson } = credentials as Ga4Credentials;
    const sa = JSON.parse(serviceAccountJson) as ServiceAccount;
    const token = await serviceAccountToken(sa);
    const url = `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`;
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const users = await jsonFetch<RunReport>(url, { method: "POST", headers, body: JSON.stringify({ dateRanges: [{ startDate: "30daysAgo", endDate: "today" }], metrics: [{ name: "activeUsers" }] }) });
    const signups = await jsonFetch<RunReport>(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
        metrics: [{ name: "eventCount" }],
        dimensionFilter: { filter: { fieldName: "eventName", stringFilter: { value: "sign_up" } } },
      }),
    });
    // Firebase's automatic first_open = one per app install. A web-only
    // property never has it, so "no rows" stays null rather than 0.
    const installs = await jsonFetch<RunReport>(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
        metrics: [{ name: "eventCount" }],
        dimensionFilter: { filter: { fieldName: "eventName", stringFilter: { value: "first_open" } } },
      }),
    });
    return {
      visitors30d: Number(users.rows?.[0]?.metricValues?.[0]?.value ?? 0),
      signups30d: signups.rows?.length ? Number(signups.rows[0].metricValues[0].value) : null,
      installs30d: installs.rows?.length ? Number(installs.rows[0].metricValues[0].value) : null,
    };
  },
};

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
export async function fetchGa4Installs(credentials: Ga4Credentials, days = 30): Promise<InstallRow[]> {
  const sa = JSON.parse(credentials.serviceAccountJson) as ServiceAccount;
  const token = await serviceAccountToken(sa);
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(credentials.propertyId)}:runReport`;
  const report = await jsonFetch<RunReport>(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      dateRanges: [{ startDate: `${days}daysAgo`, endDate: "today" }],
      dimensions: [{ name: "firstUserSource" }, { name: "firstUserMedium" }, { name: "firstUserCampaignName" }],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: { filter: { fieldName: "eventName", stringFilter: { value: "first_open" } } },
      limit: 500,
    }),
  });
  return installRowsFromReport(report);
}

/** Rows of a report with dimension [<scope>GoogleAdsCampaignName] and metrics [advertiserAdClicks, advertiserAdImpressions, advertiserAdCost]. */
export function campaignAdRowsFromReport(report: RunReport): CampaignAdRow[] {
  return (report.rows ?? []).map((r) => ({
    campaign: r.dimensionValues?.[0]?.value ?? "(not set)",
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

export type CampaignScope = "firstUser" | "session";

/**
 * Ad spend per Google Ads campaign (clicks, impressions, cost — populated
 * only on a property linked to the Google Ads account) plus the funnel
 * events GA4 attributes to the same first-touch campaign. The advertiserAd*
 * metrics are read on first-touch scope; if the property rejects that
 * combination we fall back to session scope rather than lose the spend.
 */
export async function fetchGa4Campaigns(credentials: Ga4Credentials, days = 30): Promise<{ ads: CampaignAdRow[]; events: CampaignEventRow[]; scope: CampaignScope }> {
  const sa = JSON.parse(credentials.serviceAccountJson) as ServiceAccount;
  const token = await serviceAccountToken(sa);
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(credentials.propertyId)}:runReport`;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const dateRanges = [{ startDate: `${days}daysAgo`, endDate: "today" }];
  const adsRequest = (scope: CampaignScope) =>
    jsonFetch<RunReport>(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        dateRanges,
        dimensions: [{ name: scope === "firstUser" ? "firstUserGoogleAdsCampaignName" : "sessionGoogleAdsCampaignName" }],
        metrics: [{ name: "advertiserAdClicks" }, { name: "advertiserAdImpressions" }, { name: "advertiserAdCost" }],
        orderBys: [{ metric: { metricName: "advertiserAdCost" }, desc: true }],
        limit: 100,
      }),
    });
  let scope: CampaignScope = "firstUser";
  let adsReport: RunReport;
  try {
    adsReport = await adsRequest("firstUser");
  } catch (firstErr) {
    try {
      adsReport = await adsRequest("session");
      scope = "session";
    } catch {
      throw firstErr;
    }
  }
  const eventsReport = await jsonFetch<RunReport>(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      dateRanges,
      dimensions: [{ name: "firstUserGoogleAdsCampaignName" }, { name: "eventName" }],
      metrics: [{ name: "totalUsers" }],
      dimensionFilter: { filter: { fieldName: "eventName", inListFilter: { values: [...CAMPAIGN_FUNNEL_EVENTS] } } },
      limit: 500,
    }),
  });
  return { ads: campaignAdRowsFromReport(adsReport), events: campaignEventRowsFromReport(eventsReport), scope };
}

import { createSign } from "node:crypto";
import { jsonFetch } from "../checkout/provider";
import type { InstallRow } from "../domain/attribution";
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
    return {
      visitors30d: Number(users.rows?.[0]?.metricValues?.[0]?.value ?? 0),
      signups30d: signups.rows?.length ? Number(signups.rows[0].metricValues[0].value) : null,
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

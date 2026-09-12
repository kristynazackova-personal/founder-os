import { jsonFetch, ProviderError } from "../checkout/provider";
import { env } from "../env";
import { adRowsFromGoogleAds, campaignSpendQuery, normalizeCustomerId, type GoogleAdsRow } from "../domain/googleAds";
import type { CampaignAdRow } from "../domain/campaigns";
import type { GoogleAdsCredentials } from "./types";

/**
 * Google Ads reporting, read with the founder's OAuth refresh token.
 *
 * Two credentials belong to Founder OS and live in env — the developer
 * token and the OAuth client — so one approval serves every customer and a
 * founder supplies only their account id and a grant. Manager accounts need
 * `login-customer-id` alongside the child account being queried.
 */
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const PAGE_CAP = 10;

export function googleAdsConfigured(): boolean {
  return Boolean(env.googleAdsDeveloperToken && env.googleOAuthClientId && env.googleOAuthClientSecret);
}

/** The scope a founder's grant must carry. */
export const ADWORDS_SCOPE = "https://www.googleapis.com/auth/adwords";

async function accessToken(refreshToken: string): Promise<string> {
  const res = await jsonFetch<{ access_token: string }>(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: env.googleOAuthClientId, client_secret: env.googleOAuthClientSecret }).toString(),
  });
  return res.access_token;
}

async function search(c: GoogleAdsCredentials, query: string): Promise<GoogleAdsRow[]> {
  const customerId = normalizeCustomerId(c.customerId);
  if (!customerId) throw new Error(`"${c.customerId}" is not a Google Ads customer id; it is ten digits, e.g. 123-456-7890.`);
  const token = await accessToken(c.refreshToken);
  const url = `https://googleads.googleapis.com/${env.googleAdsApiVersion}/customers/${customerId}/googleAds:search`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "developer-token": env.googleAdsDeveloperToken,
  };
  const loginCustomerId = c.loginCustomerId ? normalizeCustomerId(c.loginCustomerId) : null;
  if (loginCustomerId) headers["login-customer-id"] = loginCustomerId;

  const rows: GoogleAdsRow[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < PAGE_CAP; page++) {
    const body: Record<string, unknown> = { query };
    if (pageToken) body.pageToken = pageToken;
    const res = await jsonFetch<{ results?: GoogleAdsRow[]; nextPageToken?: string }>(url, { method: "POST", headers, body: JSON.stringify(body) });
    rows.push(...(res.results ?? []));
    if (!res.nextPageToken) break;
    pageToken = res.nextPageToken;
  }
  return rows;
}

/** Spend per campaign over the last `days` days, newest window inclusive of today. */
export async function fetchGoogleAdsSpend(c: GoogleAdsCredentials, days = 30, now = new Date()): Promise<CampaignAdRow[]> {
  const from = new Date(now.getTime() - days * 86_400_000);
  return adRowsFromGoogleAds(await search(c, campaignSpendQuery(from, now)));
}

/** Google's own words about a refusal — the reason always sits in the body, not the status line. */
export function googleAdsErrorText(err: unknown): string {
  if (!(err instanceof ProviderError)) return err instanceof Error ? err.message : String(err);
  const body = err.body as
    | { error?: { message?: string; details?: Array<{ errors?: Array<{ message?: string; errorCode?: Record<string, string> }> }> }; error_description?: string }
    | null;
  const oauth = body?.error_description;
  const detail = body?.error?.details?.[0]?.errors?.[0];
  const message = detail?.message ?? body?.error?.message ?? oauth;
  const code = detail?.errorCode ? Object.values(detail.errorCode)[0] : undefined;
  const status = err.status ? `HTTP ${err.status}` : "";
  return message ? `${status ? `${status}: ` : ""}${message}${code ? ` (${code})` : ""}` : `${status || "request failed"}`;
}

/** Friendly, actionable version of the handful of failures founders actually hit. */
export function explainGoogleAdsError(err: unknown, customerId: string): string {
  const text = googleAdsErrorText(err);
  if (/invalid_grant/i.test(text)) return "Google rejected the refresh token. Generate a new one — a token stops working if it is revoked, unused for six months, or was issued for a different OAuth client.";
  if (/DEVELOPER_TOKEN_NOT_APPROVED|developer token/i.test(text)) return `Founder OS's Google Ads developer token is not approved for this account yet: ${text}`;
  if (/USER_PERMISSION_DENIED|CUSTOMER_NOT_FOUND/i.test(text)) return `The grant has no access to account ${customerId}: ${text}. If it sits under a manager account, add that manager's id as the login customer id.`;
  if (/not found|INVALID_ARGUMENT.*version|Invalid value at 'query'/i.test(text)) return `Google refused the request: ${text}. If it names the API version, set GOOGLE_ADS_API_VERSION to a current one.`;
  return `Google Ads refused the request: ${text}`;
}

/** Cheap validation on connect: a one-campaign query proves token, developer token and access all work. */
export async function probeGoogleAds(c: GoogleAdsCredentials): Promise<{ ok: true; campaigns: number } | { ok: false; error: string }> {
  if (!googleAdsConfigured()) {
    return { ok: false, error: "Google Ads is not configured on this deployment: GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET must be set." };
  }
  try {
    const rows = await search(c, "SELECT campaign.id, campaign.name FROM campaign LIMIT 1");
    return { ok: true, campaigns: rows.length };
  } catch (err) {
    return { ok: false, error: explainGoogleAdsError(err, c.customerId) };
  }
}

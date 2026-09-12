import { and, eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import type { App, RevenueSource } from "../db/schema";
import { decryptJson, encryptJson } from "../crypto";
import { mergeRevenueData, type AnalyticsSignals, type NormalizedRevenueData } from "../domain/metrics";
import type { RevenueSource as RevenueSourceRow } from "../db/schema";
import { aggregateInstalls, type InstallsByChannel } from "../domain/attribution";
import { EVENT_SETTINGS_KEY, parseEventSettings, readFrom, type EventSettings } from "../domain/eventSettings";
import { analyticsAdapter, ANALYTICS_SOURCE_TYPES, isRevenueSource, isSqlIdentifier, revenueAdapter, type AppStoreCredentials, type Ga4Credentials, type MixpanelCredentials, type PostgresCredentials, type SourceType } from "../sources";
import { probeAppStore } from "../sources/appstore";
import { probeMixpanel } from "../sources/mixpanel";
import { parsePriceMap, probePostgres } from "../sources/postgres";
import { ProviderError } from "../checkout/provider";
import { fetchGa4Campaigns, fetchGa4Installs, ga4ErrorText, ga4Adapter, type AdReadNote, type CampaignScope } from "../sources/ga4";
import { fetchGoogleAdsSpend, googleAdsConfigured, probeGoogleAds, explainGoogleAdsError } from "../sources/googleads";
import { normalizeCustomerId } from "../domain/googleAds";
import type { GoogleAdsCredentials } from "../sources";
import type { CampaignAdRow, CampaignEventRow } from "../domain/campaigns";
import { validateLemonSqueezyKey } from "../sources/lemonsqueezy";
import { validatePaddleKey } from "../sources/paddle";
import { isRestrictedStripeKey, probeRestrictedStripeKey } from "../sources/stripe";
import { track } from "../track";

export type SourceView = Pick<RevenueSource, "id" | "type" | "externalId" | "status" | "connectedAt" | "lastSyncedAt" | "lastError" | "meta">;

/** What a connected source shows in the UI: identifiers only, never the credential. */
export function sourceIdentity(s: Pick<RevenueSource, "type" | "externalId" | "meta">): string {
  const m = s.meta as Record<string, unknown>;
  switch (s.type) {
    case "stripe":
      return m.via === "restricted_key" ? `${m.livemode ? "Live" : "Test"} restricted key ····${String(m.keyLast4 ?? "")}${s.externalId ? ` · ${s.externalId}` : ""}` : s.externalId ? `Account ${s.externalId} (OAuth)` : "Connected account";
    case "lemonsqueezy":
      return `${s.externalId ? `Store ${s.externalId} · ` : ""}key ····${String(m.keyLast4 ?? "")}`;
    case "paddle":
      return `${m.sandbox ? "Sandbox" : "Live"} key ····${String(m.keyLast4 ?? "")}`;
    case "ga4":
      return `Property ${s.externalId ?? "?"}${m.serviceAccountEmail ? ` · ${String(m.serviceAccountEmail)}` : ""}`;
    case "appstore":
      return `Vendor ${s.externalId ?? "?"} · key ${String(m.keyId ?? "")}`;
    case "postgres":
      return `${String(m.host ?? "database")} · ${String(m.usersTable ?? "users")}${m.hasSubscriptions ? ` + ${String(m.subsTable)}` : ""}`;
    case "mixpanel":
      return `Project ${s.externalId ?? "?"} (${String(m.region ?? "us").toUpperCase()}) · ${String(m.signupEvent ?? "")}`;
    default:
      return s.externalId ?? "—";
  }
}

export async function listSources(appId: string): Promise<SourceView[]> {
  const db = await getDb();
  const rows = await db.select().from(schema.revenueSources).where(eq(schema.revenueSources.appId, appId));
  return rows.map(({ credentialsEnc: _c, ...rest }) => {
    void _c;
    return rest;
  });
}

export async function upsertSource(app: App, type: SourceType, credentials: unknown, externalId: string | null, meta: Record<string, unknown> = {}): Promise<void> {
  const db = await getDb();
  const credentialsEnc = encryptJson(credentials);
  // Replacing a credential keeps the founder's event choices (meta.events).
  const [existing] = await db.select({ meta: schema.revenueSources.meta }).from(schema.revenueSources).where(and(eq(schema.revenueSources.appId, app.id), eq(schema.revenueSources.type, type))).limit(1);
  const kept = existing?.meta?.[EVENT_SETTINGS_KEY];
  const merged = kept !== undefined && meta[EVENT_SETTINGS_KEY] === undefined ? { ...meta, [EVENT_SETTINGS_KEY]: kept } : meta;
  await db
    .insert(schema.revenueSources)
    .values({ appId: app.id, type, credentialsEnc, externalId, meta: merged, status: "connected" })
    .onConflictDoUpdate({ target: [schema.revenueSources.appId, schema.revenueSources.type], set: { credentialsEnc, externalId, meta: merged, status: "connected", lastError: null, connectedAt: new Date() } });
  await track("source_connected", { userId: app.userId, appId: app.id, props: { type } });
}

export async function removeSource(appId: string, type: SourceType): Promise<void> {
  const db = await getDb();
  await db.delete(schema.revenueSources).where(and(eq(schema.revenueSources.appId, appId), eq(schema.revenueSources.type, type)));
}

export async function connectStripeKey(app: App, key: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const k = key.trim();
  if (!k) return { ok: false, error: "Paste your Stripe restricted key." };
  if (/^sk_/.test(k)) return { ok: false, error: "That is a secret key, which can move money. Create a restricted key with read-only permissions instead (Developers → API keys → Create restricted key)." };
  if (!isRestrictedStripeKey(k)) return { ok: false, error: "Stripe restricted keys start with rk_live_ or rk_test_." };
  const probe = await probeRestrictedStripeKey(k);
  if (!probe.ok) return { ok: false, error: probe.error };
  await upsertSource(app, "stripe", { stripeUserId: probe.accountId ?? "restricted-key", restrictedKey: k }, probe.accountId, { via: "restricted_key", livemode: probe.livemode, keyLast4: k.slice(-4) });
  return { ok: true };
}

export async function connectLemonSqueezy(app: App, apiKey: string, storeId: string | null): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!apiKey.trim()) return { ok: false, error: "Paste your Lemon Squeezy API key." };
  if (!(await validateLemonSqueezyKey(apiKey.trim()))) return { ok: false, error: "Lemon Squeezy rejected that key. Create a read-only API key in Settings → API." };
  await upsertSource(app, "lemonsqueezy", { apiKey: apiKey.trim(), storeId: storeId?.trim() || undefined }, storeId?.trim() || null, { keyLast4: apiKey.trim().slice(-4) });
  return { ok: true };
}

export async function connectPaddle(app: App, apiKey: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!apiKey.trim()) return { ok: false, error: "Paste your Paddle API key." };
  if (!(await validatePaddleKey(apiKey.trim()))) return { ok: false, error: "Paddle rejected that key. Create a key with read access to subscriptions and transactions." };
  await upsertSource(app, "paddle", { apiKey: apiKey.trim() }, null, { sandbox: apiKey.includes("sdbx"), keyLast4: apiKey.trim().slice(-4) });
  return { ok: true };
}

export async function connectGa4(app: App, propertyId: string, serviceAccountJson: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const pid = propertyId.trim().replace(/^properties\//, "");
  if (!/^\d+$/.test(pid)) return { ok: false, error: "The GA4 property id is a number (Admin → Property settings)." };
  let parsed: { client_email?: string; private_key?: string };
  try {
    parsed = JSON.parse(serviceAccountJson);
  } catch {
    return { ok: false, error: "Paste the whole service-account JSON file." };
  }
  if (!parsed.client_email || !parsed.private_key) return { ok: false, error: "That JSON has no client_email / private_key — download a service-account key, not an OAuth client." };
  const creds: Ga4Credentials = { propertyId: pid, serviceAccountJson };
  try {
    await ga4Adapter.fetchSignals(creds);
  } catch (err) {
    return { ok: false, error: explainGa4Error(err, parsed.client_email, pid) };
  }
  await upsertSource(app, "ga4", creds, pid, { serviceAccountEmail: parsed.client_email });
  return { ok: true };
}

/** Turn Google's error into the one thing the founder has to do next. */
export function explainGa4Error(err: unknown, serviceAccountEmail: string, propertyId: string): string {
  const status = err instanceof ProviderError ? err.status : undefined;
  const body = err instanceof ProviderError ? (err.body as { error?: { message?: string; status?: string } } | null) : null;
  const google = body?.error?.message ?? "";
  if (/has not been used in project|is disabled|SERVICE_DISABLED|accessNotConfigured/i.test(google)) {
    const project = google.match(/project (\S+?)(?: before|\s|$)/)?.[1];
    return `The Google Analytics Data API is not enabled on the Cloud project${project ? ` ${project}` : ""} that owns this service account. Enable it at console.cloud.google.com/apis/library/analyticsdata.googleapis.com, wait a minute, then try again.`;
  }
  if (status === 403) {
    return `Google says the service account has no access to property ${propertyId}: "${google || "permission denied"}". In Google Analytics open Admin → Property access management and add ${serviceAccountEmail} with the Viewer role (check the property id, too — it is the numeric id under Property details).`;
  }
  if (status === 404) return `Google Analytics has no property with id ${propertyId}. Use the numeric property id from Admin → Property details, not a measurement id (G-…) or account id.`;
  if (status === 401 || /invalid_grant|invalid_client/i.test(google || (err instanceof Error ? err.message : ""))) {
    return `Google rejected the key (${google || "invalid credentials"}). It may have been deleted or the JSON is incomplete — create a new key and paste the whole file.`;
  }
  return `GA4 refused the request: ${err instanceof Error ? err.message : String(err)}${google ? ` — ${google}` : ""}.`;
}

/** Accept a .p8 as pasted from a file, from an env var with escaped newlines, quote-wrapped, or as bare base64. */
export function normalizeP8(raw: string): string {
  const k = raw.trim().replace(/^["']|["']$/g, "").replace(/\\n/g, "\n").trim();
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----\n/.test(k)) return k;
  const b64 = k.replace(/-----(BEGIN|END)[A-Z ]*PRIVATE KEY-----/g, " ").replace(/\s/g, "");
  if (!/^[A-Za-z0-9+/=]{100,}$/.test(b64)) return k;
  return `-----BEGIN PRIVATE KEY-----\n${b64.match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----`;
}

export async function connectGoogleAds(app: App, input: { customerId: string; refreshToken: string; loginCustomerId: string }): Promise<{ ok: true; campaigns: number } | { ok: false; error: string }> {
  const customerId = normalizeCustomerId(input.customerId);
  if (!customerId) return { ok: false, error: `"${input.customerId}" is not a Google Ads customer id. It is ten digits, shown top right in Google Ads, e.g. 123-456-7890.` };
  if (!input.refreshToken.trim()) return { ok: false, error: "A refresh token is required; see the steps above for getting one." };
  const loginCustomerId = input.loginCustomerId.trim() ? normalizeCustomerId(input.loginCustomerId) : null;
  if (input.loginCustomerId.trim() && !loginCustomerId) return { ok: false, error: `"${input.loginCustomerId}" is not a manager account id. Leave it blank unless the account is queried through a manager.` };
  const credentials: GoogleAdsCredentials = { customerId, refreshToken: input.refreshToken.trim(), loginCustomerId };
  const probe = await probeGoogleAds(credentials);
  if (!probe.ok) return probe;
  await upsertSource(app, "googleads", credentials, customerId, {});
  return { ok: true, campaigns: probe.campaigns };
}

/** Spend per campaign from a connected Google Ads account. Fail-soft, like every other read. */
export async function fetchGoogleAdsCampaigns(app: App, now = new Date()): Promise<{ connected: boolean; rows: CampaignAdRow[]; error: string | null; customerId: string | null }> {
  const db = await getDb();
  const [row] = await db.select().from(schema.revenueSources).where(and(eq(schema.revenueSources.appId, app.id), eq(schema.revenueSources.type, "googleads"))).limit(1);
  if (!row) return { connected: false, rows: [], error: null, customerId: null };
  const creds = decryptJson(row.credentialsEnc) as GoogleAdsCredentials;
  if (!googleAdsConfigured()) return { connected: true, rows: [], error: "Google Ads is not configured on this deployment.", customerId: creds.customerId };
  try {
    return { connected: true, rows: await fetchGoogleAdsSpend(creds, INSTALLS_DAYS, now), error: null, customerId: creds.customerId };
  } catch (err) {
    return { connected: true, rows: [], error: explainGoogleAdsError(err, creds.customerId), customerId: creds.customerId };
  }
}

export async function connectAppStore(app: App, input: { issuerId: string; keyId: string; privateKey: string; vendorNumber: string }): Promise<{ ok: true; found: boolean } | { ok: false; error: string }> {
  const issuerId = input.issuerId.trim();
  const keyId = input.keyId.trim();
  const vendorNumber = input.vendorNumber.trim();
  const privateKey = normalizeP8(input.privateKey);
  if (!/^[0-9a-f-]{36}$/i.test(issuerId)) return { ok: false, error: "The issuer id is a UUID (e.g. 57246542-96fe-1a63-e053-0824d011072a), shown at the top of the API keys page." };
  if (!/^[A-Z0-9]{8,12}$/i.test(keyId)) return { ok: false, error: "The key id is the 10-character code on the key's row (e.g. 2X9R4HXF34)." };
  if (!/^\d{6,10}$/.test(vendorNumber)) return { ok: false, error: "The vendor number is an 8-digit number from Sales and Trends → Reports." };
  if (!/BEGIN PRIVATE KEY/.test(privateKey)) return { ok: false, error: "Paste the whole .p8 file, including the -----BEGIN PRIVATE KEY----- and -----END PRIVATE KEY----- lines." };
  const creds: AppStoreCredentials = { issuerId, keyId, privateKey, vendorNumber };
  const probe = await probeAppStore(creds);
  if (!probe.ok) return { ok: false, error: probe.error };
  await upsertSource(app, "appstore", creds, vendorNumber, { keyId });
  return { ok: true, found: probe.found };
}

export async function connectMixpanel(app: App, input: { projectId: string; serviceUser: string; serviceSecret: string; region: string; signupEvent: string; activationEvent: string; visitorEvent: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const projectId = input.projectId.trim();
  if (!/^\d+$/.test(projectId)) return { ok: false, error: "The project id is a number (Project settings → Overview)." };
  if (!input.serviceUser.trim() || !input.serviceSecret.trim()) return { ok: false, error: "Paste the service account username and secret." };
  const region = (["us", "eu", "in"].includes(input.region) ? input.region : "us") as MixpanelCredentials["region"];
  const signupEvent = input.signupEvent.trim();
  if (!signupEvent) return { ok: false, error: "Name the event that means a sign-up (e.g. User Signup)." };
  const creds: MixpanelCredentials = { projectId, serviceUser: input.serviceUser.trim(), serviceSecret: input.serviceSecret.trim(), region, signupEvent, activationEvent: input.activationEvent.trim() || null, visitorEvent: input.visitorEvent.trim() || null };
  const probe = await probeMixpanel(creds);
  if (!probe.ok) return { ok: false, error: `Mixpanel rejected the service account or project: ${probe.error}` };
  const missing = [signupEvent, creds.activationEvent, creds.visitorEvent].filter((e): e is string => typeof e === "string" && e.length > 0 && probe.events.length > 0 && !probe.events.includes(e));
  if (missing.length) return { ok: false, error: `These events don't exist in project ${projectId}: ${missing.join(", ")}. Names are case-sensitive; check Events in Mixpanel.` };
  await upsertSource(app, "mixpanel", creds, projectId, { region, signupEvent });
  return { ok: true };
}

export async function connectPostgres(
  app: App,
  input: { connectionString: string; usersTable: string; usersCreatedAt: string; subsTable: string; subsCustomer: string; subsStartedAt: string; subsEndedAt: string; subsPlan: string; priceMap: string },
): Promise<{ ok: true; signups30d: number; subscriptions: number | null } | { ok: false; error: string }> {
  const connectionString = input.connectionString.trim();
  let host = "";
  try {
    const u = new URL(connectionString);
    if (!/^postgres(ql)?:$/.test(u.protocol)) throw new Error("scheme");
    host = u.hostname;
  } catch {
    return { ok: false, error: "That doesn't look like a Postgres connection string (postgresql://user:password@host:5432/db)." };
  }
  const usersTable = input.usersTable.trim() || "users";
  const usersCreatedAt = input.usersCreatedAt.trim() || "created_at";
  for (const id of [usersTable, usersCreatedAt]) if (!isSqlIdentifier(id)) return { ok: false, error: `"${id}" is not a plain table or column name (lowercase letters, digits, underscores; optional schema prefix).` };
  let subs: PostgresCredentials["subs"] = null;
  if (input.subsTable.trim()) {
    const table = input.subsTable.trim();
    const customer = input.subsCustomer.trim() || "user_id";
    const startedAt = input.subsStartedAt.trim() || "created_at";
    const endedAt = input.subsEndedAt.trim() || null;
    const plan = input.subsPlan.trim() || null;
    for (const id of [table, customer, startedAt, endedAt, plan].filter((x): x is string => Boolean(x))) if (!isSqlIdentifier(id)) return { ok: false, error: `"${id}" is not a plain table or column name.` };
    const priceMap = parsePriceMap(input.priceMap);
    if (!Object.keys(priceMap).length) return { ok: false, error: `Give each plan a price, one per plan, separated by commas: premium=399/week, premium_plus=599/week (cents) or premium=$3.99/week (dollars). Intervals: day, week, month, year.${input.priceMap.trim() ? ` Could not read "${input.priceMap.trim().slice(0, 60)}".` : ""}` };
    subs = { table, customer, startedAt, endedAt, plan, priceMap };
  }
  const creds: PostgresCredentials = { connectionString, usersTable, usersCreatedAt, subs };
  const probe = await probePostgres(creds);
  if (!probe.ok) return { ok: false, error: `The database refused the read: ${probe.error}` };
  await upsertSource(app, "postgres", creds, host, { host, usersTable, hasSubscriptions: Boolean(subs), subsTable: subs?.table ?? null });
  return { ok: true, signups30d: probe.signups30d, subscriptions: probe.subscriptions };
}

export type ExternalRevenue = {
  data: NormalizedRevenueData;
  connected: boolean;
  hasProducts: boolean;
  sourcesUsed: string[];
  errors: Array<{ type: string; message: string }>;
  earliestConnectedAt: Date | null;
};

export async function fetchExternalRevenue(app: App): Promise<ExternalRevenue> {
  const db = await getDb();
  const rows = await db.select().from(schema.revenueSources).where(eq(schema.revenueSources.appId, app.id));
  const parts: NormalizedRevenueData[] = [];
  const sourcesUsed: string[] = [];
  const errors: Array<{ type: string; message: string }> = [];
  let hasProducts = false;
  let connected = false;
  let earliest: Date | null = null;
  for (const row of rows) {
    const type = row.type as SourceType;
    if (!isRevenueSource(row)) continue;
    connected = true;
    if (!earliest || row.connectedAt < earliest) earliest = row.connectedAt;
    const adapter = revenueAdapter(type);
    if (!adapter) continue;
    try {
      const res = await adapter.fetchRevenue(decryptJson(row.credentialsEnc));
      parts.push(res);
      hasProducts = hasProducts || res.hasProducts;
      sourcesUsed.push(type);
      await db.update(schema.revenueSources).set({ lastSyncedAt: new Date(), lastError: null, status: "connected" }).where(eq(schema.revenueSources.id, row.id));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ type, message });
      await db.update(schema.revenueSources).set({ lastError: message, status: "error" }).where(eq(schema.revenueSources.id, row.id));
    }
  }
  return { data: mergeRevenueData(parts), connected, hasProducts, sourcesUsed, errors, earliestConnectedAt: earliest };
}

/** Funnel numbers from every analytics-capable source, merged in ANALYTICS_SOURCE_TYPES order (first non-null wins per field). */
export async function fetchAnalyticsSignals(app: App): Promise<{ signals: Partial<AnalyticsSignals>; used: string[]; errors: Array<{ type: string; message: string }> }> {
  const db = await getDb();
  const rows: RevenueSourceRow[] = await db.select().from(schema.revenueSources).where(eq(schema.revenueSources.appId, app.id));
  const signals: Partial<AnalyticsSignals> = {};
  const used: string[] = [];
  const errors: Array<{ type: string; message: string }> = [];
  for (const type of ANALYTICS_SOURCE_TYPES) {
    const row = rows.find((r) => r.type === type);
    const adapter = analyticsAdapter(type);
    if (!row || !adapter) continue;
    try {
      const part = await adapter.fetchSignals(decryptJson(row.credentialsEnc), new Date(), { events: parseEventSettings(row.meta) });
      for (const key of ["visitors30d", "signups30d", "checkoutViews30d", "activations30d", "installs30d"] as const) {
        if (signals[key] == null && part[key] != null) signals[key] = part[key];
      }
      used.push(type);
      if (!isRevenueSource(row)) await db.update(schema.revenueSources).set({ lastSyncedAt: new Date(), lastError: null, status: "connected" }).where(eq(schema.revenueSources.id, row.id));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ type, message });
      await db.update(schema.revenueSources).set({ lastError: message, status: "error" }).where(eq(schema.revenueSources.id, row.id));
    }
  }
  return { signals, used, errors };
}

export const INSTALLS_DAYS = 30;

/** App installs from a connected GA4 property (Firebase `first_open`), bucketed by channel. Fail-soft: never throws. */
export async function fetchInstalls(app: App): Promise<{ connected: boolean; rows: InstallsByChannel[]; total: number; days: number; error: string | null }> {
  const db = await getDb();
  const [row] = await db.select().from(schema.revenueSources).where(and(eq(schema.revenueSources.appId, app.id), eq(schema.revenueSources.type, "ga4"))).limit(1);
  if (!row) return { connected: false, rows: [], total: 0, days: INSTALLS_DAYS, error: null };
  try {
    const creds = decryptJson(row.credentialsEnc) as Ga4Credentials;
    const rows = aggregateInstalls(await fetchGa4Installs(creds, INSTALLS_DAYS, { events: parseEventSettings(row.meta) }));
    return { connected: true, rows, total: rows.reduce((n, r) => n + r.installs, 0), days: INSTALLS_DAYS, error: null };
  } catch (err) {
    return { connected: true, rows: [], total: 0, days: INSTALLS_DAYS, error: ga4ErrorText(err) };
  }
}

/** Ad spend + attributed funnel events per Google Ads campaign from a connected GA4 property. Fail-soft: never throws. */
export type CampaignsRead = {
  connected: boolean;
  ads: CampaignAdRow[];
  events: CampaignEventRow[];
  scope: CampaignScope | null;
  days: number;
  error: string | null;
  /** What was asked, so an empty answer can be explained: which property, from when, under which event settings. */
  propertyId: string | null;
  from: Date | null;
  eventSettings: EventSettings | null;
  /** What GA4 said about any ad-cost request it refused. Never fatal — the funnel still renders. */
  notes: AdReadNote[];
};

export async function fetchCampaigns(app: App, now = new Date()): Promise<CampaignsRead> {
  const db = await getDb();
  const [row] = await db.select().from(schema.revenueSources).where(and(eq(schema.revenueSources.appId, app.id), eq(schema.revenueSources.type, "ga4"))).limit(1);
  const empty: CampaignsRead = { connected: false, ads: [], events: [], scope: null, days: INSTALLS_DAYS, error: null, propertyId: null, from: null, eventSettings: null, notes: [] };
  if (!row) return empty;
  const eventSettings = parseEventSettings(row.meta);
  const from = readFrom(eventSettings, INSTALLS_DAYS, now);
  try {
    const creds = decryptJson(row.credentialsEnc) as Ga4Credentials;
    const { ads, events, scope, notes } = await fetchGa4Campaigns(creds, INSTALLS_DAYS, { events: eventSettings }, now);
    return { ...empty, connected: true, ads, events, scope, notes, propertyId: creds.propertyId, from, eventSettings };
  } catch (err) {
    return { ...empty, connected: true, error: ga4ErrorText(err), propertyId: row.externalId, from, eventSettings };
  }
}

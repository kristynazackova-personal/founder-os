import { and, eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import type { App, RevenueSource } from "../db/schema";
import { decryptJson, encryptJson } from "../crypto";
import { mergeRevenueData, type AnalyticsSignals, type NormalizedRevenueData } from "../domain/metrics";
import { revenueAdapter, REVENUE_SOURCE_TYPES, type Ga4Credentials, type SourceType } from "../sources";
import { ProviderError } from "../checkout/provider";
import { ga4Adapter } from "../sources/ga4";
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
  await db
    .insert(schema.revenueSources)
    .values({ appId: app.id, type, credentialsEnc, externalId, meta, status: "connected" })
    .onConflictDoUpdate({ target: [schema.revenueSources.appId, schema.revenueSources.type], set: { credentialsEnc, externalId, meta, status: "connected", lastError: null, connectedAt: new Date() } });
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
    if (!REVENUE_SOURCE_TYPES.includes(type)) continue;
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

export async function fetchGa4Signals(app: App): Promise<{ signals: Partial<AnalyticsSignals> | null; error: string | null }> {
  const db = await getDb();
  const [row] = await db.select().from(schema.revenueSources).where(and(eq(schema.revenueSources.appId, app.id), eq(schema.revenueSources.type, "ga4"))).limit(1);
  if (!row) return { signals: null, error: null };
  try {
    const signals = await ga4Adapter.fetchSignals(decryptJson(row.credentialsEnc));
    await db.update(schema.revenueSources).set({ lastSyncedAt: new Date(), lastError: null, status: "connected" }).where(eq(schema.revenueSources.id, row.id));
    return { signals, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.update(schema.revenueSources).set({ lastError: message, status: "error" }).where(eq(schema.revenueSources.id, row.id));
    return { signals: null, error: message };
  }
}

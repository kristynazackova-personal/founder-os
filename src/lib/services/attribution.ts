import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { getDb, schema } from "../db";
import type { App } from "../db/schema";
import { aggregateByChannel, ATTRIBUTION_EVENTS, classifyChannel, type AttributionEventName, type Channel, type ChannelReport, type SourceInfo, type VisitorRow } from "../domain/attribution";
import type { AnalyticsSignals } from "../domain/metrics";
import { track } from "../track";

const DAY_MS = 86_400_000;

export type CollectPayload = {
  anonId: string;
  event: AttributionEventName;
  source?: SourceInfo;
  path?: string | null;
  props?: Record<string, unknown>;
};

export function parseCollectPayload(input: unknown): CollectPayload | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const anonId = typeof o.anonId === "string" ? o.anonId.slice(0, 64) : "";
  const event = typeof o.event === "string" ? o.event : "";
  if (!anonId || !ATTRIBUTION_EVENTS.includes(event as AttributionEventName)) return null;
  const src = (o.source && typeof o.source === "object" ? o.source : {}) as Record<string, unknown>;
  const s = (k: string, max = 200) => (typeof src[k] === "string" ? (src[k] as string).slice(0, max) : null);
  const props = o.props && typeof o.props === "object" ? (o.props as Record<string, unknown>) : undefined;
  return {
    anonId,
    event: event as AttributionEventName,
    source: { utmSource: s("utmSource"), utmMedium: s("utmMedium"), utmCampaign: s("utmCampaign"), referrer: s("referrer", 500), landingPath: s("landingPath") },
    path: typeof o.path === "string" ? o.path.slice(0, 300) : null,
    props: props ? Object.fromEntries(Object.entries(props).slice(0, 10)) : undefined,
  };
}

/** The channel a visitor is attributed to: their first recorded touch. */
async function firstTouchChannel(appId: string, anonId: string): Promise<Channel | null> {
  const db = await getDb();
  const [first] = await db
    .select({ channel: schema.attributionEvents.channel })
    .from(schema.attributionEvents)
    .where(and(eq(schema.attributionEvents.appId, appId), eq(schema.attributionEvents.anonId, anonId)))
    .orderBy(asc(schema.attributionEvents.occurredAt))
    .limit(1);
  return (first?.channel as Channel | undefined) ?? null;
}

export async function ingestCollect(app: App, p: CollectPayload): Promise<void> {
  const db = await getDb();
  const channel = (await firstTouchChannel(app.id, p.anonId)) ?? classifyChannel(p.source ?? {});
  await db.insert(schema.attributionEvents).values({
    appId: app.id,
    anonId: p.anonId,
    event: p.event,
    channel,
    utmSource: p.source?.utmSource ?? null,
    utmMedium: p.source?.utmMedium ?? null,
    utmCampaign: p.source?.utmCampaign ?? null,
    referrer: p.source?.referrer ?? null,
    path: p.path ?? p.source?.landingPath ?? null,
    props: p.event === "purchase" ? { ...(p.props ?? {}), reportedBy: "client" } : (p.props ?? null),
  });
  if (!app.snippetInstalledAt) {
    await db.update(schema.apps).set({ snippetInstalledAt: new Date() }).where(eq(schema.apps.id, app.id));
    await track("snippet_installed", { userId: app.userId, appId: app.id });
  }
}

/** Server-side events (checkout view on the hosted pay page, purchase from a webhook). */
export async function recordServerEvent(appId: string, anonId: string, event: "checkout_view" | "purchase", extra: { purchaseId?: string | null; props?: Record<string, unknown> } = {}): Promise<void> {
  const db = await getDb();
  const channel = (await firstTouchChannel(appId, anonId)) ?? "direct";
  await db.insert(schema.attributionEvents).values({ appId, anonId, event, channel, purchaseId: extra.purchaseId ?? null, props: extra.props ?? null });
}

export async function snippetSignals(appId: string, now = new Date()): Promise<AnalyticsSignals & { hasAny: boolean }> {
  const db = await getDb();
  const since = new Date(now.getTime() - 30 * DAY_MS);
  const rows = await db
    .select({ anonId: schema.attributionEvents.anonId, event: schema.attributionEvents.event })
    .from(schema.attributionEvents)
    .where(and(eq(schema.attributionEvents.appId, appId), gt(schema.attributionEvents.occurredAt, since)));
  if (rows.length === 0) return { hasAny: false, signups30d: null, visitors30d: null, checkoutViews30d: null, activations30d: null };
  const by = (ev: string) => new Set(rows.filter((r) => r.event === ev).map((r) => r.anonId)).size;
  return { hasAny: true, visitors30d: new Set(rows.map((r) => r.anonId)).size, signups30d: by("signup"), checkoutViews30d: by("checkout_view"), activations30d: by("activation") };
}

export async function channelReport(appId: string, days = 90, now = new Date()): Promise<{ rows: ChannelReport[]; visitors: number; since: Date }> {
  const db = await getDb();
  const since = new Date(now.getTime() - days * DAY_MS);
  const events = await db
    .select({ anonId: schema.attributionEvents.anonId, event: schema.attributionEvents.event, channel: schema.attributionEvents.channel, purchaseId: schema.attributionEvents.purchaseId, occurredAt: schema.attributionEvents.occurredAt })
    .from(schema.attributionEvents)
    .where(and(eq(schema.attributionEvents.appId, appId), gt(schema.attributionEvents.occurredAt, since)))
    .orderBy(asc(schema.attributionEvents.occurredAt));
  const purchaseIds = [...new Set(events.map((e) => e.purchaseId).filter((id): id is string => Boolean(id)))];
  const purchaseRows = purchaseIds.length
    ? await db.select({ id: schema.purchases.id, amountCents: schema.purchases.amountCents, mode: schema.purchases.mode, refundedAt: schema.purchases.refundedAt }).from(schema.purchases).where(inArray(schema.purchases.id, purchaseIds))
    : [];
  const purchaseById = new Map(purchaseRows.map((p) => [p.id, p]));

  const visitors = new Map<string, VisitorRow & { purchaseAt: Date | null; pageviews: Date[] }>();
  for (const e of events) {
    let v = visitors.get(e.anonId);
    if (!v) {
      v = { anonId: e.anonId, channel: e.channel as Channel, events: new Set(), revenueCents: 0, purchaseAt: null, pageviews: [] };
      visitors.set(e.anonId, v);
    }
    v.events.add(e.event as AttributionEventName);
    if (e.event === "pageview") v.pageviews.push(e.occurredAt);
    if (e.event === "purchase") {
      v.purchaseAt = v.purchaseAt ?? e.occurredAt;
      const p = e.purchaseId ? purchaseById.get(e.purchaseId) : null;
      if (p && p.mode === "live" && !p.refundedAt) v.revenueCents += p.amountCents;
    }
  }
  // 30-day return: a pageview between 1 and 30 days after the first purchase.
  for (const v of visitors.values()) {
    if (v.purchaseAt && v.pageviews.some((t) => t.getTime() - v.purchaseAt!.getTime() > DAY_MS && t.getTime() - v.purchaseAt!.getTime() <= 30 * DAY_MS)) v.events.add("return");
  }
  return { rows: aggregateByChannel(visitors.values()), visitors: visitors.size, since };
}

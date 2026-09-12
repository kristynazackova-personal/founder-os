import { and, eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import { getProvider, isProviderName, WebhookVerificationError, type WebhookEvent } from "../checkout";
import { platformFeeCents } from "../domain/money";
import { crossedUnlockThreshold } from "../domain/billing";
import { track } from "../track";
import { recordServerEvent } from "./attribution";
import { lifetimeWrappedRevenueCents } from "./checkout";

export type WebhookOutcome = { status: number; body: { ok: boolean; processed?: number; skipped?: number; error?: string } };

/** The one ingest path for every checkout provider: verify → dedupe → apply. */
export async function handleCheckoutWebhook(providerName: string, rawBody: string, headers: Headers): Promise<WebhookOutcome> {
  if (!isProviderName(providerName)) return { status: 404, body: { ok: false, error: "unknown provider" } };
  const provider = getProvider(providerName);
  let events: WebhookEvent[];
  try {
    events = await provider.parseWebhook(rawBody, headers);
  } catch (err) {
    if (err instanceof WebhookVerificationError) return { status: 400, body: { ok: false, error: `signature: ${err.message}` } };
    return { status: 400, body: { ok: false, error: `malformed: ${err instanceof Error ? err.message : String(err)}` } };
  }
  const db = await getDb();
  let processed = 0;
  let skipped = 0;
  for (const event of events) {
    const [row] = await db
      .insert(schema.webhookEvents)
      .values({ provider: providerName, externalId: event.id, type: event.type === "ignored" ? event.rawType : event.type, payload: event as unknown as Record<string, unknown> })
      .onConflictDoNothing()
      .returning({ id: schema.webhookEvents.id });
    if (!row) {
      skipped += 1;
      continue;
    }
    try {
      await applyEvent(providerName, event);
      await db.update(schema.webhookEvents).set({ processedAt: new Date() }).where(eq(schema.webhookEvents.id, row.id));
      processed += 1;
    } catch (err) {
      await db.update(schema.webhookEvents).set({ error: err instanceof Error ? err.message : String(err) }).where(eq(schema.webhookEvents.id, row.id));
      // Let the provider retry: unlink the dedupe row.
      await db.delete(schema.webhookEvents).where(eq(schema.webhookEvents.id, row.id));
      return { status: 500, body: { ok: false, error: "processing failed" } };
    }
  }
  return { status: 200, body: { ok: true, processed, skipped } };
}

type Resolved = { appId: string; planId: string | null; sessionId: string | null; anonId: string | null };

async function resolveTarget(provider: string, meta: Record<string, string>, productId: string | null): Promise<Resolved | null> {
  const db = await getDb();
  let planId: string | null = null;
  let appId: string | null = null;
  let anonId: string | null = meta.fos_anon_id || null;
  let sessionId: string | null = meta.fos_checkout_session_id || null;

  if (sessionId) {
    const [s] = await db.select().from(schema.checkoutSessions).where(eq(schema.checkoutSessions.id, sessionId)).limit(1);
    if (s) {
      planId = s.planId;
      appId = s.appId;
      anonId = anonId ?? s.anonId;
    } else sessionId = null;
  }
  if (!planId && meta.fos_plan_id) {
    const [p] = await db.select().from(schema.plans).where(eq(schema.plans.id, meta.fos_plan_id)).limit(1);
    if (p) {
      planId = p.id;
      appId = p.appId;
    }
  }
  if (!planId && productId) {
    const [p] = await db.select().from(schema.plans).where(and(eq(schema.plans.provider, provider), eq(schema.plans.providerProductId, productId))).limit(1);
    if (p) {
      planId = p.id;
      appId = p.appId;
    }
  }
  if (!appId && meta.fos_app_id) appId = meta.fos_app_id;
  if (!appId) return null;
  return { appId, planId, sessionId, anonId };
}

async function applyEvent(provider: string, event: WebhookEvent): Promise<void> {
  const db = await getDb();
  switch (event.type) {
    case "ignored":
      return;

    case "payment_succeeded": {
      const target = await resolveTarget(provider, event.metadata, event.productId);
      if (!target) throw new Error(`payment ${event.paymentId}: no app resolved from metadata`);
      const [prior] = event.subscriptionId
        ? await db.select({ id: schema.purchases.id }).from(schema.purchases).where(and(eq(schema.purchases.provider, provider), eq(schema.purchases.providerSubscriptionId, event.subscriptionId))).limit(1)
        : [];
      const kind = event.subscriptionId ? (prior ? "renewal" : "subscription") : "one_time";
      const fee = platformFeeCents(event.amountCents);
      const [purchase] = await db
        .insert(schema.purchases)
        .values({
          appId: target.appId,
          planId: target.planId,
          provider,
          providerPaymentId: event.paymentId,
          providerSubscriptionId: event.subscriptionId,
          providerCustomerId: event.customerId,
          customerEmail: event.customerEmail,
          kind,
          amountCents: event.amountCents,
          currency: event.currency,
          feeCents: fee,
          netCents: event.amountCents - fee,
          mode: event.mode,
          anonId: target.anonId,
          occurredAt: event.occurredAt,
          raw: event as unknown as Record<string, unknown>,
        })
        .onConflictDoNothing()
        .returning();
      if (!purchase) return; // duplicate payment id

      if (target.sessionId) await db.update(schema.checkoutSessions).set({ status: "completed", completedAt: new Date() }).where(eq(schema.checkoutSessions.id, target.sessionId));
      if (target.anonId) await recordServerEvent(target.appId, target.anonId, "purchase", { purchaseId: purchase.id, props: { amountCents: event.amountCents, mode: event.mode } });

      if (event.mode === "live") {
        const [app] = await db.select().from(schema.apps).where(eq(schema.apps.id, target.appId)).limit(1);
        if (app && !app.firstPurchaseAt) {
          await db.update(schema.apps).set({ firstPurchaseAt: event.occurredAt }).where(eq(schema.apps.id, app.id));
          await track("first_purchase", { userId: app.userId, appId: app.id, props: { amountCents: event.amountCents, kind } });
        }
        if (app) {
          const after = await lifetimeWrappedRevenueCents(app.userId);
          if (crossedUnlockThreshold(after - event.amountCents, after)) {
            await db.update(schema.users).set({ planUnlockedAt: new Date() }).where(eq(schema.users.id, app.userId));
            await track("plan_unlocked", { userId: app.userId, appId: app.id, props: { lifetimeCents: after } });
          }
        }
      }
      return;
    }

    case "subscription_active": {
      const target = await resolveTarget(provider, event.metadata, event.productId);
      if (!target) throw new Error(`subscription ${event.subscriptionId}: no app resolved from metadata`);
      await db
        .insert(schema.wrappedSubscriptions)
        .values({
          appId: target.appId,
          planId: target.planId,
          provider,
          providerSubscriptionId: event.subscriptionId,
          providerCustomerId: event.customerId,
          customerEmail: event.customerEmail,
          amountCents: event.amountCents,
          currency: event.currency,
          interval: event.interval,
          status: "active",
          mode: event.mode,
          anonId: target.anonId,
          startedAt: event.startedAt,
        })
        .onConflictDoUpdate({
          target: [schema.wrappedSubscriptions.provider, schema.wrappedSubscriptions.providerSubscriptionId],
          set: { status: "active", amountCents: event.amountCents, currency: event.currency, interval: event.interval, canceledAt: null },
        });
      return;
    }

    case "subscription_canceled":
      await db
        .update(schema.wrappedSubscriptions)
        .set({ status: "canceled", canceledAt: event.canceledAt })
        .where(and(eq(schema.wrappedSubscriptions.provider, provider), eq(schema.wrappedSubscriptions.providerSubscriptionId, event.subscriptionId)));
      return;

    case "refund":
      await db.update(schema.purchases).set({ refundedAt: new Date() }).where(and(eq(schema.purchases.provider, provider), eq(schema.purchases.providerPaymentId, event.paymentId)));
      return;
  }
}

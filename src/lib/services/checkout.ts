import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "../db";
import type { App, Plan, Purchase, WrappedSubscription } from "../db/schema";
import { shortId } from "../crypto";
import { env } from "../env";
import type { NormalizedRevenueData } from "../domain/metrics";
import { getProvider, type CheckoutMode } from "../checkout";
import { track } from "../track";
import { effectiveRecommendation, getInterview } from "./pricing";
import { recordServerEvent } from "./attribution";

export async function listPlans(appId: string, mode?: CheckoutMode): Promise<Plan[]> {
  const db = await getDb();
  const where = mode ? and(eq(schema.plans.appId, appId), eq(schema.plans.mode, mode), eq(schema.plans.active, true)) : and(eq(schema.plans.appId, appId), eq(schema.plans.active, true));
  return db.select().from(schema.plans).where(where).orderBy(desc(schema.plans.createdAt));
}

export async function hasLivePlans(appId: string): Promise<boolean> {
  return (await listPlans(appId, "live")).length > 0;
}

export function checkoutUrl(plan: Plan): string {
  return `${env.appUrl}/pay/${plan.slug}`;
}

export function embedButtonHtml(plan: Plan): string {
  const label = plan.model === "one_time" ? "Buy now" : "Start now";
  return `<a href="${checkoutUrl(plan)}" data-fos-checkout="${plan.slug}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#111827;color:#fff;text-decoration:none;font-weight:600">${label} · ${plan.name}</a>`;
}

/**
 * Turn the pricing recommendation into live products at the provider and
 * `plans` rows. Existing active plans for the mode are retired first so the
 * pricing page always points at one set.
 */
export async function createPlansFromPricing(app: App, mode: CheckoutMode): Promise<{ ok: true; plans: Plan[] } | { ok: false; error: string }> {
  const interview = await getInterview(app.id);
  if (!interview?.completedAt) return { ok: false, error: "Finish the pricing interview first - checkout is built from it." };
  const rec = effectiveRecommendation(interview);
  const provider = getProvider();
  const db = await getDb();

  const created: Array<typeof schema.plans.$inferInsert> = [];
  try {
    for (const tier of rec.tiers) {
      const model = rec.model === "one_time" ? "one_time" : "subscription";
      const variants: Array<{ interval: "month" | "year" | null; amountCents: number; suffix: string }> =
        model === "one_time"
          ? [{ interval: null, amountCents: tier.priceCents, suffix: "" }]
          : [{ interval: "month", amountCents: tier.priceCents, suffix: " (monthly)" }, ...(tier.yearlyPriceCents ? [{ interval: "year" as const, amountCents: tier.yearlyPriceCents, suffix: " (yearly)" }] : [])];
      for (const v of variants) {
        const name = `${app.name} - ${tier.name}${v.suffix}`;
        const res = await provider.createProduct({ name, model, interval: v.interval, amountCents: v.amountCents, currency: rec.currency, mode, metadata: { fos_app_id: app.id, fos_tier: tier.key, fos_mode: mode } });
        created.push({ appId: app.id, slug: shortId(10), tierKey: tier.key, name: `${tier.name}${v.suffix}`, model, interval: v.interval, amountCents: v.amountCents, currency: rec.currency, mode, provider: provider.name, providerProductId: res.productId, providerPriceId: res.priceId });
      }
    }
  } catch (err) {
    return { ok: false, error: `The payment provider refused to create products: ${err instanceof Error ? err.message : String(err)}` };
  }

  const hadAny = (await listPlans(app.id)).length > 0;
  const hadLive = await hasLivePlans(app.id);
  await db.update(schema.plans).set({ active: false }).where(and(eq(schema.plans.appId, app.id), eq(schema.plans.mode, mode)));
  const plans = await db.insert(schema.plans).values(created).returning();
  if (!hadAny) await track("checkout_enabled", { userId: app.userId, appId: app.id, props: { mode, provider: provider.name } });
  if (mode === "live" && !hadLive) await track("checkout_live", { userId: app.userId, appId: app.id, props: { provider: provider.name } });
  return { ok: true, plans };
}

export async function setCheckoutMode(app: App, mode: CheckoutMode): Promise<void> {
  const db = await getDb();
  await db.update(schema.apps).set({ checkoutMode: mode }).where(eq(schema.apps.id, app.id));
}

export async function planBySlug(slug: string): Promise<{ plan: Plan; app: App } | null> {
  const db = await getDb();
  const [row] = await db.select({ plan: schema.plans, app: schema.apps }).from(schema.plans).innerJoin(schema.apps, eq(schema.apps.id, schema.plans.appId)).where(eq(schema.plans.slug, slug)).limit(1);
  return row ?? null;
}

/** Create a provider checkout session for a hosted link visit. */
export async function startCheckout(plan: Plan, app: App, opts: { anonId: string | null; email: string | null }): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!plan.active) return { ok: false, error: "This plan is no longer available." };
  const db = await getDb();
  const provider = getProvider(plan.provider as "dodo" | "polar" | "mock");
  const [session] = await db.insert(schema.checkoutSessions).values({ appId: app.id, planId: plan.id, anonId: opts.anonId, provider: provider.name, mode: plan.mode as CheckoutMode }).returning();
  try {
    const res = await provider.createCheckout({
      productId: plan.providerProductId ?? "",
      priceId: plan.providerPriceId,
      mode: plan.mode as CheckoutMode,
      successUrl: `${env.appUrl}/pay/success?s=${session.id}`,
      customerEmail: opts.email ?? undefined,
      metadata: { fos_app_id: app.id, fos_plan_id: plan.id, fos_checkout_session_id: session.id, fos_anon_id: opts.anonId ?? "", fos_mode: plan.mode },
    });
    await db.update(schema.checkoutSessions).set({ providerSessionId: res.sessionId }).where(eq(schema.checkoutSessions.id, session.id));
    return { ok: true, url: res.url };
  } catch (err) {
    await db.update(schema.checkoutSessions).set({ status: "failed" }).where(eq(schema.checkoutSessions.id, session.id));
    return { ok: false, error: `Could not start checkout: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function recordCheckoutView(app: App, anonId: string | null): Promise<void> {
  if (!anonId) return;
  await recordServerEvent(app.id, anonId, "checkout_view");
}

export async function listPurchases(appId: string, limit = 50): Promise<Purchase[]> {
  const db = await getDb();
  return db.select().from(schema.purchases).where(eq(schema.purchases.appId, appId)).orderBy(desc(schema.purchases.occurredAt)).limit(limit);
}

export async function listWrappedSubscriptions(appId: string): Promise<WrappedSubscription[]> {
  const db = await getDb();
  return db.select().from(schema.wrappedSubscriptions).where(eq(schema.wrappedSubscriptions.appId, appId)).orderBy(desc(schema.wrappedSubscriptions.startedAt));
}

/** Live wrapped-checkout activity as a revenue source for the diagnosis. */
export async function wrappedRevenueData(appId: string): Promise<{ data: NormalizedRevenueData; hasAny: boolean }> {
  const db = await getDb();
  const [subs, purchases] = await Promise.all([
    db.select().from(schema.wrappedSubscriptions).where(and(eq(schema.wrappedSubscriptions.appId, appId), eq(schema.wrappedSubscriptions.mode, "live"))),
    db.select().from(schema.purchases).where(and(eq(schema.purchases.appId, appId), eq(schema.purchases.mode, "live"))),
  ]);
  const data: NormalizedRevenueData = {
    subscriptions: subs.map((s) => ({
      id: s.providerSubscriptionId,
      customerId: s.providerCustomerId ?? s.customerEmail ?? s.providerSubscriptionId,
      amountCents: s.amountCents,
      currency: s.currency,
      interval: s.interval as "month" | "year" | "week" | "day",
      intervalCount: 1,
      status: s.status === "canceled" ? "canceled" : "active",
      startedAt: s.startedAt,
      canceledAt: s.canceledAt,
    })),
    charges: purchases.map((p) => ({ id: p.providerPaymentId, customerId: p.providerCustomerId ?? p.customerEmail ?? p.providerPaymentId, amountCents: p.amountCents, currency: p.currency, occurredAt: p.occurredAt, refunded: Boolean(p.refundedAt) })),
    dataSince: null,
  };
  return { data, hasAny: subs.length > 0 || purchases.length > 0 };
}

/** Lifetime live revenue through wrapped checkout across every app of a founder (refunds excluded). */
export async function lifetimeWrappedRevenueCents(userId: string): Promise<number> {
  const db = await getDb();
  const appIds = (await db.select({ id: schema.apps.id }).from(schema.apps).where(eq(schema.apps.userId, userId))).map((a) => a.id);
  if (appIds.length === 0) return 0;
  const rows = await db
    .select({ amountCents: schema.purchases.amountCents, refundedAt: schema.purchases.refundedAt })
    .from(schema.purchases)
    .where(and(inArray(schema.purchases.appId, appIds), eq(schema.purchases.mode, "live")));
  return rows.reduce((sum, r) => sum + (r.refundedAt ? 0 : r.amountCents), 0);
}

import { eq, inArray } from "drizzle-orm";
import Stripe from "stripe";
import { getDb, schema } from "../db";
import type { User } from "../db/schema";
import { env } from "../env";
import { billingState, type BillingState } from "../domain/billing";
import { REVENUE_SOURCE_TYPES } from "../sources";
import { lifetimeWrappedRevenueCents } from "./checkout";

export async function getBillingState(user: User): Promise<BillingState & { lifetimeWrappedRevenueCents: number }> {
  const db = await getDb();
  const lifetime = await lifetimeWrappedRevenueCents(user.id);
  const appIds = (await db.select({ id: schema.apps.id }).from(schema.apps).where(eq(schema.apps.userId, user.id))).map((a) => a.id);
  let connectedSince: Date | null = null;
  if (appIds.length) {
    // The first REVENUE source starts the trial (GA4 does not).
    const rows = await db.select({ type: schema.revenueSources.type, connectedAt: schema.revenueSources.connectedAt }).from(schema.revenueSources).where(inArray(schema.revenueSources.appId, appIds));
    connectedSince = rows.filter((r) => REVENUE_SOURCE_TYPES.includes(r.type as (typeof REVENUE_SOURCE_TYPES)[number])).map((r) => r.connectedAt).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  }
  const state = billingState({ lifetimeWrappedRevenueCents: lifetime, connectedSourceSince: connectedSince, subscriptionActive: user.subscriptionActive });
  return { ...state, lifetimeWrappedRevenueCents: lifetime };
}

export function billingConfigured(): boolean {
  return Boolean(env.stripeSecretKey && (env.stripePriceWrapped39 || env.stripePriceConnected29));
}

/** Stripe Checkout for the founder's own Founder OS subscription. */
export async function createBillingCheckout(user: User, state: BillingState): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!env.stripeSecretKey) return { ok: false, error: "Billing isn't configured on this deployment (STRIPE_SECRET_KEY)." };
  const price = state.planCents === 2_900 ? env.stripePriceConnected29 : env.stripePriceWrapped39;
  if (!price) return { ok: false, error: "Billing isn't configured on this deployment (missing Stripe price id)." };
  const stripe = new Stripe(env.stripeSecretKey);
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price, quantity: 1 }],
      customer: user.stripeCustomerId ?? undefined,
      customer_email: user.stripeCustomerId ? undefined : user.email,
      client_reference_id: user.id,
      success_url: `${env.appUrl}/billing?success=1`,
      cancel_url: `${env.appUrl}/billing`,
      metadata: { fos_user_id: user.id },
    });
    if (!session.url) return { ok: false, error: "Stripe returned no checkout URL." };
    return { ok: true, url: session.url };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function handleBillingWebhook(rawBody: string, signature: string | null): Promise<{ status: number; body: unknown }> {
  if (!env.stripeSecretKey || !env.stripeWebhookSecret) return { status: 400, body: { error: "billing webhook not configured" } };
  if (!signature) return { status: 400, body: { error: "missing signature" } };
  const stripe = new Stripe(env.stripeSecretKey);
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, env.stripeWebhookSecret);
  } catch (err) {
    return { status: 400, body: { error: `signature: ${err instanceof Error ? err.message : String(err)}` } };
  }
  const db = await getDb();
  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object;
      const userId = s.metadata?.fos_user_id ?? s.client_reference_id;
      if (userId && s.mode === "subscription") {
        await db
          .update(schema.users)
          .set({ stripeCustomerId: typeof s.customer === "string" ? s.customer : (s.customer?.id ?? null), stripeSubscriptionId: typeof s.subscription === "string" ? s.subscription : (s.subscription?.id ?? null), subscriptionActive: true })
          .where(eq(schema.users.id, userId));
      }
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object;
      await db.update(schema.users).set({ subscriptionActive: false }).where(eq(schema.users.stripeSubscriptionId, sub.id));
      break;
    }
    case "customer.subscription.updated": {
      const sub = event.data.object;
      const active = sub.status === "active" || sub.status === "trialing";
      await db.update(schema.users).set({ subscriptionActive: active }).where(eq(schema.users.stripeSubscriptionId, sub.id));
      break;
    }
  }
  return { status: 200, body: { received: true } };
}

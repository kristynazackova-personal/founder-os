import Stripe from "stripe";
import { env } from "../env";
import type { NormalizedCharge, NormalizedRevenueData, NormalizedSubscription } from "../domain/metrics";
import type { RevenueAdapter, StripeCredentials } from "./types";
import { toInterval } from "./types";

/**
 * Stripe read-only, via Connect OAuth (scope `read_only`). The platform key
 * acts on the founder's account with the `Stripe-Account` header; we never
 * store a founder's secret key.
 */
const LOOKBACK_DAYS = 180;
const PAGE_CAP = 10; // 10 pages × 100 = 1,000 objects per list, plenty for stage 0–3

export function getStripe(): Stripe {
  if (!env.stripeSecretKey) throw new Error("STRIPE_SECRET_KEY is not set");
  return new Stripe(env.stripeSecretKey);
}

export function stripeOAuthUrl(state: string, redirectUri: string): string {
  const u = new URL("https://connect.stripe.com/oauth/authorize");
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", env.stripeConnectClientId);
  u.searchParams.set("scope", "read_only");
  u.searchParams.set("state", state);
  u.searchParams.set("redirect_uri", redirectUri);
  return u.toString();
}

export async function exchangeStripeCode(code: string): Promise<StripeCredentials> {
  const res = await getStripe().oauth.token({ grant_type: "authorization_code", code });
  if (!res.stripe_user_id) throw new Error("Stripe did not return an account id");
  return { stripeUserId: res.stripe_user_id, accessToken: res.access_token, refreshToken: res.refresh_token };
}

type SubLike = {
  id: string;
  customer: string | { id: string };
  status: string;
  created: number;
  start_date?: number;
  canceled_at?: number | null;
  ended_at?: number | null;
  items: { data: Array<{ quantity?: number | null; price: { unit_amount: number | null; currency: string; recurring: { interval: string; interval_count: number } | null } }> };
};
type ChargeLike = { id: string; customer: string | { id: string } | null; amount: number; currency: string; created: number; paid: boolean; refunded: boolean; status: string };

const STATUS: Record<string, NormalizedSubscription["status"]> = {
  active: "active",
  trialing: "trialing",
  past_due: "past_due",
  canceled: "canceled",
  unpaid: "past_due",
  paused: "paused",
  incomplete: "incomplete",
  incomplete_expired: "incomplete",
};

function custId(c: string | { id: string } | null): string {
  return typeof c === "string" ? c : (c?.id ?? "anon");
}

export function normalizeStripe(subs: SubLike[], charges: ChargeLike[]): NormalizedRevenueData {
  const subscriptions: NormalizedSubscription[] = subs.map((s) => {
    const item = s.items.data[0];
    const qty = item?.quantity ?? 1;
    const rec = item?.price.recurring;
    return {
      id: s.id,
      customerId: custId(s.customer),
      amountCents: (item?.price.unit_amount ?? 0) * qty,
      currency: item?.price.currency ?? "usd",
      interval: toInterval(rec?.interval),
      intervalCount: rec?.interval_count ?? 1,
      status: STATUS[s.status] ?? "active",
      startedAt: new Date((s.start_date ?? s.created) * 1000),
      canceledAt: s.ended_at ? new Date(s.ended_at * 1000) : s.status === "canceled" && s.canceled_at ? new Date(s.canceled_at * 1000) : null,
    };
  });
  const normalizedCharges: NormalizedCharge[] = charges
    .filter((c) => c.paid && c.status === "succeeded")
    .map((c) => ({ id: c.id, customerId: custId(c.customer), amountCents: c.amount, currency: c.currency, occurredAt: new Date(c.created * 1000), refunded: c.refunded }));
  return { subscriptions, charges: normalizedCharges, dataSince: null };
}

/** Only restricted keys are accepted from founders; a secret key would grant far more than reading. */
export function isRestrictedStripeKey(key: string): boolean {
  return /^rk_(live|test)_[A-Za-z0-9]+$/.test(key.trim());
}

/** Validate a restricted key by reading one subscription; returns the account id when the key may read it. */
export async function probeRestrictedStripeKey(key: string): Promise<{ ok: true; accountId: string | null; livemode: boolean } | { ok: false; error: string }> {
  const stripe = new Stripe(key);
  try {
    await stripe.subscriptions.list({ limit: 1 });
    await stripe.charges.list({ limit: 1 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: /permission/i.test(msg) ? `The key lacks read permission: ${msg}` : `Stripe rejected the key: ${msg}` };
  }
  let accountId: string | null = null;
  try {
    accountId = (await stripe.accounts.retrieveCurrent()).id;
  } catch {
    /* Account read is optional for a restricted key. */
  }
  return { ok: true, accountId, livemode: key.startsWith("rk_live_") };
}

export const stripeAdapter: RevenueAdapter = {
  async fetchRevenue(credentials) {
    const { stripeUserId, restrictedKey } = credentials as StripeCredentials;
    const stripe = restrictedKey ? new Stripe(restrictedKey) : getStripe();
    const opts = restrictedKey ? {} : { stripeAccount: stripeUserId };
    const subs: SubLike[] = [];
    let page = 0;
    for await (const s of stripe.subscriptions.list({ status: "all", limit: 100 }, opts)) {
      subs.push(s as unknown as SubLike);
      if (subs.length % 100 === 0 && ++page >= PAGE_CAP) break;
    }
    const since = Math.floor(Date.now() / 1000) - LOOKBACK_DAYS * 86_400;
    const charges: ChargeLike[] = [];
    page = 0;
    for await (const c of stripe.charges.list({ created: { gte: since }, limit: 100 }, opts)) {
      charges.push(c as unknown as ChargeLike);
      if (charges.length % 100 === 0 && ++page >= PAGE_CAP) break;
    }
    const prices = await stripe.prices.list({ active: true, limit: 1 }, opts);
    const data = normalizeStripe(subs, charges);
    return { ...data, dataSince: new Date(since * 1000), hasProducts: prices.data.length > 0 || subs.length > 0 };
  },
};

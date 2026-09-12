import type { NormalizedCharge, NormalizedRevenueData, NormalizedSubscription } from "../domain/metrics";
import { jsonFetch } from "../checkout/provider";
import type { ApiKeyCredentials, RevenueAdapter } from "./types";
import { toInterval } from "./types";

/** Paddle Billing, read via API key. Sandbox keys (pdl_sdbx_…) hit the sandbox host. */
export function paddleHost(apiKey: string): string {
  return apiKey.startsWith("pdl_sdbx_") || apiKey.includes("sdbx") ? "https://sandbox-api.paddle.com" : "https://api.paddle.com";
}

export type PaddleSubscription = {
  id: string;
  status: string;
  customer_id: string;
  started_at: string | null;
  created_at: string;
  canceled_at: string | null;
  currency_code: string;
  billing_cycle: { interval: string; frequency: number };
  items: Array<{ quantity: number; price: { unit_price: { amount: string; currency_code: string } } }>;
};
export type PaddleTransaction = {
  id: string;
  status: string;
  customer_id: string | null;
  currency_code: string;
  billed_at: string | null;
  created_at: string;
  details?: { totals?: { total: string; grand_total?: string } };
};

const STATUS: Record<string, NormalizedSubscription["status"]> = { active: "active", trialing: "trialing", past_due: "past_due", paused: "paused", canceled: "canceled" };

export function normalizePaddle(subs: PaddleSubscription[], txns: PaddleTransaction[], refundedIds = new Set<string>()): NormalizedRevenueData {
  const subscriptions: NormalizedSubscription[] = subs.map((s) => ({
    id: s.id,
    customerId: s.customer_id,
    amountCents: s.items.reduce((sum, i) => sum + Number(i.price.unit_price.amount) * (i.quantity ?? 1), 0),
    currency: s.currency_code.toLowerCase(),
    interval: toInterval(s.billing_cycle?.interval),
    intervalCount: s.billing_cycle?.frequency ?? 1,
    status: STATUS[s.status] ?? "active",
    startedAt: new Date(s.started_at ?? s.created_at),
    canceledAt: s.canceled_at ? new Date(s.canceled_at) : null,
  }));
  const charges: NormalizedCharge[] = txns
    .filter((t) => t.status === "completed" || t.status === "paid")
    .map((t) => ({
      id: t.id,
      customerId: t.customer_id ?? "anon",
      amountCents: Number(t.details?.totals?.grand_total ?? t.details?.totals?.total ?? 0),
      currency: t.currency_code.toLowerCase(),
      occurredAt: new Date(t.billed_at ?? t.created_at),
      refunded: refundedIds.has(t.id),
    }));
  return { subscriptions, charges, dataSince: null };
}

async function listAll<T>(host: string, path: string, apiKey: string, cap = 10): Promise<T[]> {
  const out: T[] = [];
  let url: string | null = `${host}${path}${path.includes("?") ? "&" : "?"}per_page=200`;
  let pages = 0;
  while (url && pages++ < cap) {
    const res: { data: T[]; meta?: { pagination?: { has_more?: boolean; next?: string | null } } } = await jsonFetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    out.push(...res.data);
    url = res.meta?.pagination?.has_more ? (res.meta.pagination.next ?? null) : null;
  }
  return out;
}

export const paddleAdapter: RevenueAdapter = {
  async fetchRevenue(credentials) {
    const { apiKey } = credentials as ApiKeyCredentials;
    const host = paddleHost(apiKey);
    const [subs, txns, prices] = await Promise.all([
      listAll<PaddleSubscription>(host, "/subscriptions", apiKey),
      listAll<PaddleTransaction>(host, "/transactions?status=completed", apiKey),
      listAll<{ id: string }>(host, "/prices?status=active", apiKey, 1),
    ]);
    return { ...normalizePaddle(subs, txns), hasProducts: prices.length > 0 };
  },
};

export async function validatePaddleKey(apiKey: string): Promise<boolean> {
  try {
    await jsonFetch(`${paddleHost(apiKey)}/event-types`, { headers: { Authorization: `Bearer ${apiKey}` } });
    return true;
  } catch {
    return false;
  }
}

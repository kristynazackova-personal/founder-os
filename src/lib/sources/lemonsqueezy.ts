import type { NormalizedCharge, NormalizedRevenueData, NormalizedSubscription } from "../domain/metrics";
import { jsonFetch } from "../checkout/provider";
import type { ApiKeyCredentials, RevenueAdapter } from "./types";
import { toInterval } from "./types";

/** Lemon Squeezy, read via API key (JSON:API). */
const API = "https://api.lemonsqueezy.com/v1";

type LsResource<A> = { id: string; attributes: A };
export type LsSubscription = LsResource<{ status: string; customer_id: number; variant_id: number; created_at: string; ends_at: string | null; cancelled: boolean; store_id: number }>;
export type LsVariant = LsResource<{ price: number; interval: string | null; interval_count: number | null; is_subscription: boolean }>;
export type LsOrder = LsResource<{ status: string; customer_id: number; total: number; currency: string; created_at: string; refunded: boolean; store_id: number }>;
export type LsStore = LsResource<{ currency: string }>;

const STATUS: Record<string, NormalizedSubscription["status"]> = {
  active: "active",
  on_trial: "trialing",
  past_due: "past_due",
  unpaid: "past_due",
  cancelled: "canceled",
  expired: "canceled",
  paused: "paused",
};

export function normalizeLemonSqueezy(subs: LsSubscription[], variants: LsVariant[], orders: LsOrder[], storeCurrency = "usd"): NormalizedRevenueData {
  const byVariant = new Map(variants.map((v) => [v.id, v.attributes]));
  const subscriptions: NormalizedSubscription[] = subs.map((s) => {
    const v = byVariant.get(String(s.attributes.variant_id));
    const status = STATUS[s.attributes.status] ?? "active";
    const ended = status === "canceled" && s.attributes.ends_at ? new Date(s.attributes.ends_at) : null;
    return {
      id: s.id,
      customerId: String(s.attributes.customer_id),
      amountCents: v?.price ?? 0,
      currency: storeCurrency.toLowerCase(),
      interval: toInterval(v?.interval),
      intervalCount: v?.interval_count ?? 1,
      status,
      startedAt: new Date(s.attributes.created_at),
      canceledAt: ended ?? (status === "canceled" ? new Date(s.attributes.created_at) : null),
    };
  });
  const charges: NormalizedCharge[] = orders
    .filter((o) => o.attributes.status === "paid" || o.attributes.status === "refunded")
    .map((o) => ({
      id: o.id,
      customerId: String(o.attributes.customer_id),
      amountCents: o.attributes.total,
      currency: o.attributes.currency.toLowerCase(),
      occurredAt: new Date(o.attributes.created_at),
      refunded: o.attributes.refunded || o.attributes.status === "refunded",
    }));
  return { subscriptions, charges, dataSince: null };
}

async function listAll<T>(path: string, apiKey: string, cap = 10): Promise<T[]> {
  const out: T[] = [];
  let url: string | null = `${API}${path}${path.includes("?") ? "&" : "?"}page[size]=100`;
  let pages = 0;
  while (url && pages++ < cap) {
    const res: { data: T[]; links?: { next?: string | null } } = await jsonFetch(url, { headers: { Accept: "application/vnd.api+json", Authorization: `Bearer ${apiKey}` } });
    out.push(...res.data);
    url = res.links?.next ?? null;
  }
  return out;
}

export const lemonSqueezyAdapter: RevenueAdapter = {
  async fetchRevenue(credentials) {
    const { apiKey, storeId } = credentials as ApiKeyCredentials;
    const filter = storeId ? `?filter[store_id]=${encodeURIComponent(storeId)}` : "";
    const [subs, variants, orders, stores] = await Promise.all([
      listAll<LsSubscription>(`/subscriptions${filter}`, apiKey),
      listAll<LsVariant>(`/variants`, apiKey),
      listAll<LsOrder>(`/orders${filter}`, apiKey),
      listAll<LsStore>(`/stores`, apiKey, 1),
    ]);
    const currency = stores[0]?.attributes.currency ?? "usd";
    return { ...normalizeLemonSqueezy(subs, variants, orders, currency), hasProducts: variants.length > 0 };
  },
};

/** Validate a key cheaply (GET /users/me). */
export async function validateLemonSqueezyKey(apiKey: string): Promise<boolean> {
  try {
    await jsonFetch(`${API}/users/me`, { headers: { Accept: "application/vnd.api+json", Authorization: `Bearer ${apiKey}` } });
    return true;
  } catch {
    return false;
  }
}

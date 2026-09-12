import { describe, expect, it } from "vitest";
import { normalizeStripe } from "@/lib/sources/stripe";
import { normalizeLemonSqueezy } from "@/lib/sources/lemonsqueezy";
import { normalizePaddle, paddleHost } from "@/lib/sources/paddle";

describe("normalizeStripe", () => {
  it("maps subscriptions and charges", () => {
    const d = normalizeStripe(
      [
        { id: "sub_1", customer: "cus_1", status: "active", created: 1_700_000_000, items: { data: [{ quantity: 2, price: { unit_amount: 1_000, currency: "usd", recurring: { interval: "month", interval_count: 1 } } }] } },
        { id: "sub_2", customer: { id: "cus_2" }, status: "canceled", created: 1_690_000_000, canceled_at: 1_695_000_000, ended_at: 1_695_000_000, items: { data: [{ price: { unit_amount: 12_000, currency: "usd", recurring: { interval: "year", interval_count: 1 } } }] } },
      ],
      [
        { id: "ch_1", customer: "cus_1", amount: 2_000, currency: "usd", created: 1_700_000_100, paid: true, refunded: false, status: "succeeded" },
        { id: "ch_2", customer: "cus_9", amount: 500, currency: "usd", created: 1_700_000_100, paid: false, refunded: false, status: "failed" },
      ],
    );
    expect(d.subscriptions[0].amountCents).toBe(2_000);
    expect(d.subscriptions[0].canceledAt).toBeNull();
    expect(d.subscriptions[1].status).toBe("canceled");
    expect(d.subscriptions[1].canceledAt?.getTime()).toBe(1_695_000_000_000);
    expect(d.subscriptions[1].interval).toBe("year");
    expect(d.charges).toHaveLength(1);
  });
});

describe("normalizeLemonSqueezy", () => {
  it("joins variants for price and interval", () => {
    const d = normalizeLemonSqueezy(
      [{ id: "1", attributes: { status: "active", customer_id: 7, variant_id: 42, created_at: "2026-08-01T00:00:00Z", ends_at: null, cancelled: false, store_id: 1 } }],
      [{ id: "42", attributes: { price: 1_900, interval: "month", interval_count: 1, is_subscription: true } }],
      [{ id: "o1", attributes: { status: "paid", customer_id: 7, total: 1_900, currency: "USD", created_at: "2026-08-01T00:00:00Z", refunded: false, store_id: 1 } }],
      "USD",
    );
    expect(d.subscriptions[0].amountCents).toBe(1_900);
    expect(d.subscriptions[0].currency).toBe("usd");
    expect(d.charges[0].amountCents).toBe(1_900);
  });
});

describe("normalizePaddle", () => {
  it("sums items and parses string amounts", () => {
    const d = normalizePaddle(
      [{ id: "sub_a", status: "active", customer_id: "ctm_1", started_at: "2026-07-01T00:00:00Z", created_at: "2026-07-01T00:00:00Z", canceled_at: null, currency_code: "EUR", billing_cycle: { interval: "month", frequency: 1 }, items: [{ quantity: 3, price: { unit_price: { amount: "500", currency_code: "EUR" } } }] }],
      [{ id: "txn_1", status: "completed", customer_id: "ctm_1", currency_code: "EUR", billed_at: "2026-07-01T00:00:00Z", created_at: "2026-07-01T00:00:00Z", details: { totals: { total: "1500", grand_total: "1500" } } }],
    );
    expect(d.subscriptions[0].amountCents).toBe(1_500);
    expect(d.subscriptions[0].currency).toBe("eur");
    expect(d.charges[0].amountCents).toBe(1_500);
    expect(paddleHost("pdl_sdbx_abc")).toContain("sandbox");
    expect(paddleHost("pdl_live_abc")).toBe("https://api.paddle.com");
  });
});

import { describe, expect, it } from "vitest";
import { computeMetrics, EMPTY_SIGNALS, type NormalizedRevenueData } from "@/lib/domain/metrics";

const NOW = new Date("2026-09-12T00:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

function sub(id: string, opts: Partial<NormalizedRevenueData["subscriptions"][number]> = {}) {
  return {
    id,
    customerId: `c_${id}`,
    amountCents: 2_900,
    currency: "usd",
    interval: "month" as const,
    intervalCount: 1,
    status: "active" as const,
    startedAt: daysAgo(90),
    canceledAt: null,
    ...opts,
  };
}

describe("computeMetrics", () => {
  it("returns zeros on empty data", () => {
    const m = computeMetrics({ subscriptions: [], charges: [], dataSince: null }, EMPTY_SIGNALS, { launchedAt: null, now: NOW });
    expect(m.payingUsers).toBe(0);
    expect(m.trialingUsers).toBe(0);
    expect(m.mrrUsdCents).toBe(0);
    expect(m.momGrowth).toBeNull();
    expect(m.churn30d).toBeNull();
    expect(m.daysSinceLaunch).toBeNull();
  });

  it("computes MRR, growth and churn from subscriptions", () => {
    const data: NormalizedRevenueData = {
      subscriptions: [
        sub("a"), // active for 90 days
        sub("b"), // active for 90 days
        sub("c", { startedAt: daysAgo(10) }), // new this month
        sub("d", { status: "canceled", canceledAt: daysAgo(5) }), // churned this month
        sub("e", { amountCents: 24_000, interval: "year", startedAt: daysAgo(40) }), // yearly = $20/mo
        sub("t", { status: "trialing", startedAt: daysAgo(3) }), // trial doesn't count
      ],
      charges: [],
      dataSince: daysAgo(90),
    };
    const m = computeMetrics(data, EMPTY_SIGNALS, { launchedAt: daysAgo(120), now: NOW });
    expect(m.payingUsers).toBe(4); // a, b, c, e
    expect(m.trialingUsers).toBe(1); // t
    expect(m.mrrUsdCents).toBe(2_900 * 3 + 2_000);
    // 30 days ago: a, b, d, e active => 2900*3 + 2000 = 10700
    expect(m.mrrPrevUsdCents).toBe(10_700);
    expect(m.momGrowth).toBeCloseTo((10_700 - 10_700) / 10_700, 5);
    // prev customers a,b,d,e (4); d churned => 25%
    expect(m.churn30d).toBeCloseTo(0.25, 5);
    expect(m.daysSinceLaunch).toBe(120);
    expect(m.daysOfData).toBe(90);
  });

  it("counts one-time buyers in the last 30 days and lifetime revenue", () => {
    const data: NormalizedRevenueData = {
      subscriptions: [sub("a")],
      charges: [
        { id: "ch1", customerId: "c_x", amountCents: 4_900, currency: "usd", occurredAt: daysAgo(3), refunded: false },
        { id: "ch2", customerId: "c_y", amountCents: 4_900, currency: "usd", occurredAt: daysAgo(45), refunded: false },
        { id: "ch3", customerId: "c_z", amountCents: 4_900, currency: "usd", occurredAt: daysAgo(2), refunded: true },
        { id: "ch4", customerId: "c_a", amountCents: 2_900, currency: "usd", occurredAt: daysAgo(1), refunded: false }, // the subscriber's renewal
      ],
      dataSince: null,
    };
    const m = computeMetrics(data, { signups30d: 40, visitors30d: 500, checkoutViews30d: 20, activations30d: 10 }, { launchedAt: null, now: NOW });
    expect(m.payingUsers).toBe(2); // subscriber a + one-time buyer x
    expect(m.oneTimeBuyers30d).toBe(1);
    expect(m.revenue30dUsdCents).toBe(4_900 + 2_900);
    expect(m.lifetimeRevenueUsdCents).toBe(4_900 * 2 + 2_900);
    // purchasers in 30d: x and a (charge) => 2 / 40 signups
    expect(m.signupToPaid30d).toBeCloseTo(0.05, 5);
    expect(m.checkoutConversion30d).toBeCloseTo(0.1, 5);
    expect(m.daysSinceLaunch).toBe(90); // earliest data (sub start) when no launch date
  });
});

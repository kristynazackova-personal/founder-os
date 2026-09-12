import { describe, expect, it } from "vitest";
import { computeMetrics, EMPTY_REVENUE, EMPTY_SIGNALS, type Metrics } from "@/lib/domain/metrics";
import { diagnose, placeStage } from "@/lib/domain/stages";

const base: Metrics = computeMetrics(EMPTY_REVENUE, EMPTY_SIGNALS, { launchedAt: null, now: new Date() });
const hrefs = { pricing: "/p", checkout: "/c", attribution: "/a", connect: "/x" };

describe("placeStage", () => {
  it("stage 0 without checkout", () => {
    const p = placeStage({ metrics: base, checkoutLive: false, revenueSourceConnected: false, hasLiveApp: true });
    expect(p.stage).toBe(0);
    expect(p.confidence).toBe("low");
  });
  it("stage 1 with checkout and no customers", () => {
    const p = placeStage({ metrics: { ...base, daysOfData: 3 }, checkoutLive: true, revenueSourceConnected: true, hasLiveApp: true });
    expect(p.stage).toBe(1);
    expect(p.confidence).toBe("medium");
  });
  it("stage 2 from 1 to 10 paying users", () => {
    expect(placeStage({ metrics: { ...base, payingUsers: 1, daysOfData: 40 }, checkoutLive: true, revenueSourceConnected: true, hasLiveApp: true }).stage).toBe(2);
    expect(placeStage({ metrics: { ...base, payingUsers: 10, daysOfData: 40 }, checkoutLive: true, revenueSourceConnected: true, hasLiveApp: true }).stage).toBe(2);
  });
  it("stage 3 from 11 paying users or $500 MRR", () => {
    expect(placeStage({ metrics: { ...base, payingUsers: 11, daysOfData: 40 }, checkoutLive: true, revenueSourceConnected: true, hasLiveApp: true }).stage).toBe(3);
    const p = placeStage({ metrics: { ...base, payingUsers: 4, mrrUsdCents: 60_000, daysOfData: 40 }, checkoutLive: true, revenueSourceConnected: true, hasLiveApp: true });
    expect(p.stage).toBe(3);
    expect(p.confidence).toBe("high");
    expect(p.reasons[0]).toContain("$600");
  });
  it("paying users beat a missing checkout flag (Stripe-connected founders)", () => {
    expect(placeStage({ metrics: { ...base, payingUsers: 3 }, checkoutLive: false, revenueSourceConnected: true, hasLiveApp: true }).stage).toBe(2);
  });
});

describe("diagnose", () => {
  it("stage 0 sends to pricing when there is none", () => {
    const p = placeStage({ metrics: base, checkoutLive: false, revenueSourceConnected: false, hasLiveApp: true });
    const d = diagnose(base, p, { hasPricing: false, hasSnippet: false, checkoutLive: false, hrefs });
    expect(d.action.href).toBe("/p");
    expect(d.numbers).toHaveLength(3);
  });
  it("stage 3 with high churn says fix churn first", () => {
    const m = { ...base, payingUsers: 20, mrrUsdCents: 140_000, momGrowth: 0.09, churn30d: 0.11, daysOfData: 90 };
    const p = placeStage({ metrics: m, checkoutLive: true, revenueSourceConnected: true, hasLiveApp: true });
    const d = diagnose(m, p, { hasPricing: true, hasSnippet: true, checkoutLive: true, hrefs });
    expect(d.sentence).toContain("$1,400");
    expect(d.sentence).toContain("fix churn first");
    expect(d.action.title).toMatch(/churn/i);
  });
});

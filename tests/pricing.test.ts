import { describe, expect, it } from "vitest";
import { pricingPageHtml, pricingPagePrompt, recommendPricing, snapToLadder, type PricingAnswers } from "@/lib/domain/pricing";

const answers: PricingAnswers = {
  audience: "smb",
  replaces: "manual_work",
  replacesCostMonthly: 200,
  valueMetric: "flat",
  frequency: "weekly",
  comparables: "Calendly",
  comparablePriceMonthly: 12,
  wtpTooCheap: 5,
  wtpTooExpensive: 60,
  activationEvent: "books first appointment",
  costToServeMonthly: 1,
};

describe("snapToLadder", () => {
  it("snaps to the nearest rung", () => {
    expect(snapToLadder(2_650)).toBe(2_900);
    expect(snapToLadder(1_000)).toBe(900);
    expect(snapToLadder(50)).toBe(300);
  });
});

describe("recommendPricing", () => {
  it("recommends a subscription with three tiers for SMB", () => {
    const rec = recommendPricing(answers);
    expect(rec.model).toBe("subscription");
    expect(rec.tiers).toHaveLength(3);
    expect(rec.tiers[1].highlighted).toBe(true);
    expect(rec.tiers[1].priceCents).toBe(rec.anchorMonthlyCents);
    expect(rec.tiers[0].priceCents).toBeLessThan(rec.tiers[1].priceCents);
    expect(rec.tiers[2].priceCents).toBeGreaterThan(rec.tiers[1].priceCents);
    expect(rec.anchorMonthlyCents).toBeGreaterThanOrEqual(500);
    expect(rec.anchorMonthlyCents).toBeLessThanOrEqual(6_000);
    expect(rec.reasoning.length).toBeGreaterThan(4);
    expect(rec.gaps).toHaveLength(0);
    expect(rec.activationEvent).toBe("books first appointment");
  });
  it("recommends one-time for one-off use", () => {
    const rec = recommendPricing({ ...answers, frequency: "once", audience: "consumer" });
    expect(rec.model).toBe("one_time");
    expect(rec.tiers).toHaveLength(1);
    expect(rec.tiers[0].yearlyPriceCents).toBeNull();
  });
  it("respects the cost floor", () => {
    const rec = recommendPricing({ ...answers, audience: "consumer", replacesCostMonthly: null, comparablePriceMonthly: null, wtpTooCheap: null, wtpTooExpensive: null, costToServeMonthly: 10 });
    expect(rec.anchorMonthlyCents).toBeGreaterThanOrEqual(2_900);
    expect(rec.reasoning.join(" ")).toContain("floor");
    expect(rec.gaps.length).toBe(3);
  });
  it("usage model when value scales with usage and there is a variable cost", () => {
    const rec = recommendPricing({ ...answers, valueMetric: "usage", costToServeMonthly: 3 });
    expect(rec.model).toBe("usage");
  });
});

describe("pricing page output", () => {
  it("renders every tier with its checkout link", () => {
    const rec = recommendPricing(answers);
    const html = pricingPageHtml(rec, { checkoutUrls: { growth: "https://x/pay/abc" }, appName: "Bookly <3" });
    expect(html).toContain("https://x/pay/abc");
    expect(html).toContain("Bookly &lt;3");
    for (const t of rec.tiers) expect(html).toContain(t.name);
    const prompt = pricingPagePrompt(rec);
    expect(prompt).toContain("3 tiers");
  });
});

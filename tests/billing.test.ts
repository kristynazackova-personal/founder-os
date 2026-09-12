import { describe, expect, it } from "vitest";
import { billingState, crossedUnlockThreshold } from "@/lib/domain/billing";

const now = new Date("2026-09-12T00:00:00Z");

describe("billingState", () => {
  it("is free with no revenue and no source", () => {
    const s = billingState({ lifetimeWrappedRevenueCents: 0, connectedSourceSince: null, subscriptionActive: false, now });
    expect(s.status).toBe("free");
    expect(s.message).toContain("$500 to go");
  });
  it("stays free under $500 wrapped revenue", () => {
    const s = billingState({ lifetimeWrappedRevenueCents: 12_000, connectedSourceSince: null, subscriptionActive: false, now });
    expect(s.status).toBe("free");
    if (s.status === "free") expect(s.remainingCents).toBe(38_000);
  });
  it("requires unlock at $500", () => {
    const s = billingState({ lifetimeWrappedRevenueCents: 50_000, connectedSourceSince: null, subscriptionActive: false, now });
    expect(s.status).toBe("unlock_required");
    expect(s.planCents).toBe(3_900);
  });
  it("stripe-connected founders get a 14-day trial then $29", () => {
    const since = new Date(now.getTime() - 3 * 86_400_000);
    const s = billingState({ lifetimeWrappedRevenueCents: 0, connectedSourceSince: since, subscriptionActive: false, now });
    expect(s.status).toBe("trial");
    if (s.status === "trial") expect(s.daysLeft).toBe(11);
    const later = billingState({ lifetimeWrappedRevenueCents: 0, connectedSourceSince: new Date(now.getTime() - 20 * 86_400_000), subscriptionActive: false, now });
    expect(later.status).toBe("unlock_required");
    expect(later.planCents).toBe(2_900);
  });
  it("wrapped revenue wins over the connected track", () => {
    const s = billingState({ lifetimeWrappedRevenueCents: 100, connectedSourceSince: new Date(now.getTime() - 40 * 86_400_000), subscriptionActive: false, now });
    expect(s.status).toBe("free");
  });
  it("active subscription", () => {
    const s = billingState({ lifetimeWrappedRevenueCents: 90_000, connectedSourceSince: null, subscriptionActive: true, now });
    expect(s.status).toBe("active");
  });
  it("threshold crossing", () => {
    expect(crossedUnlockThreshold(49_000, 51_000)).toBe(true);
    expect(crossedUnlockThreshold(51_000, 53_000)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { isRestrictedStripeKey } from "@/lib/sources/stripe";

describe("isRestrictedStripeKey", () => {
  it("accepts rk_ keys only", () => {
    expect(isRestrictedStripeKey("rk_live_abc123")).toBe(true);
    expect(isRestrictedStripeKey("rk_test_abc123")).toBe(true);
    expect(isRestrictedStripeKey("sk_live_abc123")).toBe(false);
    expect(isRestrictedStripeKey("pk_live_abc123")).toBe(false);
    expect(isRestrictedStripeKey("")).toBe(false);
  });
});

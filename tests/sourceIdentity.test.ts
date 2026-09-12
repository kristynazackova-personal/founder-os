import { describe, expect, it } from "vitest";
import { sourceIdentity } from "@/lib/services/sources";

describe("sourceIdentity", () => {
  it("shows identifiers and never the credential", () => {
    expect(sourceIdentity({ type: "ga4", externalId: "123456789", meta: { serviceAccountEmail: "ga@proj.iam.gserviceaccount.com" } })).toBe("Property 123456789 · ga@proj.iam.gserviceaccount.com");
    expect(sourceIdentity({ type: "lemonsqueezy", externalId: "42", meta: { keyLast4: "abcd" } })).toBe("Store 42 · key ····abcd");
    expect(sourceIdentity({ type: "paddle", externalId: null, meta: { sandbox: true, keyLast4: "zz99" } })).toBe("Sandbox key ····zz99");
    expect(sourceIdentity({ type: "stripe", externalId: "acct_1", meta: {} })).toBe("Account acct_1 (OAuth)");
  });
});

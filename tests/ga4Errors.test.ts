import { describe, expect, it } from "vitest";
import { ProviderError } from "@/lib/checkout/provider";
import { explainGa4Error } from "@/lib/services/sources";

const sa = "x@p.iam.gserviceaccount.com";

describe("explainGa4Error", () => {
  it("names a disabled API", () => {
    const err = new ProviderError("POST … → 403", 403, { error: { message: "Google Analytics Data API has not been used in project 633789022088 before or it is disabled. Enable it by visiting …", status: "PERMISSION_DENIED" } });
    expect(explainGa4Error(err, sa, "1")).toContain("not enabled on the Cloud project 633789022088");
  });
  it("names missing property access", () => {
    const err = new ProviderError("POST … → 403", 403, { error: { message: "User does not have sufficient permissions for this property.", status: "PERMISSION_DENIED" } });
    const msg = explainGa4Error(err, sa, "552881470");
    expect(msg).toContain("Property access management");
    expect(msg).toContain(sa);
  });
  it("names a wrong property id", () => {
    expect(explainGa4Error(new ProviderError("x", 404, {}), sa, "G-ABC")).toContain("numeric property id");
  });
});

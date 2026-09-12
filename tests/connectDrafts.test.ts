import { describe, expect, it } from "vitest";
import { pickSecrets, redactConnectionString, sanitizeDraft } from "@/lib/services/connectChecklists";

describe("connect drafts", () => {
  it("keeps only allow-listed, non-secret fields", () => {
    const d = sanitizeDraft("mixpanel", { projectId: "123", serviceSecret: "shh", serviceUser: "u", signupEvent: "User Signup", junk: "x" });
    expect(d).toEqual({ projectId: "123", serviceUser: "u", signupEvent: "User Signup" });
    expect(sanitizeDraft("stripe", { apiKey: "rk_live_x" })).toEqual({});
    expect(sanitizeDraft("appstore", { issuerId: "i", keyId: "k", vendorNumber: "v", privateKey: "-----BEGIN" })).toEqual({ issuerId: "i", keyId: "k", vendorNumber: "v" });
  });
  it("separates secrets for encrypted storage", () => {
    expect(pickSecrets("appstore", { issuerId: "i", privateKey: "-----BEGIN PRIVATE KEY-----\nx" })).toEqual({ privateKey: "-----BEGIN PRIVATE KEY-----\nx" });
    expect(pickSecrets("postgres", { connectionString: "postgresql://ro@h/db" })).toEqual({}); // no password → nothing secret
    expect(pickSecrets("postgres", { connectionString: "postgresql://ro:pw@h/db" })).toEqual({ connectionString: "postgresql://ro:pw@h/db" });
    expect(pickSecrets("mixpanel", { serviceSecret: "  " })).toEqual({});
  });
  it("drops the password from a connection string", () => {
    expect(redactConnectionString("postgresql://ro:s3cret@db.host:5432/app?sslmode=require")).toBe("postgresql://ro@db.host:5432/app?sslmode=require");
    expect(redactConnectionString("not a url")).toBe("");
    const d = sanitizeDraft("postgres", { connectionString: "postgresql://ro:pw@h/db", usersTable: "users", priceMap: "premium=$3.99/week" });
    expect(d.connectionString).toBe("postgresql://ro@h/db");
    expect(d.priceMap).toBe("premium=$3.99/week");
  });
});

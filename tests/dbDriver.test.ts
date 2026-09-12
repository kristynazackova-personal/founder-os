import { describe, expect, it } from "vitest";
import { pickDriver } from "@/lib/db";

describe("pickDriver", () => {
  it("uses Neon HTTP only for neon.tech hosts", () => {
    expect(pickDriver("postgresql://u:p@ep-x-123.eu-central-1.aws.neon.tech/db?sslmode=require")).toBe("neon-http");
    expect(pickDriver("postgresql://postgres:p@postgres.railway.internal:5432/railway")).toBe("postgres");
    expect(pickDriver("postgresql://postgres:p@monorail.proxy.rlwy.net:12345/railway")).toBe("postgres");
    expect(pickDriver("")).toBe("pglite");
  });
});

import { describe, expect, it } from "vitest";
import { secretBytes, sign, verify } from "@/lib/webhooks/standardWebhooks";

describe("standard webhooks", () => {
  const secret = secretBytes("whsec_" + Buffer.from("topsecret").toString("base64"));
  const body = JSON.stringify({ hello: "world" });
  const now = 1_700_000_000;

  it("verifies a correctly signed payload", () => {
    const sig = sign(secret, "msg_1", now, body);
    const r = verify(secret, body, { id: "msg_1", timestamp: String(now), signature: sig }, now + 10);
    expect(r.ok).toBe(true);
  });
  it("accepts multiple signatures and picks the matching one", () => {
    const sig = sign(secret, "msg_1", now, body);
    const r = verify(secret, body, { id: "msg_1", timestamp: String(now), signature: `v1,AAAA ${sig}` }, now);
    expect(r.ok).toBe(true);
  });
  it("rejects a tampered body, wrong secret and stale timestamp", () => {
    const sig = sign(secret, "msg_1", now, body);
    expect(verify(secret, body + " ", { id: "msg_1", timestamp: String(now), signature: sig }, now).ok).toBe(false);
    expect(verify(secretBytes("other"), body, { id: "msg_1", timestamp: String(now), signature: sig }, now).ok).toBe(false);
    expect(verify(secret, body, { id: "msg_1", timestamp: String(now), signature: sig }, now + 600).ok).toBe(false);
    expect(verify(secret, body, { id: null, timestamp: String(now), signature: sig }, now).ok).toBe(false);
  });
  it("uses plain secrets as raw bytes", () => {
    expect(secretBytes("abc").toString("utf8")).toBe("abc");
  });
});

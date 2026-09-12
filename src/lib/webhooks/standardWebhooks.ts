import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Standard Webhooks (https://standardwebhooks.com) — the signature scheme
 * both Dodo Payments and Polar use. Headers: webhook-id, webhook-timestamp,
 * webhook-signature ("v1,<base64>" entries, space separated). Signed content
 * is `${id}.${timestamp}.${body}` HMAC-SHA256 with the raw secret bytes.
 */
export const TOLERANCE_SECONDS = 5 * 60;

export function secretBytes(secret: string): Buffer {
  // "whsec_" prefixed secrets are base64; plain secrets are used as-is.
  if (secret.startsWith("whsec_")) return Buffer.from(secret.slice(6), "base64");
  return Buffer.from(secret, "utf8");
}

export function sign(secret: Buffer, id: string, timestamp: number | string, body: string): string {
  const mac = createHmac("sha256", secret).update(`${id}.${timestamp}.${body}`).digest("base64");
  return `v1,${mac}`;
}

export type VerifyResult = { ok: true; id: string; timestamp: number } | { ok: false; reason: string };

export function verify(
  secret: Buffer,
  body: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  now: number = Math.floor(Date.now() / 1000),
): VerifyResult {
  if (!headers.id || !headers.timestamp || !headers.signature) return { ok: false, reason: "missing signature headers" };
  const ts = Number(headers.timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: "bad timestamp" };
  if (Math.abs(now - ts) > TOLERANCE_SECONDS) return { ok: false, reason: "timestamp outside tolerance" };
  const expected = sign(secret, headers.id, headers.timestamp, body).slice(3);
  const expectedBuf = Buffer.from(expected, "base64");
  for (const part of headers.signature.split(" ")) {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) continue;
    const got = Buffer.from(sig, "base64");
    if (got.length === expectedBuf.length && timingSafeEqual(got, expectedBuf)) return { ok: true, id: headers.id, timestamp: ts };
  }
  return { ok: false, reason: "no matching signature" };
}

export function headersFrom(h: Headers): { id: string | null; timestamp: string | null; signature: string | null } {
  return { id: h.get("webhook-id"), timestamp: h.get("webhook-timestamp"), signature: h.get("webhook-signature") };
}

import { describe, expect, it } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { appStoreConnectJwt, normalizeAppStore, parseSubscriberReport } from "@/lib/sources/appstore";
import { normalizeP8 } from "@/lib/services/sources";

const HEADER = ["Event Date", "Event", "App Name", "App Apple ID", "Subscription Name", "Subscription Apple ID", "Standard Subscription Duration", "Customer Price", "Customer Currency", "Proceeds", "Subscriber ID", "Country"].join("\t");
const row = (date: string, event: string, sub: string, price = "3.99", dur = "1 Week") => [date, event, "Selvenn", "6758160286", "Premium", "1001", dur, price, "USD", "2.79", sub, "US"].join("\t");

describe("App Store subscriber reports", () => {
  it("parses a report and rebuilds lifecycles", () => {
    const tsv = [HEADER, row("2026-07-01", "Start introductory offer", "s1", "0.00"), row("2026-07-08", "Paid subscription from introductory offer", "s1"), row("2026-08-20", "Cancel", "s1"), row("2026-08-01", "Subscribe", "s2", "5.99"), row("2026-08-08", "Renew", "s2", "5.99"), row("2026-09-01", "Subscribe", "s3", "59.99", "1 Year")].join("\n");
    const events = parseSubscriberReport(tsv);
    expect(events).toHaveLength(6);
    const data = normalizeAppStore(events, new Date("2026-08-25T00:00:00Z")); // before s2 would lapse (08-08 + 7 + 16 days)
    const s1 = data.subscriptions.find((s) => s.customerId === "s1")!;
    expect(s1.status).toBe("canceled");
    expect(s1.startedAt.toISOString().slice(0, 10)).toBe("2026-07-01");
    expect(s1.canceledAt?.toISOString().slice(0, 10)).toBe("2026-08-20");
    expect(s1.amountCents).toBe(399);
    expect(s1.interval).toBe("week");
    const s2 = data.subscriptions.find((s) => s.customerId === "s2")!;
    expect(s2.status).toBe("active");
    expect(s2.amountCents).toBe(599);
    const s3 = data.subscriptions.find((s) => s.customerId === "s3")!;
    expect(s3.interval).toBe("year");
    expect(s3.amountCents).toBe(5_999);
    expect(data.dataSince?.toISOString().slice(0, 10)).toBe("2026-07-01");
  });
  it("keeps a $0 introductory start on trial until something is paid", () => {
    const tsv = [HEADER, row("2026-09-01", "Start introductory offer", "t1", "0.00"), row("2026-09-01", "Start introductory offer", "t2", "0.00"), row("2026-09-08", "Renew", "t2", "3.99")].join("\n");
    const subs = normalizeAppStore(parseSubscriberReport(tsv), new Date("2026-09-10T00:00:00Z")).subscriptions;
    const t1 = subs.find((s) => s.customerId === "t1")!;
    const t2 = subs.find((s) => s.customerId === "t2")!;
    expect(t1.status).toBe("trialing");
    expect(t1.amountCents).toBe(0);
    expect(t2.status).toBe("active");
    expect(t2.amountCents).toBe(399);
  });
  it("stamps trial start and first paid date", () => {
    const tsv = [HEADER, row("2026-09-01", "Start introductory offer", "t2", "0.00"), row("2026-09-08", "Renew", "t2", "3.99")].join("\n");
    const [t2] = normalizeAppStore(parseSubscriberReport(tsv), new Date("2026-09-10T00:00:00Z")).subscriptions;
    expect(t2.trialStartedAt?.toISOString().slice(0, 10)).toBe("2026-09-01");
    expect(t2.firstPaidAt?.toISOString().slice(0, 10)).toBe("2026-09-08");
  });
  it("treats a weekly subscription as lapsed one period + 16 days after its last paid event", () => {
    const tsv = [HEADER, row("2026-07-01", "Subscribe", "w1", "3.99"), row("2026-07-08", "Renew", "w1", "3.99"), row("2026-09-01", "Subscribe", "w2", "3.99")].join("\n");
    const subs = normalizeAppStore(parseSubscriberReport(tsv), new Date("2026-09-12T00:00:00Z")).subscriptions;
    const w1 = subs.find((s) => s.customerId === "w1")!;
    const w2 = subs.find((s) => s.customerId === "w2")!;
    expect(w1.status).toBe("canceled");
    expect(w1.canceledAt?.toISOString().slice(0, 10)).toBe("2026-07-31"); // 07-08 + 7 days + 16 days
    expect(w2.status).toBe("active"); // 09-01 + 7 + 16 = 09-24 > now
  });
  it("treats an unconverted trial as lapsed after the offer length + grace, and a yearly plan as live", () => {
    const HEADER_OFFER = HEADER + "\tSubscription Offer Duration";
    const rowO = (date: string, event: string, sub: string, price: string, dur: string, offer: string) => row(date, event, sub, price, dur) + "\t" + offer;
    const tsv = [HEADER_OFFER, rowO("2026-07-01", "Start introductory offer", "t1", "0.00", "1 Week", "7 Days"), rowO("2026-09-05", "Start introductory offer", "t2", "0.00", "1 Week", "7 Days"), rowO("2026-07-15", "Subscribe", "y1", "59.99", "1 Year", "")].join("\n");
    const subs = normalizeAppStore(parseSubscriberReport(tsv), new Date("2026-09-12T00:00:00Z")).subscriptions;
    const t1 = subs.find((s) => s.customerId === "t1")!;
    const t2 = subs.find((s) => s.customerId === "t2")!;
    const y1 = subs.find((s) => s.customerId === "y1")!;
    expect(t1.status).toBe("canceled");
    expect(t1.canceledAt?.toISOString().slice(0, 10)).toBe("2026-07-24"); // 07-01 + 7 days + 16 days
    expect(t1.firstPaidAt).toBeNull();
    expect(t2.status).toBe("trialing");
    expect(y1.status).toBe("active");
  });
  it("ignores reports without the needed columns", () => {
    expect(parseSubscriberReport("Foo\tBar\n1\t2")).toEqual([]);
    expect(parseSubscriberReport("")).toEqual([]);
  });
  it("normalises .p8 formats", () => {
    const b64 = "A".repeat(120);
    const pem = `-----BEGIN PRIVATE KEY-----\n${b64.slice(0, 64)}\n${b64.slice(64)}\n-----END PRIVATE KEY-----`;
    expect(normalizeP8(pem)).toBe(pem);
    expect(normalizeP8(pem.replace(/\n/g, "\\n"))).toBe(pem);
    expect(normalizeP8(`"${pem}"`)).toBe(pem);
    expect(normalizeP8(b64)).toBe(pem);
    expect(normalizeP8("garbage")).toBe("garbage");
  });
  it("signs an ES256 token Apple can parse", () => {
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const token = appStoreConnectJwt({ issuerId: "iss", keyId: "KEY123", privateKey: pem }, 1_700_000_000);
    const [h, p, sig] = token.split(".");
    expect(JSON.parse(Buffer.from(h, "base64url").toString())).toEqual({ alg: "ES256", kid: "KEY123", typ: "JWT" });
    const payload = JSON.parse(Buffer.from(p, "base64url").toString());
    expect(payload.aud).toBe("appstoreconnect-v1");
    expect(payload.exp - payload.iat).toBe(900);
    expect(Buffer.from(sig, "base64url")).toHaveLength(64); // raw r||s, not DER
  });
});

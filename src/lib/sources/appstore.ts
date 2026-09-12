import { createSign } from "node:crypto";
import { gunzipSync } from "node:zlib";
import type { NormalizedRevenueData, NormalizedSubscription } from "../domain/metrics";
import type { AppStoreCredentials, RevenueAdapter } from "./types";

/**
 * App Store subscriptions via App Store Connect's Sales and Trends reports
 * (SUBSCRIBER, DETAILED, DAILY, version 1_3). Each daily report lists
 * subscriber-level events; replaying the last 90 days rebuilds every
 * subscriber's lifecycle. Reports appear the next day and are absent (404)
 * on days without activity. Written against the 2026 API; not exercised
 * against Apple in this repository — the parser is unit-tested on synthetic
 * report text.
 */
const API = "https://api.appstoreconnect.apple.com/v1/salesReports";
const LOOKBACK_DAYS = 90;
const CONCURRENCY = 4;

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

/** ES256 JWT for App Store Connect (aud appstoreconnect-v1, ≤ 20 minutes). */
export function appStoreConnectJwt(c: Pick<AppStoreCredentials, "issuerId" | "keyId" | "privateKey">, now = Math.floor(Date.now() / 1000)): string {
  const header = b64url(JSON.stringify({ alg: "ES256", kid: c.keyId, typ: "JWT" }));
  const payload = b64url(JSON.stringify({ iss: c.issuerId, iat: now, exp: now + 15 * 60, aud: "appstoreconnect-v1" }));
  const signer = createSign("SHA256");
  signer.update(`${header}.${payload}`);
  const sig = signer.sign({ key: c.privateKey, dsaEncoding: "ieee-p1363" });
  return `${header}.${payload}.${b64url(sig)}`;
}

const START_EVENTS = new Set(["subscribe", "start introductory offer", "free trial", "start free trial", "paid subscription from introductory offer", "paid subscription from introductory price", "paid subscription from free trial", "reactivate", "renew", "renewal from billing retry", "crossgrade", "upgrade", "downgrade"]);
const TRIAL_EVENTS = new Set(["free trial", "start free trial"]);
const END_EVENTS = new Set(["cancel", "refund", "expired", "expire"]);

const DURATION_TO_INTERVAL: Array<[RegExp, NormalizedSubscription["interval"]]> = [
  [/week/i, "week"],
  [/year/i, "year"],
  [/day/i, "day"],
  [/month/i, "month"],
];

export type SubscriberEvent = { date: Date; subscriberId: string; event: string; priceCents: number; currency: string; interval: NormalizedSubscription["interval"]; intervalCount: number; productId: string };

function col(header: string[], ...names: string[]): number {
  for (const n of names) {
    const i = header.findIndex((h) => h.toLowerCase() === n.toLowerCase());
    if (i >= 0) return i;
  }
  return -1;
}

/** Parse one SUBSCRIBER DETAILED report (tab-separated, header row first). */
export function parseSubscriberReport(tsv: string): SubscriberEvent[] {
  const lines = tsv.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const header = lines[0].split("\t");
  const iDate = col(header, "Event Date");
  const iSub = col(header, "Subscriber ID");
  const iEvent = col(header, "Event");
  const iPrice = col(header, "Customer Price");
  const iCur = col(header, "Customer Currency");
  const iDur = col(header, "Standard Subscription Duration", "Subscription Duration");
  const iProd = col(header, "Subscription Apple ID", "Subscription Name");
  if (iDate < 0 || iSub < 0 || iEvent < 0) return [];
  const out: SubscriberEvent[] = [];
  for (const line of lines.slice(1)) {
    const f = line.split("\t");
    const sid = f[iSub]?.trim();
    if (!sid) continue;
    const dur = iDur >= 0 ? (f[iDur] ?? "") : "";
    const count = Number(dur.match(/(\d+)/)?.[1] ?? 1) || 1;
    const interval = DURATION_TO_INTERVAL.find(([re]) => re.test(dur))?.[1] ?? "month";
    out.push({
      date: new Date(f[iDate]),
      subscriberId: sid,
      event: (f[iEvent] ?? "").trim(),
      priceCents: Math.round(Number(f[iPrice] ?? 0) * 100) || 0,
      currency: (f[iCur] ?? "USD").trim().toLowerCase() || "usd",
      interval,
      intervalCount: count,
      productId: (f[iProd] ?? "").trim(),
    });
  }
  return out;
}

/** Replay subscriber events (any order) into one subscription per subscriber. */
export function normalizeAppStore(events: SubscriberEvent[]): NormalizedRevenueData {
  const bySub = new Map<string, SubscriberEvent[]>();
  for (const e of events) {
    if (Number.isNaN(e.date.getTime())) continue;
    const list = bySub.get(e.subscriberId) ?? [];
    list.push(e);
    bySub.set(e.subscriberId, list);
  }
  const subscriptions: NormalizedSubscription[] = [];
  let dataSince: Date | null = null;
  for (const [sid, list] of bySub) {
    list.sort((a, b) => a.date.getTime() - b.date.getTime());
    let startedAt: Date | null = null;
    let canceledAt: Date | null = null;
    let trialing = false;
    let last = list[0];
    for (const e of list) {
      const kind = e.event.toLowerCase();
      if (START_EVENTS.has(kind)) {
        if (startedAt === null || canceledAt !== null) {
          startedAt = e.date;
          canceledAt = null;
        }
        // Apple reports a free trial as "Start introductory offer" at 0.00
        // (the trial wording only appears in the offer-type column), so any
        // start-family event that charged nothing keeps the subscriber on a
        // trial until a paid event follows. Only paid events set the price.
        if (e.priceCents > 0) {
          trialing = false;
          last = e;
        } else {
          trialing = TRIAL_EVENTS.has(kind) || e.priceCents === 0;
        }
      } else if (END_EVENTS.has(kind)) {
        canceledAt = e.date;
      }
      if (dataSince === null || e.date < dataSince) dataSince = e.date;
    }
    if (!startedAt) continue;
    subscriptions.push({
      id: `appstore_${sid}`,
      customerId: sid,
      amountCents: last.priceCents,
      currency: last.currency,
      interval: last.interval,
      intervalCount: last.intervalCount,
      status: canceledAt ? "canceled" : trialing ? "trialing" : "active",
      startedAt,
      canceledAt,
    });
  }
  return { subscriptions, charges: [], dataSince };
}

async function fetchDailyReport(c: AppStoreCredentials, token: string, date: string): Promise<string | null> {
  const u = new URL(API);
  u.searchParams.set("filter[frequency]", "DAILY");
  u.searchParams.set("filter[reportDate]", date);
  u.searchParams.set("filter[reportSubType]", "DETAILED");
  u.searchParams.set("filter[reportType]", "SUBSCRIBER");
  u.searchParams.set("filter[vendorNumber]", c.vendorNumber);
  u.searchParams.set("filter[version]", "1_3");
  const res = await fetch(u, { headers: { Authorization: `Bearer ${token}`, Accept: "application/a-gzip" } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`App Store Connect ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const buf = Buffer.from(await res.arrayBuffer());
  try {
    return gunzipSync(buf).toString("utf8");
  } catch {
    return buf.toString("utf8");
  }
}

export const appStoreAdapter: RevenueAdapter = {
  async fetchRevenue(credentials) {
    const c = credentials as AppStoreCredentials;
    const token = appStoreConnectJwt(c);
    const days: string[] = [];
    for (let i = 1; i <= LOOKBACK_DAYS; i++) days.push(new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10));
    const events: SubscriberEvent[] = [];
    for (let i = 0; i < days.length; i += CONCURRENCY) {
      const chunk = await Promise.all(days.slice(i, i + CONCURRENCY).map((d) => fetchDailyReport(c, token, d)));
      for (const tsv of chunk) if (tsv) events.push(...parseSubscriberReport(tsv));
    }
    const data = normalizeAppStore(events);
    return { ...data, dataSince: data.dataSince ?? new Date(Date.now() - LOOKBACK_DAYS * 86_400_000), hasProducts: true };
  },
};

/** Validate credentials: the token must sign and the newest report request must not be rejected as unauthorized. */
export async function probeAppStore(c: AppStoreCredentials): Promise<{ ok: true; found: boolean } | { ok: false; error: string }> {
  let token: string;
  try {
    token = appStoreConnectJwt(c);
  } catch (err) {
    return { ok: false, error: `The private key could not sign an ES256 token: ${err instanceof Error ? err.message : String(err)}. Paste the whole .p8 file, including the BEGIN/END lines.` };
  }
  try {
    for (let i = 1; i <= 7; i++) {
      const tsv = await fetchDailyReport(c, token, new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10));
      if (tsv !== null) return { ok: true, found: true };
    }
    return { ok: true, found: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/401|NOT_AUTHORIZED/i.test(msg))
      return {
        ok: false,
        error:
          "App Store Connect rejected the token (401). The usual cause: this is an In-App Purchase key (the kind that works for in-app purchase verification) — sales reports need a Team key from Users and Access → Integrations → App Store Connect API → Team Keys, with the Sales, Finance or Admin role. Also check the issuer id and key id belong to that same key.",
      };
    if (/403/i.test(msg)) return { ok: false, error: "App Store Connect refused access (403). The API key needs the Sales and Reports role, and the vendor number must belong to this team." };
    return { ok: false, error: msg };
  }
}

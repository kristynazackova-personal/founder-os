import type { NormalizedSubscription } from "../domain/metrics";
import type { AnalyticsAdapter, PostgresCredentials, PriceMap, RevenueAdapter } from "./types";
import { isSqlIdentifier } from "./types";

/**
 * The founder's own database (Supabase, Neon, Railway…), read-only. Signups
 * come from a users table; revenue optionally from a subscriptions table with
 * a plan → price map, which is how apps that bill on several rails (Stripe +
 * App Store) can report one truth.
 */
const DAY_MS = 86_400_000;

type Row = Record<string, unknown>;

function q(id: string): string {
  if (!isSqlIdentifier(id)) throw new Error(`Unsafe identifier: ${id}`);
  return id
    .split(".")
    .map((p) => `"${p}"`)
    .join(".");
}

export async function withClient<T>(connectionString: string, fn: (query: (sql: string) => Promise<Row[]>) => Promise<T>): Promise<T> {
  const { Client } = await import("pg");
  let ssl: false | { rejectUnauthorized: boolean } = false;
  try {
    const mode = new URL(connectionString).searchParams.get("sslmode");
    ssl = mode && mode !== "disable" ? { rejectUnauthorized: false } : false;
  } catch {
    /* pg will report a bad URL */
  }
  const client = new Client({ connectionString, ssl, statement_timeout: 15_000, connectionTimeoutMillis: 10_000, application_name: "founder-os-readonly" });
  await client.connect();
  try {
    await client.query("SET default_transaction_read_only = on");
    return await fn(async (sql) => (await client.query(sql)).rows as Row[]);
  } finally {
    await client.end().catch(() => undefined);
  }
}

export type SubRow = { customer: string; startedAt: Date; endedAt: Date | null; plan: string | null };

export function normalizePostgresSubscriptions(rows: SubRow[], priceMap: PriceMap, currency = "usd"): NormalizedSubscription[] {
  const keys = Object.keys(priceMap);
  return rows.map((r, i) => {
    const price = (r.plan ? priceMap[r.plan] : undefined) ?? (keys.length === 1 ? priceMap[keys[0]] : undefined);
    return {
      id: `pg_${i}_${r.customer}`,
      customerId: r.customer,
      amountCents: price?.amountCents ?? 0,
      currency,
      interval: price?.interval ?? "month",
      intervalCount: 1,
      status: r.endedAt ? "canceled" : "active",
      startedAt: r.startedAt,
      canceledAt: r.endedAt,
    };
  });
}

export function parsePriceMap(text: string): PriceMap {
  // "premium=399/week, premium_plus=599/week, pro=2900/month"
  const out: PriceMap = {};
  for (const part of text.split(/[,\n]/)) {
    const m = part.trim().match(/^([A-Za-z0-9_.-]+)\s*=\s*(\d+)\s*\/\s*(day|week|month|year)$/i);
    if (!m) continue;
    out[m[1]] = { amountCents: Number(m[2]), interval: m[3].toLowerCase() as "day" | "week" | "month" | "year" };
  }
  return out;
}

export const postgresRevenueAdapter: RevenueAdapter = {
  async fetchRevenue(credentials) {
    const c = credentials as PostgresCredentials;
    if (!c.subs) return { subscriptions: [], charges: [], dataSince: null, hasProducts: false };
    const { table, customer, startedAt, endedAt, plan } = c.subs;
    const rows = await withClient(c.connectionString, (query) =>
      query(`SELECT ${q(customer)} AS customer, ${q(startedAt)} AS started_at, ${endedAt ? q(endedAt) : "NULL"} AS ended_at, ${plan ? q(plan) : "NULL"} AS plan FROM ${q(table)} WHERE ${q(startedAt)} IS NOT NULL ORDER BY ${q(startedAt)} DESC LIMIT 5000`),
    );
    const subs = normalizePostgresSubscriptions(
      rows.map((r) => ({ customer: String(r.customer), startedAt: new Date(r.started_at as string), endedAt: r.ended_at ? new Date(r.ended_at as string) : null, plan: r.plan == null ? null : String(r.plan) })),
      c.subs.priceMap,
    );
    const dataSince = subs.reduce<Date | null>((min, s) => (min === null || s.startedAt < min ? s.startedAt : min), null);
    return { subscriptions: subs, charges: [], dataSince, hasProducts: Object.keys(c.subs.priceMap).length > 0 };
  },
};

export const postgresAnalyticsAdapter: AnalyticsAdapter = {
  async fetchSignals(credentials, now = new Date()) {
    const c = credentials as PostgresCredentials;
    const since = new Date(now.getTime() - 30 * DAY_MS).toISOString();
    const rows = await withClient(c.connectionString, (query) => query(`SELECT count(*)::int AS n FROM ${q(c.usersTable)} WHERE ${q(c.usersCreatedAt)} > '${since}'`));
    return { signups30d: Number(rows[0]?.n ?? 0) };
  },
};

/** Cheap validation used at connect time: the users query must run. */
export async function probePostgres(c: PostgresCredentials): Promise<{ ok: true; signups30d: number; subscriptions: number | null } | { ok: false; error: string }> {
  try {
    const signals = await postgresAnalyticsAdapter.fetchSignals(c);
    let subscriptions: number | null = null;
    if (c.subs) {
      const rows = await withClient(c.connectionString, (query) => query(`SELECT count(*)::int AS n FROM ${q(c.subs!.table)}`));
      subscriptions = Number(rows[0]?.n ?? 0);
    }
    return { ok: true, signups30d: signals.signups30d ?? 0, subscriptions };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

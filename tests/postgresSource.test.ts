import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { normalizePostgresSubscriptions, parsePriceMap, postgresAnalyticsAdapter, postgresRevenueAdapter, probePostgres } from "@/lib/sources/postgres";
import type { PostgresCredentials } from "@/lib/sources";

const PORT = 5498;
let server: PGLiteSocketServer;
let db: PGlite;

const creds: PostgresCredentials = {
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres?sslmode=disable`,
  usersTable: "users",
  usersCreatedAt: "created_at",
  subs: { table: "subscriptions", customer: "user_id", startedAt: "subscribed_date", endedAt: "unsubscribed_date", plan: "tier", priceMap: parsePriceMap("premium=399/week, premium_plus=599/week") },
};

describe("postgres source over the wire", () => {
  beforeAll(async () => {
    db = await PGlite.create();
    await db.exec(`
      create table users (id serial primary key, created_at timestamptz not null);
      insert into users (created_at) values (now() - interval '2 days'), (now() - interval '10 days'), (now() - interval '45 days');
      create table subscriptions (id serial primary key, user_id text not null, tier text, subscribed_date timestamptz not null, unsubscribed_date timestamptz);
      insert into subscriptions (user_id, tier, subscribed_date, unsubscribed_date) values
        ('u1', 'premium', now() - interval '60 days', null),
        ('u2', 'premium_plus', now() - interval '40 days', now() - interval '5 days'),
        ('u3', 'premium', now() - interval '3 days', null);
    `);
    server = new PGLiteSocketServer({ db, port: PORT, host: "127.0.0.1" });
    await server.start();
  });
  afterAll(async () => {
    await server.stop();
    await db.close();
  });

  it("parses price maps", () => {
    expect(parsePriceMap("premium=399/week, premium_plus=599/week\npro = 2900 / month")).toEqual({
      premium: { amountCents: 399, interval: "week" },
      premium_plus: { amountCents: 599, interval: "week" },
      pro: { amountCents: 2900, interval: "month" },
    });
    expect(parsePriceMap("garbage")).toEqual({});
  });

  it("counts recent signups and maps subscriptions", async () => {
    const signals = await postgresAnalyticsAdapter.fetchSignals(creds);
    expect(signals.signups30d).toBe(2);
    const rev = await postgresRevenueAdapter.fetchRevenue(creds);
    expect(rev.subscriptions).toHaveLength(3);
    const u2 = rev.subscriptions.find((s) => s.customerId === "u2")!;
    expect(u2.status).toBe("canceled");
    expect(u2.amountCents).toBe(599);
    expect(u2.interval).toBe("week");
    expect(rev.hasProducts).toBe(true);
    const probe = await probePostgres(creds);
    expect(probe).toMatchObject({ ok: true, signups30d: 2, subscriptions: 3 });
  });

  it("refuses unsafe identifiers and reports connection errors", async () => {
    await expect(postgresAnalyticsAdapter.fetchSignals({ ...creds, usersTable: "users; drop table users" })).rejects.toThrow(/Unsafe identifier/);
    const bad = await probePostgres({ ...creds, connectionString: `postgresql://postgres:postgres@127.0.0.1:1/postgres?sslmode=disable` });
    expect(bad.ok).toBe(false);
  });

  it("falls back to the single price when there is no plan column", () => {
    const subs = normalizePostgresSubscriptions([{ customer: "a", startedAt: new Date(), endedAt: null, plan: null }], { only: { amountCents: 1000, interval: "month" } });
    expect(subs[0].amountCents).toBe(1000);
  });
});

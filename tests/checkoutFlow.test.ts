import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

process.env.PGLITE_MEMORY = "1";
process.env.CHECKOUT_PROVIDER = "mock";
process.env.MOCK_WEBHOOK_SECRET = "test-secret";
delete process.env.DATABASE_URL;

describe("wrapped checkout end to end (mock provider)", () => {
  let db: Awaited<ReturnType<typeof import("@/lib/db").getDb>>;
  let schema: typeof import("@/lib/db").schema;
  let appId: string;
  let userId: string;

  beforeAll(async () => {
    const mod = await import("@/lib/db");
    db = await mod.getDb();
    schema = mod.schema;
    const [user] = await db.insert(schema.users).values({ email: "founder@x.co", passwordHash: "x" }).returning();
    userId = user.id;
    const [app] = await db.insert(schema.apps).values({ userId, name: "Bookly", siteKey: "fos_bookly", url: "https://bookly.lovable.app" }).returning();
    appId = app.id;
  });

  it("builds plans from the pricing interview, sells one, and records everything", async () => {
    const { saveInterview } = await import("@/lib/services/pricing");
    const { createPlansFromPricing, startCheckout, listPurchases, wrappedRevenueData, lifetimeWrappedRevenueCents } = await import("@/lib/services/checkout");
    const { handleCheckoutWebhook } = await import("@/lib/services/checkoutWebhooks");
    const { signMockWebhook } = await import("@/lib/checkout/mock");
    const { ingestCollect } = await import("@/lib/services/attribution");
    const { channelReport } = await import("@/lib/services/attribution");

    const [app] = await db.select().from(schema.apps).where(eq(schema.apps.id, appId));
    await saveInterview(app, {
      audience: "smb",
      replaces: "manual_work",
      replacesCostMonthly: 200,
      valueMetric: "flat",
      frequency: "weekly",
      comparables: "Calendly",
      comparablePriceMonthly: 12,
      wtpTooCheap: 5,
      wtpTooExpensive: 60,
      activationEvent: "books first appointment",
      costToServeMonthly: 1,
    });
    const created = await createPlansFromPricing(app, "live");
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    // 3 tiers × (monthly + yearly)
    expect(created.plans).toHaveLength(6);
    const monthly = created.plans.find((p) => p.tierKey === "growth" && p.interval === "month")!;

    // A visitor arrives from Reddit, signs up, views checkout.
    await ingestCollect(app, { anonId: "anon_1", event: "pageview", source: { referrer: "https://www.reddit.com/r/lovable" }, path: "/" });
    await ingestCollect(app, { anonId: "anon_1", event: "signup" });

    const start = await startCheckout(monthly, app, { anonId: "anon_1", email: "buyer@x.co" });
    expect(start.ok).toBe(true);
    if (!start.ok) return;
    expect(start.url).toContain("/pay/mock/");
    const [session] = await db.select().from(schema.checkoutSessions).where(eq(schema.checkoutSessions.planId, monthly.id));

    const meta = { fos_app_id: appId, fos_plan_id: monthly.id, fos_checkout_session_id: session.id, fos_anon_id: "anon_1", fos_mode: "live" };
    const signed = signMockWebhook({ type: "payment.succeeded", data: { payment_id: "pay_1", subscription_id: "sub_1", customer_id: "cus_1", customer_email: "buyer@x.co", amount: monthly.amountCents, currency: "usd", metadata: meta } });
    const res = await handleCheckoutWebhook("mock", signed.body, new Headers(signed.headers));
    expect(res.status).toBe(200);
    expect(res.body.processed).toBe(1);

    const sub = signMockWebhook({ type: "subscription.active", data: { subscription_id: "sub_1", customer_id: "cus_1", amount: monthly.amountCents, currency: "usd", interval: "month", metadata: meta } });
    expect((await handleCheckoutWebhook("mock", sub.body, new Headers(sub.headers))).status).toBe(200);

    // Replay is idempotent.
    const replay = await handleCheckoutWebhook("mock", signed.body, new Headers(signed.headers));
    expect(replay.body.skipped).toBe(1);

    // Tampered body is rejected.
    const bad = await handleCheckoutWebhook("mock", signed.body + " ", new Headers(signed.headers));
    expect(bad.status).toBe(400);

    const purchases = await listPurchases(appId);
    expect(purchases).toHaveLength(1);
    expect(purchases[0].feeCents).toBe(Math.round(monthly.amountCents * 0.06) + 50);
    expect(purchases[0].netCents).toBe(monthly.amountCents - purchases[0].feeCents);
    expect(purchases[0].kind).toBe("subscription");
    expect(purchases[0].anonId).toBe("anon_1");

    const [updatedSession] = await db.select().from(schema.checkoutSessions).where(eq(schema.checkoutSessions.id, session.id));
    expect(updatedSession.status).toBe("completed");

    const [updatedApp] = await db.select().from(schema.apps).where(eq(schema.apps.id, appId));
    expect(updatedApp.firstPurchaseAt).not.toBeNull();
    expect(updatedApp.snippetInstalledAt).not.toBeNull();

    const report = await channelReport(appId);
    expect(report.rows[0].channel).toBe("reddit");
    expect(report.rows[0].purchases).toBe(1);
    expect(report.rows[0].revenueCents).toBe(monthly.amountCents);

    const wrapped = await wrappedRevenueData(appId);
    expect(wrapped.data.subscriptions).toHaveLength(1);
    expect(wrapped.data.subscriptions[0].status).toBe("active");
    expect(await lifetimeWrappedRevenueCents(userId)).toBe(monthly.amountCents);

    const events = await db.select().from(schema.productEvents);
    const names = events.map((e) => e.name);
    expect(names).toEqual(expect.arrayContaining(["pricing_completed", "checkout_enabled", "checkout_live", "snippet_installed", "first_purchase"]));
  });

  it("the diagnosis moves to stage 2 with a live subscriber", async () => {
    const { runAssessment, buildDiagnosis } = await import("@/lib/services/diagnosis");
    const [app] = await db.select().from(schema.apps).where(eq(schema.apps.id, appId));
    const result = await runAssessment(app);
    expect(result.placement.stage).toBe(2);
    expect(result.metrics.payingUsers).toBe(1);
    expect(result.metrics.signups30d).toBe(1);
    const d = await buildDiagnosis(app, result);
    expect(d.stageName).toBe("First dollars");
    expect(d.numbers[0].value).toBe("1");
  });
});

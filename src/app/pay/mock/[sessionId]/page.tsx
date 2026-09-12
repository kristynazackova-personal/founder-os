import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { signMockWebhook } from "@/lib/checkout/mock";
import { handleCheckoutWebhook } from "@/lib/services/checkoutWebhooks";
import { shortId } from "@/lib/crypto";
import { formatMoney } from "@/lib/domain/money";
import { ModeBadge } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

async function load(sessionId: string) {
  const db = await getDb();
  const [row] = await db
    .select({ session: schema.checkoutSessions, plan: schema.plans, app: schema.apps })
    .from(schema.checkoutSessions)
    .innerJoin(schema.plans, eq(schema.plans.id, schema.checkoutSessions.planId))
    .innerJoin(schema.apps, eq(schema.apps.id, schema.checkoutSessions.appId))
    .where(eq(schema.checkoutSessions.providerSessionId, sessionId))
    .limit(1);
  return row ?? null;
}

async function simulate(sessionId: string, formData: FormData) {
  "use server";
  const row = await load(sessionId);
  if (!row || row.session.provider !== "mock") notFound();
  const email = String(formData.get("email") ?? "").trim() || "buyer@example.com";
  const customerId = `cus_${email.replace(/[^a-z0-9]/gi, "").slice(0, 12) || shortId(6)}`;
  const meta = { fos_app_id: row.app.id, fos_plan_id: row.plan.id, fos_checkout_session_id: row.session.id, fos_anon_id: row.session.anonId ?? "", fos_mode: row.plan.mode };
  const subscriptionId = row.plan.model === "subscription" ? `msub_${shortId(12)}` : null;
  const pay = signMockWebhook({ type: "payment.succeeded", data: { payment_id: `mpay_${shortId(12)}`, subscription_id: subscriptionId, customer_id: customerId, customer_email: email, product_id: row.plan.providerProductId, amount: row.plan.amountCents, currency: row.plan.currency, metadata: meta } });
  await handleCheckoutWebhook("mock", pay.body, new Headers(pay.headers));
  if (subscriptionId) {
    const sub = signMockWebhook({ type: "subscription.active", data: { subscription_id: subscriptionId, customer_id: customerId, customer_email: email, product_id: row.plan.providerProductId, amount: row.plan.amountCents, currency: row.plan.currency, interval: row.plan.interval === "year" ? "year" : "month", metadata: meta } });
    await handleCheckoutWebhook("mock", sub.body, new Headers(sub.headers));
  }
  redirect(`/pay/success?s=${row.session.id}`);
}

export default async function MockPayPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const row = await load(sessionId);
  if (!row || row.session.provider !== "mock") notFound();
  const action = simulate.bind(null, sessionId);
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
      <div className="card p-8">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Simulated payment page</div>
          <ModeBadge mode={row.plan.mode} />
        </div>
        <p className="mt-2 text-sm text-[var(--muted)]">This stands in for the merchant-of-record checkout. Nothing is charged. Completing it sends a signed webhook through the same path a real provider uses.</p>
        <div className="mt-5 rounded-xl border border-stone-200 p-4">
          <div className="text-sm text-[var(--muted)]">{row.app.name}</div>
          <div className="font-semibold">{row.plan.name}</div>
          <div className="text-2xl font-bold tabular-nums">
            {formatMoney(row.plan.amountCents, row.plan.currency)}
            {row.plan.interval ? <span className="text-sm font-normal text-[var(--muted)]"> / {row.plan.interval}</span> : null}
          </div>
        </div>
        {row.session.status === "completed" ? (
          <p className="mt-4 text-sm text-emerald-700">This session was already paid.</p>
        ) : (
          <form action={action} className="mt-5 space-y-3">
            <div>
              <label className="label" htmlFor="email">
                Customer email
              </label>
              <input id="email" name="email" type="email" className="input" defaultValue="buyer@example.com" />
            </div>
            <SubmitButton className="btn btn-primary w-full" pendingText="Paying…">
              Simulate successful payment
            </SubmitButton>
          </form>
        )}
      </div>
    </main>
  );
}

import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { billingConfigured, getBillingState } from "@/lib/services/billing";
import { WRAPPED_FREE_UNTIL_CENTS } from "@/lib/domain/billing";
import { formatMoney } from "@/lib/domain/money";
import { startBillingCheckoutAction } from "@/app/actions/billing";
import { logoutAction } from "@/app/actions/auth";
import { Brand } from "@/components/Brand";
import { Alert, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const user = await requireUser();
  const q = await searchParams;
  const state = await getBillingState(user);
  const progress = Math.min(100, Math.round((state.lifetimeWrappedRevenueCents / WRAPPED_FREE_UNTIL_CENTS) * 100));

  return (
    <div className="min-h-screen">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <Brand href="/app" />
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/app" className="hover:underline">
                Apps
              </Link>
              <Link href="/billing" className="font-semibold">
                Billing
              </Link>
            </nav>
          </div>
          <form action={logoutAction}>
            <button className="btn btn-secondary py-1.5">Log out</button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">
        <PageHeader title="Billing" subtitle="We charge when you get paid. Nothing before the first dollar." />
        {q.success ? <Alert kind="good">Thanks - your plan is active as soon as Stripe confirms the payment.</Alert> : null}
        {q.error ? <Alert kind="bad">{q.error}</Alert> : null}

        <section className="card mt-4 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Your plan</div>
              <div className="mt-1 text-2xl font-bold">
                {state.status === "free" ? "Free" : state.status === "trial" ? "Trial" : state.status === "active" ? `Founder OS · $${state.planCents / 100}/mo` : "Unlock required"}
              </div>
            </div>
            {state.status === "unlock_required" || state.status === "trial" ? (
              <form action={startBillingCheckoutAction}>
                <SubmitButton pendingText="Opening Stripe…">Unlock for ${state.planCents / 100}/mo</SubmitButton>
              </form>
            ) : null}
          </div>
          <p className="mt-3 text-sm">{state.message}</p>
          {state.track !== "connected" ? (
            <div className="mt-4">
              <div className="flex justify-between text-xs text-[var(--muted)]">
                <span>Revenue through checkout: {formatMoney(state.lifetimeWrappedRevenueCents)}</span>
                <span>Free until {formatMoney(WRAPPED_FREE_UNTIL_CENTS)}</span>
              </div>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-stone-200">
                <div className="h-full bg-stone-900" style={{ width: `${progress}%` }} />
              </div>
            </div>
          ) : null}
          {!billingConfigured() && state.status !== "free" && state.status !== "active" ? <p className="help mt-3">Billing isn&apos;t wired to Stripe on this deployment yet, so nothing is locked.</p> : null}
        </section>

        <section className="card mt-4 p-6 text-sm">
          <h2 className="font-semibold">How it works</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--muted)]">
            <li>Checkout through Founder OS: free until $500 lifetime revenue, then $39/mo. Plus 6% + 50¢ per transaction, which covers the merchant of record, tax and payouts.</li>
            <li>Already on Stripe and only reading data: 14-day trial from the day you connect, then $29/mo.</li>
            <li>The pricing engine stays free for everyone, always.</li>
          </ul>
        </section>
      </main>
    </div>
  );
}

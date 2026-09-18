import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { Brand } from "@/components/Brand";

export default async function LandingPage() {
  const user = await getCurrentUser();
  return (
    <main>
      <header className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-6">
        <Brand />
        <nav className="flex flex-wrap items-center gap-3 text-sm">
          <Link href="/pricing-engine" className="hover:underline">
            Free pricing engine
          </Link>
          {user ? (
            <Link href="/app" className="btn btn-primary">
              Open dashboard
            </Link>
          ) : (
            <>
              <Link href="/login" className="hover:underline">
                Log in
              </Link>
              <Link href="/signup" className="btn btn-primary">
                Get started
              </Link>
            </>
          )}
        </nav>
      </header>

      <section className="mx-auto max-w-5xl px-4 pt-16 pb-12">
        <p className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">For apps built on Lovable, Bolt, Replit and Base44</p>
        <h1 className="mt-3 max-w-3xl text-5xl font-bold tracking-tight">Diagnose, price, charge.</h1>
        <p className="mt-5 max-w-2xl text-lg text-[var(--muted)]">
          You built the app in a weekend. Now find out what stage you&apos;re at, what to charge, and turn on checkout without touching a backend. Free until you get paid — then 6% + 50¢ on what goes through.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href={user ? "/app" : "/signup"} className="btn btn-primary">
            Connect your app
          </Link>
          <Link href="/pricing-engine" className="btn btn-secondary">
            Try the pricing engine — no account
          </Link>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-4 px-4 pb-20 md:grid-cols-3">
        {[
          { n: "1", title: "Connect and assess", body: "Read-only Stripe, Lemon Squeezy or Paddle. Under five minutes to a stage, three numbers, one sentence and one action for this week." },
          { n: "2", title: "Price it", body: "Eight questions. A model, tiers and price points with the reasoning in plain language, plus a pricing block you paste into Lovable." },
          { n: "3", title: "Charge for it", body: "Hosted checkout and an embeddable button. Tax, payouts and refunds handled. A one-line snippet tells you which channel your paying users came from." },
        ].map((s) => (
          <div key={s.n} className="card p-6">
            <div className="text-sm font-bold text-[var(--muted)]">{s.n}</div>
            <h3 className="mt-2 text-lg font-semibold">{s.title}</h3>
            <p className="mt-2 text-sm text-[var(--muted)]">{s.body}</p>
          </div>
        ))}
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-24">
        <div className="card p-8">
          <h2 className="text-xl font-bold">Pricing that charges when you get paid</h2>
          <ul className="mt-4 grid gap-3 text-sm md:grid-cols-3">
            <li className="rounded-xl border border-stone-200 p-4">
              <div className="font-semibold">Free</div>
              <div className="text-[var(--muted)]">Diagnosis, stage KPIs, pricing engine, checkout. Until $500 lifetime revenue through checkout.</div>
            </li>
            <li className="rounded-xl border border-stone-200 p-4">
              <div className="font-semibold">$39 / month after $500</div>
              <div className="text-[var(--muted)]">Unlocks automatically once checkout has earned you $500. Plus 6% + 50¢ per transaction.</div>
            </li>
            <li className="rounded-xl border border-stone-200 p-4">
              <div className="font-semibold">$29 / month, Stripe-connected</div>
              <div className="text-[var(--muted)]">Already charging on Stripe? Connect read-only. 14-day trial, then $29.</div>
            </li>
          </ul>
        </div>
      </section>
    </main>
  );
}

import { notFound, redirect } from "next/navigation";
import { planBySlug, recordCheckoutView, startCheckout } from "@/lib/services/checkout";
import { formatMoney } from "@/lib/domain/money";
import { ModeBadge } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

async function payAction(slug: string, formData: FormData) {
  "use server";
  const found = await planBySlug(slug);
  if (!found) notFound();
  const anonId = String(formData.get("anonId") ?? "").slice(0, 64) || null;
  const email = String(formData.get("email") ?? "").trim().slice(0, 200) || null;
  const res = await startCheckout(found.plan, found.app, { anonId, email });
  if (!res.ok) redirect(`/pay/${slug}?error=${encodeURIComponent(res.error)}`);
  redirect(res.url);
}

export default async function PayPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ fos?: string; error?: string }> }) {
  const { slug } = await params;
  const q = await searchParams;
  const found = await planBySlug(slug);
  if (!found || !found.plan.active) notFound();
  const { plan, app } = found;
  const anonId = q.fos && /^[a-z0-9_-]{4,64}$/i.test(q.fos) ? q.fos : null;
  await recordCheckoutView(app, anonId);
  const action = payAction.bind(null, slug);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
      <div className="card p-8">
        <div className="flex items-center justify-between">
          <div className="text-sm text-[var(--muted)]">{app.name}</div>
          {plan.mode === "test" ? <ModeBadge mode="test" /> : null}
        </div>
        <h1 className="mt-2 text-2xl font-bold">{plan.name}</h1>
        <div className="mt-3 text-4xl font-bold tabular-nums">
          {formatMoney(plan.amountCents, plan.currency)}
          {plan.interval ? <span className="text-base font-normal text-[var(--muted)]"> / {plan.interval}</span> : null}
        </div>
        {plan.mode === "test" ? <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">Test mode: no card will be charged.</p> : null}
        {q.error ? <p className="mt-3 text-sm text-red-700">{q.error}</p> : null}
        <form action={action} className="mt-6 space-y-3">
          <input type="hidden" name="anonId" value={anonId ?? ""} />
          <div>
            <label className="label" htmlFor="email">
              Email for your receipt
            </label>
            <input id="email" name="email" type="email" className="input" placeholder="you@example.com" />
          </div>
          <SubmitButton className="btn btn-primary w-full" pendingText="Opening secure checkout…">
            Continue to payment
          </SubmitButton>
        </form>
        <p className="mt-4 text-center text-xs text-[var(--muted)]">Secure checkout. Taxes calculated at payment. {plan.interval ? "Cancel anytime." : ""}</p>
      </div>
    </main>
  );
}

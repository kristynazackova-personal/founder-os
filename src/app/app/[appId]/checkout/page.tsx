import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getAppForUser } from "@/lib/services/apps";
import { getInterview } from "@/lib/services/pricing";
import { checkoutUrl, embedButtonHtml, listPlans, listPurchases, listWrappedSubscriptions } from "@/lib/services/checkout";
import { providerStatus } from "@/lib/checkout";
import { formatMoney } from "@/lib/domain/money";
import { setModeAction } from "@/app/actions/checkout";
import { CreatePlansForm } from "@/components/CreatePlansForm";
import { CopyButton } from "@/components/CopyButton";
import { Alert, Empty, ModeBadge, PageHeader, fmtDate } from "@/components/ui";

export default async function CheckoutPage({ params }: { params: Promise<{ appId: string }> }) {
  const user = await requireUser();
  const { appId } = await params;
  const app = await getAppForUser(appId, user.id);
  if (!app) notFound();
  const mode = app.checkoutMode as "test" | "live";
  const [interview, plans, purchases, subs] = await Promise.all([getInterview(app.id), listPlans(app.id, mode), listPurchases(app.id), listWrappedSubscriptions(app.id)]);
  const provider = providerStatus();
  const modePurchases = purchases.filter((p) => p.mode === mode);
  const otherMode = mode === "live" ? "test" : "live";

  if (!interview?.completedAt) {
    return (
      <Empty title="Checkout is built from your pricing" cta={{ href: `/app/${app.id}/pricing`, label: "Run the pricing interview" }}>
        Finish the eight questions and every tier becomes a product with a hosted checkout link and an embeddable button.
      </Empty>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Checkout"
        subtitle="Hosted links and an embeddable button. Tax, payouts and refunds are handled through us; you keep the customer relationship. 6% + 50¢ per transaction, nothing else."
        actions={
          <form action={setModeAction.bind(null, app.id, otherMode)}>
            <button className="btn btn-secondary">
              Switch to {otherMode} mode
            </button>
          </form>
        }
      />
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold">You are editing:</span>
        <ModeBadge mode={mode} />
        <span className="text-sm text-[var(--muted)]">{mode === "live" ? "Real money. Links below charge real cards." : "Test mode. Nothing is charged; use it to check the flow."}</span>
      </div>
      {!provider.configured ? <Alert kind="warn">{provider.note}</Alert> : provider.active === "mock" ? <Alert kind="warn">{provider.note}</Alert> : null}

      <section className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Plans ({mode})</h2>
            <p className="help">Built from the pricing engine. Rebuilding retires the old set and creates new products.</p>
          </div>
          <CreatePlansForm appId={app.id} mode={mode} hasPlans={plans.length > 0} />
        </div>
        {plans.length ? (
          <table className="data mt-4">
            <thead>
              <tr>
                <th>Plan</th>
                <th>Price</th>
                <th>Hosted link</th>
                <th>Embed</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id}>
                  <td className="font-semibold">{p.name}</td>
                  <td>
                    {formatMoney(p.amountCents, p.currency)}
                    {p.interval ? <span className="text-[var(--muted)]">/{p.interval}</span> : <span className="text-[var(--muted)]"> once</span>}
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <a href={checkoutUrl(p)} target="_blank" rel="noreferrer" className="text-xs underline">
                        {checkoutUrl(p).replace(/^https?:\/\//, "")}
                      </a>
                      <CopyButton text={checkoutUrl(p)} label="Copy" className="py-1 text-xs" />
                    </div>
                  </td>
                  <td>
                    <CopyButton text={embedButtonHtml(p)} label="Copy button HTML" className="py-1 text-xs" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-4 text-sm text-[var(--muted)]">No {mode} plans yet.</p>
        )}
        {plans.length ? (
          <p className="help mt-3">
            The pricing page block on the{" "}
            <Link className="underline" href={`/app/${app.id}/pricing`}>
              Pricing
            </Link>{" "}
            tab now links to these. Paste it into Lovable and you&apos;re charging.
          </p>
        ) : null}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-6">
          <h2 className="font-semibold">Purchases ({mode})</h2>
          {modePurchases.length ? (
            <table className="data mt-3">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Customer</th>
                  <th>Kind</th>
                  <th>Gross</th>
                  <th>Net to you</th>
                </tr>
              </thead>
              <tbody>
                {modePurchases.map((p) => (
                  <tr key={p.id} className={p.refundedAt ? "line-through opacity-60" : ""}>
                    <td>{fmtDate(p.occurredAt)}</td>
                    <td>{p.customerEmail ?? p.providerCustomerId ?? "—"}</td>
                    <td>{p.kind}</td>
                    <td>{formatMoney(p.amountCents, p.currency)}</td>
                    <td className="font-semibold">{formatMoney(p.netCents, p.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-3 text-sm text-[var(--muted)]">No {mode} purchases yet.</p>
          )}
        </section>
        <section className="card p-6">
          <h2 className="font-semibold">Subscriptions</h2>
          {subs.length ? (
            <table className="data mt-3">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Mode</th>
                </tr>
              </thead>
              <tbody>
                {subs.map((s) => (
                  <tr key={s.id}>
                    <td>{s.customerEmail ?? s.providerCustomerId ?? "—"}</td>
                    <td>
                      {formatMoney(s.amountCents, s.currency)}/{s.interval}
                    </td>
                    <td>{s.status === "active" ? <span className="badge badge-good">active</span> : <span className="badge">{s.status}</span>}</td>
                    <td>
                      <ModeBadge mode={s.mode} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-3 text-sm text-[var(--muted)]">No subscriptions yet.</p>
          )}
        </section>
      </div>
    </div>
  );
}

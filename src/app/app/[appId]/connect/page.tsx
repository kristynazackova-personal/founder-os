import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getAppForUser } from "@/lib/services/apps";
import { listSources, sourceIdentity } from "@/lib/services/sources";
import { stripeConnectConfigured } from "@/lib/env";
import { SOURCE_LABEL, type SourceType } from "@/lib/sources";
import { disconnectSourceAction } from "@/app/actions/sources";
import { Ga4Form, LemonSqueezyForm, PaddleForm } from "@/components/ConnectForms";
import { Alert, PageHeader, fmtDate } from "@/components/ui";

export default async function ConnectPage({ params, searchParams }: { params: Promise<{ appId: string }>; searchParams: Promise<{ welcome?: string; stripe?: string; error?: string; replace?: string; connected?: string }> }) {
  const user = await requireUser();
  const { appId } = await params;
  const q = await searchParams;
  const app = await getAppForUser(appId, user.id);
  if (!app) notFound();
  const sources = await listSources(app.id);
  const has = (t: SourceType) => sources.find((s) => s.type === t);
  const replacing = q.replace as SourceType | undefined;
  const base = `/app/${app.id}/connect`;
  /** Connected summary with Replace, or the form (with Cancel when replacing). */
  const slot = (t: SourceType, form: React.ReactNode) => {
    const row = has(t);
    if (row && replacing !== t) {
      return (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-emerald-700">Connected · {sourceIdentity(row)}</span>
          <Link href={`${base}?replace=${t}`} className="btn btn-secondary py-1 text-xs">
            Replace
          </Link>
        </div>
      );
    }
    return (
      <div className="space-y-3">
        {row ? (
          <p className="text-sm text-[var(--muted)]">
            Paste a new credential to replace the current one. The old one is overwritten, never shown.{" "}
            <Link href={base} className="underline">
              Cancel
            </Link>
          </p>
        ) : null}
        {form}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Connect payment data"
        subtitle="Read-only. We never see a secret key for Stripe, and the keys you paste for other providers are encrypted at rest, used only to read, and never displayed again — you can replace or disconnect them, not view them. Connect one and the diagnosis reads your real numbers."
        actions={
          <Link href={`/app/${app.id}`} className="btn btn-secondary">
            {sources.length ? "Back to diagnosis" : "Skip for now"}
          </Link>
        }
      />
      {q.welcome ? <Alert kind="good">App created. If you already charge somewhere, connect it now — otherwise skip ahead and price it.</Alert> : null}
      {q.stripe === "connected" ? <Alert kind="good">Stripe connected. Your diagnosis has been refreshed.</Alert> : null}
      {q.connected ? <Alert kind="good">Connected. Your diagnosis has been refreshed.</Alert> : null}
      {q.error ? <Alert kind="bad">{q.error}</Alert> : null}

      {sources.length ? (
        <section className="card p-6">
          <h2 className="font-semibold">Connected</h2>
          <table className="data mt-3">
            <thead>
              <tr>
                <th>Source</th>
                <th>Identifier</th>
                <th>Status</th>
                <th>Last read</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.id}>
                  <td className="font-semibold">{SOURCE_LABEL[s.type as SourceType] ?? s.type}</td>
                  <td className="text-[var(--muted)]">{sourceIdentity(s)}</td>
                  <td>
                    {s.status === "error" ? <span className="badge badge-bad">error</span> : <span className="badge badge-good">connected</span>}
                    {s.lastError ? <div className="mt-1 max-w-sm text-xs text-red-700">{s.lastError}</div> : null}
                  </td>
                  <td>{fmtDate(s.lastSyncedAt)}</td>
                  <td className="text-right">
                    <form action={disconnectSourceAction.bind(null, app.id, s.type as SourceType)}>
                      <button className="btn btn-danger py-1 text-xs">Disconnect</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-6">
          <h2 className="font-semibold">Stripe</h2>
          <p className="help">Read-only OAuth. You approve on Stripe; we get subscriptions, customers and charges, nothing else.</p>
          {has("stripe") ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-emerald-700">Connected · {sourceIdentity(has("stripe")!)}</span>
              {stripeConnectConfigured() ? (
                <a href={`/api/connect/stripe/start?app=${app.id}`} className="btn btn-secondary py-1 text-xs">
                  Reconnect
                </a>
              ) : null}
            </div>
          ) : stripeConnectConfigured() ? (
            <a href={`/api/connect/stripe/start?app=${app.id}`} className="btn btn-primary mt-4">
              Connect Stripe (read-only)
            </a>
          ) : (
            <Alert kind="warn">Stripe Connect isn&apos;t configured on this deployment (STRIPE_SECRET_KEY + STRIPE_CONNECT_CLIENT_ID).</Alert>
          )}
        </section>

        <section className="card p-6">
          <h2 className="font-semibold">Lemon Squeezy</h2>
          <p className="help">Reads subscriptions, orders and variants via an API key.</p>
          <div className="mt-4">{slot("lemonsqueezy", <LemonSqueezyForm appId={app.id} />)}</div>
        </section>

        <section className="card p-6">
          <h2 className="font-semibold">Paddle</h2>
          <p className="help">Paddle Billing. Sandbox keys are detected automatically.</p>
          <div className="mt-4">{slot("paddle", <PaddleForm appId={app.id} />)}</div>
        </section>

        <section className="card p-6">
          <h2 className="font-semibold">Google Analytics 4 (optional)</h2>
          <p className="help">Visitors and sign_up events fill the top of the funnel when the snippet isn&apos;t installed yet.</p>
          <div className="mt-4">{slot("ga4", <Ga4Form appId={app.id} />)}</div>
        </section>
      </div>

      <section className="card p-6">
        <h2 className="font-semibold">Nothing to connect yet?</h2>
        <p className="help">That&apos;s stage 0, and it&apos;s the point. Price the app, turn on checkout through us, and your payment data lives here from the first dollar.</p>
        <div className="mt-3 flex gap-2">
          <Link href={`/app/${app.id}/pricing`} className="btn btn-primary">
            Price it
          </Link>
          <Link href={`/app/${app.id}/attribution`} className="btn btn-secondary">
            Install the snippet
          </Link>
        </div>
      </section>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getAppForUser } from "@/lib/services/apps";
import { listSources, sourceIdentity } from "@/lib/services/sources";
import { getChecklist } from "@/lib/services/connectChecklists";
import { stripeConnectConfigured } from "@/lib/env";
import { disconnectSourceAction } from "@/app/actions/sources";
import { CONNECT_GUIDES, isSourceType, SourceIcon } from "@/components/connect/guides";
import { ConnectChecklist } from "@/components/connect/Checklist";
import { Ga4Form, LemonSqueezyForm, PaddleForm, StripeKeyForm } from "@/components/ConnectForms";
import { Alert, fmtDate } from "@/components/ui";

export default async function ConnectSourcePage({ params, searchParams }: { params: Promise<{ appId: string; source: string }>; searchParams: Promise<{ connected?: string; disconnected?: string; replace?: string; stripe?: string; error?: string }> }) {
  const user = await requireUser();
  const { appId, source } = await params;
  const q = await searchParams;
  const app = await getAppForUser(appId, user.id);
  if (!app || !isSourceType(source)) notFound();
  const guide = CONNECT_GUIDES[source];
  const [sources, done] = await Promise.all([listSources(app.id), getChecklist(app.id, source)]);
  const row = sources.find((s) => s.type === source) ?? null;
  const connected = Boolean(row) && !q.replace;
  const base = `/app/${app.id}/connect/${source}`;

  const form =
    source === "stripe" ? (
      <div className="space-y-4">
        <StripeKeyForm appId={app.id} />
        {stripeConnectConfigured() ? (
          <div className="border-t border-stone-200 pt-4 text-sm">
            <div className="font-semibold">Prefer not to handle a key?</div>
            <p className="help">Approve read-only access on Stripe&apos;s site instead; nothing to paste.</p>
            <a href={`/api/connect/stripe/start?app=${app.id}`} className="btn btn-secondary mt-2">
              Connect with Stripe (OAuth)
            </a>
          </div>
        ) : null}
      </div>
    ) : source === "lemonsqueezy" ? (
      <LemonSqueezyForm appId={app.id} />
    ) : source === "paddle" ? (
      <PaddleForm appId={app.id} />
    ) : (
      <Ga4Form appId={app.id} />
    );

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/app/${app.id}/connect`} className="text-sm text-[var(--muted)] hover:underline">
          ← All sources
        </Link>
        <div className="mt-3 flex items-start gap-4">
          <SourceIcon source={source} size={56} />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold tracking-tight">{guide.name}</h1>
            <p className="text-sm text-[var(--muted)]">{guide.reads}</p>
            <p className="mt-1 text-xs text-[var(--muted)]">About {guide.minutes} minute{guide.minutes === 1 ? "" : "s"}. Tick the steps as you go — we remember where you got to.</p>
          </div>
        </div>
      </div>

      {q.connected ? <Alert kind="good">Connected. Your diagnosis has been refreshed with {guide.name} data.</Alert> : null}
      {q.disconnected ? <Alert kind="info">{guide.name} disconnected.</Alert> : null}
      {q.stripe === "connected" ? <Alert kind="good">Stripe connected. Your diagnosis has been refreshed.</Alert> : null}
      {q.error ? <Alert kind="bad">{q.error}</Alert> : null}

      {row ? (
        <section className="card flex flex-wrap items-center justify-between gap-3 p-5">
          <div className="text-sm">
            <div className="flex items-center gap-2">
              {row.status === "error" ? <span className="badge badge-bad">needs attention</span> : <span className="badge badge-good">connected</span>}
              <span className="font-semibold">{sourceIdentity(row)}</span>
            </div>
            <div className="mt-1 text-[var(--muted)]">
              Connected {fmtDate(row.connectedAt)} · last read {fmtDate(row.lastSyncedAt)}
            </div>
            {row.lastError ? <div className="mt-1 max-w-xl text-xs text-red-700">{row.lastError}</div> : null}
          </div>
          <div className="flex gap-2">
            {q.replace ? (
              <Link href={base} className="btn btn-secondary py-1.5 text-xs">
                Cancel replace
              </Link>
            ) : (
              <Link href={`${base}?replace=1`} className="btn btn-secondary py-1.5 text-xs">
                Replace
              </Link>
            )}
            <form action={disconnectSourceAction.bind(null, app.id, source)}>
              <button className="btn btn-danger py-1.5 text-xs">Disconnect</button>
            </form>
          </div>
        </section>
      ) : null}

      <ConnectChecklist appId={app.id} source={source} steps={guide.steps} done={done} connected={connected} finalStep={connected ? "Done — the credential is stored encrypted and never shown again" : guide.finalStep}>
        {connected ? (
          <p className="text-sm text-[var(--muted)]">
            To swap the credential, use <em>Replace</em> above; to stop reading, <em>Disconnect</em>.
          </p>
        ) : (
          <>
            {row ? <p className="mb-3 text-sm text-[var(--muted)]">Paste a new credential to replace the current one. The old one is overwritten, never shown.</p> : null}
            {form}
          </>
        )}
      </ConnectChecklist>
    </div>
  );
}

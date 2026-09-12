import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getAppForUser } from "@/lib/services/apps";
import { listSources, sourceIdentity } from "@/lib/services/sources";
import { getChecklist, getDraft } from "@/lib/services/connectChecklists";
import { getEventSettings, isEventSource } from "@/lib/services/eventCatalog";
import { describeEventSettings } from "@/lib/domain/eventSettings";
import { stripeConnectConfigured } from "@/lib/env";
import { googleAdsConfigured } from "@/lib/sources/googleads";
import { disconnectSourceAction } from "@/app/actions/sources";
import { CONNECT_GUIDES, isSourceType, SourceIcon } from "@/components/connect/guides";
import { ConnectChecklist } from "@/components/connect/Checklist";
import { AppStoreForm, Ga4Form, GoogleAdsForm, LemonSqueezyForm, MixpanelForm, PaddleForm, PostgresForm, StripeKeyForm } from "@/components/ConnectForms";
import { Alert, fmtDate } from "@/components/ui";

export default async function ConnectSourcePage({ params, searchParams }: { params: Promise<{ appId: string; source: string }>; searchParams: Promise<{ connected?: string; disconnected?: string; replace?: string; stripe?: string; error?: string; empty?: string; signups?: string; subs?: string; draft?: string; events?: string }> }) {
  const user = await requireUser();
  const { appId, source } = await params;
  const q = await searchParams;
  const app = await getAppForUser(appId, user.id);
  if (!app || !isSourceType(source)) notFound();
  const guide = CONNECT_GUIDES[source];
  const [sources, done, draftView] = await Promise.all([listSources(app.id), getChecklist(app.id, source), getDraft(app.id, source)]);
  const draft = draftView.fields;
  const secretsOnFile = draftView.secretsOnFile;
  const hasDraft = Object.keys(draft).length > 0 || secretsOnFile.length > 0;
  const row = sources.find((s) => s.type === source) ?? null;
  const eventSettings = row && isEventSource(source) ? await getEventSettings(app.id, source) : null;
  const connected = Boolean(row) && !q.replace;
  const base = `/app/${app.id}/connect/${source}`;

  const form =
    source === "stripe" ? (
      <div className="space-y-4">
        <StripeKeyForm appId={app.id} secretsOnFile={secretsOnFile} />
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
      <LemonSqueezyForm appId={app.id} draft={draft} secretsOnFile={secretsOnFile} />
    ) : source === "paddle" ? (
      <PaddleForm appId={app.id} secretsOnFile={secretsOnFile} />
    ) : source === "appstore" ? (
      <AppStoreForm appId={app.id} draft={draft} secretsOnFile={secretsOnFile} />
    ) : source === "mixpanel" ? (
      <MixpanelForm appId={app.id} draft={draft} secretsOnFile={secretsOnFile} />
    ) : source === "postgres" ? (
      <PostgresForm appId={app.id} draft={draft} secretsOnFile={secretsOnFile} />
    ) : source === "googleads" ? (
      <GoogleAdsForm appId={app.id} draft={draft} secretsOnFile={secretsOnFile} />
    ) : (
      <Ga4Form appId={app.id} draft={draft} secretsOnFile={secretsOnFile} />
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

      {q.connected ? (
        <Alert kind="good">
          Connected. Your diagnosis has been refreshed with {guide.name} data.
          {q.signups !== undefined ? ` ${q.signups} sign-ups in the last 30 days${q.subs !== undefined ? `, ${q.subs} subscription rows` : ""}.` : ""}
          {q.empty ? " Apple returned no report for the last 7 days yet — that's normal for a new app; numbers appear as reports land." : ""}
        </Alert>
      ) : null}
      {q.disconnected ? <Alert kind="info">{guide.name} disconnected.</Alert> : null}
      {source === "googleads" && !googleAdsConfigured() ? (
        <Alert kind="warn">
          Google Ads is not switched on for this deployment yet, so connecting will fail however good your token is. Three variables have to be set on the server first —{" "}
          <code>GOOGLE_ADS_DEVELOPER_TOKEN</code>, <code>GOOGLE_OAUTH_CLIENT_ID</code> and <code>GOOGLE_OAUTH_CLIENT_SECRET</code> — and the client id and secret must be the same pair you used to mint the refresh token, or Google rejects it as <code>invalid_grant</code>. The developer token comes from a Google Ads manager account under <em>Admin → API Center</em>.
        </Alert>
      ) : null}
      {q.events ? <Alert kind="good">Event settings saved. Your diagnosis has been refreshed.</Alert> : null}
      {q.draft ? <Alert kind="info">Draft saved. Keys and secrets are stored encrypted and never shown again — leave those fields blank when you finish, or paste a new one to replace what&apos;s on file.</Alert> : null}
      {!q.draft && hasDraft && !connected ? <Alert kind="info">You have a saved draft; the fields below are filled from it{secretsOnFile.length ? ", and the secret is on file" : ""}.</Alert> : null}
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
            {isEventSource(source) ? (
              <div className="mt-1 text-[var(--muted)]">
                {describeEventSettings(eventSettings, null)}{" "}
                <Link href={`${base}/events`} className="font-semibold text-stone-900 underline">
                  Change
                </Link>
              </div>
            ) : null}
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

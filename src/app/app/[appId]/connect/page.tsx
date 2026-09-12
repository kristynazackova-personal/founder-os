import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getAppForUser } from "@/lib/services/apps";
import { listSources, sourceIdentity } from "@/lib/services/sources";
import { CONNECT_GUIDES, CONNECT_ORDER, SourceIcon } from "@/components/connect/guides";
import { Alert, PageHeader } from "@/components/ui";

export default async function ConnectPage({ params, searchParams }: { params: Promise<{ appId: string }>; searchParams: Promise<{ welcome?: string; error?: string }> }) {
  const user = await requireUser();
  const { appId } = await params;
  const q = await searchParams;
  const app = await getAppForUser(appId, user.id);
  if (!app) notFound();
  const sources = await listSources(app.id);
  const byType = new Map(sources.map((s) => [s.type, s]));
  const connectedCount = sources.length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Connect payment data"
        subtitle="Read-only. Keys are encrypted at rest, used only to read, and never displayed again — you can replace or disconnect them, not view them. Pick a source to see the steps."
        actions={
          <Link href={`/app/${app.id}`} className="btn btn-secondary">
            {connectedCount ? "Back to diagnosis" : "Skip for now"}
          </Link>
        }
      />
      {q.welcome ? <Alert kind="good">App created. If you already charge somewhere, connect it now — otherwise skip ahead and price it.</Alert> : null}
      {q.error ? <Alert kind="bad">{q.error}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {CONNECT_ORDER.map((type) => {
          const g = CONNECT_GUIDES[type];
          const row = byType.get(type);
          return (
            <Link key={type} href={`/app/${app.id}/connect/${type}`} className="card flex items-start gap-4 p-5 transition hover:border-stone-400">
              <SourceIcon source={type} size={44} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold">{g.name}</div>
                  {row ? row.status === "error" ? <span className="badge badge-bad">needs attention</span> : <span className="badge badge-good">connected</span> : <span className="badge">{g.minutes} min</span>}
                </div>
                <div className="mt-0.5 text-sm text-[var(--muted)]">{g.tagline}</div>
                {row ? <div className="mt-2 truncate text-xs text-[var(--muted)]">{sourceIdentity(row)}</div> : null}
              </div>
            </Link>
          );
        })}
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

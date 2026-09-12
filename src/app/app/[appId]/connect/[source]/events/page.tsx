import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getAppForUser } from "@/lib/services/apps";
import { getEventSettings, isEventSource, listSourceEvents, type CatalogEvent } from "@/lib/services/eventCatalog";
import { saveEventSettingsAction } from "@/app/actions/sources";
import { CONNECT_GUIDES, SourceIcon } from "@/components/connect/guides";
import { EventSettingsForm } from "@/components/connect/EventSettingsForm";
import { Alert } from "@/components/ui";

/** Asked right after an analytics tool is connected; reachable later from the connection's settings. */
export default async function EventSettingsPage({ params, searchParams }: { params: Promise<{ appId: string; source: string }>; searchParams: Promise<{ connected?: string }> }) {
  const user = await requireUser();
  const { appId, source } = await params;
  const q = await searchParams;
  const app = await getAppForUser(appId, user.id);
  if (!app || !isEventSource(source)) notFound();
  const guide = CONNECT_GUIDES[source];
  let events: CatalogEvent[] = [];
  let catalogError: string | null = null;
  try {
    events = await listSourceEvents(app, source);
  } catch (err) {
    catalogError = err instanceof Error ? err.message : String(err);
  }
  const current = await getEventSettings(app.id, source);
  const action = saveEventSettingsAction.bind(null, app.id, source);

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/app/${app.id}/connect/${source}`} className="text-sm text-[var(--muted)] hover:underline">
          ← {guide.name}
        </Link>
        <div className="mt-3 flex items-start gap-4">
          <SourceIcon source={source} size={56} />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold tracking-tight">Events from {guide.name}</h1>
            <p className="text-sm text-[var(--muted)]">
              {events.length ? `${guide.name} has collected ${events.length} event type${events.length === 1 ? "" : "s"}.` : "Choose what Founder OS may read."} You can change this any time from the connection&apos;s settings.
            </p>
          </div>
        </div>
      </div>
      {q.connected ? <Alert kind="good">{guide.name} connected. One more thing: which of its events may Founder OS read?</Alert> : null}
      <section className="card p-6">
        <EventSettingsForm action={action} events={events} current={current} catalogError={catalogError} />
      </section>
    </div>
  );
}

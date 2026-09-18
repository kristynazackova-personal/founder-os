import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { listApps, PLATFORM_LABEL, type Platform } from "@/lib/services/apps";
import { STAGE_META, type Stage } from "@/lib/domain/stages";
import { PageHeader } from "@/components/ui";

export default async function AppsPage() {
  const user = await requireUser();
  const apps = await listApps(user.id);
  if (apps.length === 0) redirect("/app/new");
  return (
    <>
      <PageHeader
        title="Your apps"
        actions={
          <Link href="/app/new" className="btn btn-secondary">
            Add another app
          </Link>
        }
      />
      <div className="grid gap-4 md:grid-cols-2">
        {apps.map((a) => (
          // The anchor is a SQUARE box and the rounding lives on the card
          // inside it. A rounded anchor clips its own hit area, so the four
          // corners of the card fall through to the grid behind it - small,
          // but it is exactly the kind of near-miss that reads as "the button
          // did not work". Everything inside is pointer-events-none so no
          // child can ever swallow the tap.
          <Link
            key={a.id}
            href={`/app/${a.id}`}
            aria-label={`Open ${a.name}`}
            className="group block cursor-pointer [-webkit-tap-highlight-color:transparent]"
          >
            <div className="card p-6 transition-colors group-hover:border-stone-400 group-active:border-stone-500 group-active:bg-stone-100 group-focus-visible:ring-2 group-focus-visible:ring-stone-500 group-focus-visible:ring-offset-2">
              <div className="pointer-events-none flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-lg font-semibold">{a.name}</div>
                  <div className="text-sm text-[var(--muted)]">{a.url ?? "No URL yet"} · {PLATFORM_LABEL[a.platform as Platform] ?? a.platform}</div>
                </div>
                {a.lastStage !== null ? (
                  <span className="badge shrink-0">
                    Stage {a.lastStage} · {STAGE_META[a.lastStage as Stage]?.name}
                  </span>
                ) : (
                  <span className="badge shrink-0">Not assessed</span>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}

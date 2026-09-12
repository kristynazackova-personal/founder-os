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
          <Link key={a.id} href={`/app/${a.id}`} className="card block p-6 hover:border-stone-400">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">{a.name}</div>
                <div className="text-sm text-[var(--muted)]">{a.url ?? "No URL yet"} · {PLATFORM_LABEL[a.platform as Platform] ?? a.platform}</div>
              </div>
              {a.lastStage !== null ? (
                <span className="badge">
                  Stage {a.lastStage} · {STAGE_META[a.lastStage as Stage]?.name}
                </span>
              ) : (
                <span className="badge">Not assessed</span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}

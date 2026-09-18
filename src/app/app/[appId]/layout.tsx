import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getAppForUser } from "@/lib/services/apps";
import { STAGE_META, type Stage } from "@/lib/domain/stages";
import { AppTabs } from "@/components/AppTabs";

export default async function AppLayout({ children, params }: { children: React.ReactNode; params: Promise<{ appId: string }> }) {
  const user = await requireUser();
  const { appId } = await params;
  const app = await getAppForUser(appId, user.id);
  if (!app) notFound();
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold sm:text-xl">{app.name}</h2>
          {app.url ? (
            <a href={app.url} target="_blank" rel="noreferrer" className="max-w-[60vw] truncate text-sm text-[var(--muted)] underline sm:max-w-none">
              {app.url.replace(/^https?:\/\//, "")}
            </a>
          ) : null}
        </div>
        {app.lastStage !== null ? (
          <Link href={`/app/${app.id}`} className="badge">
            Stage {app.lastStage} · {STAGE_META[app.lastStage as Stage]?.name}
          </Link>
        ) : null}
      </div>
      <AppTabs appId={app.id} />
      <div className="mt-6">{children}</div>
    </div>
  );
}

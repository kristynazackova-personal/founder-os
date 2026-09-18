import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getAppForUser } from "@/lib/services/apps";
import { loadOverviewPage } from "@/lib/services/b2cAnalytics";
import { PageHeader } from "@/components/ui";
import { SourceErrors } from "@/components/b2c/tiles";
import { B2C_SECTIONS } from "./meta";
import { OverviewView, WindowLine } from "./sections";
import { weeksFrom } from "./weeks";

export default async function B2cOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ appId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await requireUser();
  const { appId } = await params;
  const app = await getAppForUser(appId, user.id);
  if (!app) notFound();
  const data = await loadOverviewPage(app, { weeks: weeksFrom(await searchParams) });
  const meta = B2C_SECTIONS[0];
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="B2C analytics" subtitle={meta.sub} />
      <WindowLine {...data.window} />
      <SourceErrors errors={data.sourceErrors} />
      <OverviewView data={data} />
    </div>
  );
}

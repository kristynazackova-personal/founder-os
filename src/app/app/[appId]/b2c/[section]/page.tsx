import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getAppForUser } from "@/lib/services/apps";
import { loadAcquisitionPage, loadActivationPage, loadCoveragePage, loadLoopsPage, loadRevenuePage } from "@/lib/services/b2cAnalytics";
import { PageHeader } from "@/components/ui";
import { SourceErrors } from "@/components/b2c/tiles";
import { B2C_SECTIONS } from "../meta";
import { AcquisitionView, ActivationView, CoverageView, LoopsView, RevenueView, WindowLine } from "../sections";
import { weeksFrom } from "../weeks";

const SECTIONS = ["acquisition", "activation", "revenue", "loops", "coverage"] as const;
type Section = (typeof SECTIONS)[number];

export default async function B2cSectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ appId: string; section: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await requireUser();
  const { appId, section } = await params;
  if (!SECTIONS.includes(section as Section)) notFound();
  const app = await getAppForUser(appId, user.id);
  if (!app) notFound();

  const opts = { weeks: weeksFrom(await searchParams) };
  const meta = B2C_SECTIONS.find((s) => s.key === section);
  const header = (
    <PageHeader title={`B2C analytics · ${meta?.label ?? section}`} subtitle={meta?.sub} />
  );

  if (section === "acquisition") {
    const data = await loadAcquisitionPage(app, opts);
    return (
      <div className="flex flex-col gap-4">
        {header}
        <WindowLine {...data.window} />
        <SourceErrors errors={data.sourceErrors} />
        <AcquisitionView data={data} />
      </div>
    );
  }
  if (section === "activation") {
    const data = await loadActivationPage(app, opts);
    return (
      <div className="flex flex-col gap-4">
        {header}
        <WindowLine {...data.window} />
        <SourceErrors errors={data.sourceErrors} />
        <ActivationView data={data} />
      </div>
    );
  }
  if (section === "revenue") {
    const data = await loadRevenuePage(app, opts);
    return (
      <div className="flex flex-col gap-4">
        {header}
        <WindowLine {...data.window} />
        <SourceErrors errors={data.sourceErrors} />
        <RevenueView data={data} />
      </div>
    );
  }
  if (section === "loops") {
    const data = await loadLoopsPage(app, opts);
    return (
      <div className="flex flex-col gap-4">
        {header}
        <WindowLine {...data.window} />
        <SourceErrors errors={data.sourceErrors} />
        <LoopsView data={data} appId={app.id} />
      </div>
    );
  }
  const data = await loadCoveragePage(app, opts);
  return (
    <div className="flex flex-col gap-4">
      {header}
      <WindowLine {...data.window} />
      <SourceErrors errors={data.sourceErrors} />
      <CoverageView data={data} appId={app.id} />
    </div>
  );
}

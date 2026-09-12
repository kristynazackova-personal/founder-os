import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getAppForUser } from "@/lib/services/apps";
import { effectiveRecommendation, getInterview, markPricingStarted } from "@/lib/services/pricing";
import { checkoutUrl, listPlans } from "@/lib/services/checkout";
import { markCopiedAction, saveInterviewAction, saveOverridesAction } from "@/app/actions/pricing";
import { PricingInterview } from "@/components/PricingInterview";
import { PageHeader } from "@/components/ui";
import type { PricingAnswers, PricingRecommendation } from "@/lib/domain/pricing";

export default async function PricingPage({ params }: { params: Promise<{ appId: string }> }) {
  const user = await requireUser();
  const { appId } = await params;
  const app = await getAppForUser(appId, user.id);
  if (!app) notFound();
  const interview = await getInterview(app.id);
  if (!interview) await markPricingStarted(app);
  const plans = await listPlans(app.id, app.checkoutMode as "test" | "live");
  const checkoutUrls: Record<string, string> = {};
  for (const p of plans) if (p.interval !== "year" && !checkoutUrls[p.tierKey]) checkoutUrls[p.tierKey] = checkoutUrl(p);

  return (
    <div>
      <PageHeader title="Pricing engine" subtitle="Eight questions. Every number is explained and every number can be changed. Checkout is built from what you save here." />
      <PricingInterview
        mode="app"
        appName={app.name}
        initialAnswers={(interview?.answers as PricingAnswers) ?? null}
        initialRecommendation={interview ? (interview.recommendation as PricingRecommendation) : null}
        initialOverrides={interview?.overrides ?? {}}
        checkoutUrls={checkoutUrls}
        checkoutHref={`/app/${app.id}/checkout`}
        onSave={saveInterviewAction.bind(null, app.id)}
        onOverrides={saveOverridesAction.bind(null, app.id)}
        onCopied={markCopiedAction.bind(null, app.id)}
      />
      {interview ? <p className="sr-only">{effectiveRecommendation(interview).tiers.length} tiers</p> : null}
    </div>
  );
}

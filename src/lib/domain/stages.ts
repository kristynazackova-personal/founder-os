import type { Metrics } from "./metrics";
import { formatMoney, formatPercent } from "./money";

/**
 * Stage ladder, V1 slice (stages 0 to 3). The rules are deterministic and
 * documented in docs/STAGES.md; `placeStage` returns the reasons so the
 * founder can always see why they were placed.
 */
export type Stage = 0 | 1 | 2 | 3;
export type Confidence = "high" | "medium" | "low";

export type StageInput = {
  metrics: Metrics;
  /** A way for a customer to pay exists: connected payment source with products, or a live wrapped-checkout plan. */
  checkoutLive: boolean;
  /** Any revenue source (Stripe / Lemon Squeezy / Paddle / wrapped) is connected and synced. */
  revenueSourceConnected: boolean;
  /** The app reported a launch date or is reachable at a URL. */
  hasLiveApp: boolean;
};

export type StagePlacement = {
  stage: Stage;
  confidence: Confidence;
  reasons: string[];
  confidenceReasons: string[];
};

export const STAGE_META: Record<Stage, { name: string; short: string; goal: string }> = {
  0: { name: "Built", short: "Live app, nobody can pay yet", goal: "Decide a price and turn on checkout." },
  1: { name: "Priced", short: "Checkout is on, no paying customer yet", goal: "Get the first paying customer." },
  2: { name: "First dollars", short: "1 to 10 paying customers", goal: "Reach 10 paying customers and learn why they pay." },
  3: { name: "Traction", short: "11 to 50 paying customers or $500+ MRR", goal: "Fix churn, then grow month over month." },
};

/** Stage 3 upper bound. Stages 4 to 5 arrive in V2; V1 caps here. */
export const V1_MAX_STAGE: Stage = 3;

export function placeStage(input: StageInput): StagePlacement {
  const { metrics: m } = input;
  const reasons: string[] = [];
  let stage: Stage;

  if (m.payingUsers >= 11 || m.mrrUsdCents >= 50_000) {
    stage = 3;
    reasons.push(
      m.payingUsers >= 11
        ? `${m.payingUsers} paying customers (stage 3 starts at 11).`
        : `MRR ${formatMoney(m.mrrUsdCents)} is at or above $500.`,
    );
  } else if (m.payingUsers >= 1) {
    stage = 2;
    reasons.push(`${m.payingUsers} paying customer${m.payingUsers === 1 ? "" : "s"} (stage 2 is 1 to 10).`);
  } else if (input.checkoutLive) {
    stage = 1;
    reasons.push("A way to pay exists, but nobody has paid yet.");
  } else {
    stage = 0;
    reasons.push(input.revenueSourceConnected ? "No products or prices found on the connected account." : "No payment source connected and no live checkout.");
  }

  // Confidence
  const confidenceReasons: string[] = [];
  let confidence: Confidence;
  if (!input.revenueSourceConnected) {
    confidence = "low";
    confidenceReasons.push("No payment data connected; placement is based on what you told us.");
  } else if ((m.daysOfData ?? 0) < 30) {
    confidence = "medium";
    confidenceReasons.push(`Only ${m.daysOfData ?? 0} days of payment data; growth and churn need 30.`);
  } else {
    confidence = "high";
    confidenceReasons.push(`${m.daysOfData} days of payment data.`);
  }
  if (stage >= 2 && m.signups30d === null) {
    confidenceReasons.push("No signup data (install the snippet) so conversion is unknown.");
  }

  return { stage, confidence, reasons, confidenceReasons };
}

export type KpiCard = { label: string; value: string; hint?: string };

export type Diagnosis = {
  stage: Stage;
  stageName: string;
  confidence: Confidence;
  numbers: [KpiCard, KpiCard, KpiCard];
  sentence: string;
  action: { title: string; detail: string; href: string };
  reasons: string[];
  confidenceReasons: string[];
};

function n(v: number | null): string {
  return v === null ? "—" : v.toLocaleString("en-US");
}

/**
 * Three numbers, one sentence, one action, per stage. Deterministic.
 * `hrefs` lets the caller point the action into its own routes.
 */
export function diagnose(
  m: Metrics,
  placement: StagePlacement,
  ctx: { hasPricing: boolean; hasSnippet: boolean; checkoutLive: boolean; hrefs: { pricing: string; checkout: string; attribution: string; connect: string } },
): Diagnosis {
  const { stage } = placement;
  const base = { stage, stageName: STAGE_META[stage].name, confidence: placement.confidence, reasons: placement.reasons, confidenceReasons: placement.confidenceReasons };

  if (stage === 0) {
    const numbers: [KpiCard, KpiCard, KpiCard] = [
      { label: "Days since launch", value: n(m.daysSinceLaunch), hint: m.daysSinceLaunch === null ? "Set a launch date" : undefined },
      { label: "Visitors, 30d", value: n(m.visitors30d), hint: m.visitors30d === null ? "Install the snippet to see this" : undefined },
      { label: "Signups, 30d", value: n(m.signups30d), hint: m.signups30d === null ? "Install the snippet to see this" : undefined },
    ];
    const sentence = m.daysSinceLaunch !== null && m.daysSinceLaunch > 30
      ? `Your app has been live ${m.daysSinceLaunch} days with no way to pay - every day without a price is a day of free usage you can't learn from.`
      : "Your app is live but nobody can pay you yet - the next step is a price, not another feature.";
    const action = ctx.hasPricing
      ? { title: "Turn on checkout", detail: "Your pricing is ready. Create the plans and put the checkout link in your app.", href: ctx.hrefs.checkout }
      : { title: "Run the pricing interview", detail: "Eight questions, five minutes, a price you can defend and a pricing page block to paste in.", href: ctx.hrefs.pricing };
    return { ...base, numbers, sentence, action };
  }

  if (stage === 1) {
    const numbers: [KpiCard, KpiCard, KpiCard] = [
      { label: "Checkout views, 30d", value: n(m.checkoutViews30d), hint: m.checkoutViews30d === null ? "Install the snippet to see this" : undefined },
      { label: "Signups, 30d", value: n(m.signups30d), hint: m.signups30d === null ? "Install the snippet to see this" : undefined },
      { label: "Days since launch", value: n(m.daysSinceLaunch) },
    ];
    const sentence = (m.checkoutViews30d ?? 0) > 20
      ? `${m.checkoutViews30d} people saw your checkout this month and none paid - that's a price or a promise problem, not a traffic problem.`
      : "Checkout is on, so the only job this week is putting it in front of the people who already use the app.";
    const action = ctx.hasSnippet
      ? { title: "Ask your ten most active users to pay", detail: "Message them one by one, link the checkout, and note every objection. Ten conversations beat any launch post.", href: ctx.hrefs.attribution }
      : { title: "Install the attribution snippet", detail: "One line. Then you'll know whether the problem is nobody seeing the price or nobody accepting it.", href: ctx.hrefs.attribution };
    return { ...base, numbers, sentence, action };
  }

  if (stage === 2) {
    const numbers: [KpiCard, KpiCard, KpiCard] = [
      { label: "Paying customers", value: n(m.payingUsers), hint: m.trialingUsers > 0 || m.trialStarts30d > 0 ? `+ ${m.trialingUsers} on a free trial${m.trialToPaid30d === null ? "" : ` · ${Math.round(m.trialToPaid30d * 100)}% of trials convert`}` : undefined },
      { label: "MRR", value: formatMoney(m.mrrUsdCents), hint: m.mrrUsdCents === 0 && m.revenue30dUsdCents > 0 ? `${formatMoney(m.revenue30dUsdCents)} one-time this month` : undefined },
      { label: "Checkout → paid", value: formatPercent(m.checkoutConversion30d), hint: m.checkoutConversion30d === null ? "Install the snippet to see this" : undefined },
    ];
    const sentence = `You're at ${m.payingUsers} paying customer${m.payingUsers === 1 ? "" : "s"} and ${formatMoney(m.mrrUsdCents)} MRR - the goal now is ten, and the fastest route is understanding why the first ones paid.`;
    const action = { title: "Talk to every paying customer this week", detail: "Ask what they were doing before, what nearly stopped them paying, and who else has the problem. Write the answers into your pricing interview.", href: ctx.hrefs.pricing };
    return { ...base, numbers, sentence, action };
  }

  // Stage 3
  const numbers: [KpiCard, KpiCard, KpiCard] = [
    { label: "MRR", value: formatMoney(m.mrrUsdCents) },
    { label: "MoM growth", value: formatPercent(m.momGrowth), hint: m.momGrowth === null ? "Needs 30 days of data" : undefined },
    { label: "Churn, 30d", value: formatPercent(m.churn30d, 1), hint: m.churn30d === null ? "Needs 30 days of data" : undefined },
  ];
  const churnHigh = (m.churn30d ?? 0) > 0.08;
  const sentence = churnHigh
    ? `You're at ${formatMoney(m.mrrUsdCents)} MRR, growing ${formatPercent(m.momGrowth)}, churn ${formatPercent(m.churn30d, 1)} - fix churn first; growth on top of ${formatPercent(m.churn30d, 1)} churn is filling a leaking bucket.`
    : `You're at ${formatMoney(m.mrrUsdCents)} MRR, growing ${formatPercent(m.momGrowth)}, churn ${formatPercent(m.churn30d, 1)} - retention is healthy, so the lever now is more of the channel that already converts.`;
  const action = churnHigh
    ? { title: "Fix churn before spending on growth", detail: "Email everyone who cancelled in the last 30 days with one question: what would have made you stay? Then ship the top answer.", href: ctx.hrefs.connect }
    : { title: "Double down on the channel that pays", detail: "Attribution shows which source brought paying users. Put this week's hours into that channel only.", href: ctx.hrefs.attribution };
  return { ...base, numbers, sentence, action };
}

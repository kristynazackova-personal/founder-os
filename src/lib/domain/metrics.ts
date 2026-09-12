import { monthlyEquivalentCents, toUsdCents } from "./money";

/**
 * Normalised revenue data. Every source adapter (Stripe, Lemon Squeezy,
 * Paddle, our wrapped checkout) converts its own API shapes into this, and
 * everything downstream (metrics, stage placement, diagnosis) only ever sees
 * this shape.
 */
export type NormalizedSubscription = {
  id: string;
  customerId: string;
  /** Recurring amount in minor units per interval. */
  amountCents: number;
  currency: string;
  interval: "day" | "week" | "month" | "year";
  intervalCount: number;
  status: "active" | "trialing" | "past_due" | "canceled" | "paused" | "incomplete";
  startedAt: Date;
  canceledAt: Date | null;
};

export type NormalizedCharge = {
  id: string;
  customerId: string;
  amountCents: number;
  currency: string;
  occurredAt: Date;
  refunded: boolean;
};

export type NormalizedRevenueData = {
  subscriptions: NormalizedSubscription[];
  charges: NormalizedCharge[];
  /** Earliest date the source has data for (used for confidence). */
  dataSince: Date | null;
};

export type AnalyticsSignals = {
  /** Signups in the last 30 days (snippet or Supabase). */
  signups30d: number | null;
  /** Visits (pageviews by distinct anon id) in the last 30 days. */
  visitors30d: number | null;
  checkoutViews30d: number | null;
  activations30d: number | null;
};

export type Metrics = {
  payingUsers: number;
  /** Customers currently on a free trial — never counted as paying. */
  trialingUsers: number;
  mrrUsdCents: number;
  /** MRR 30 days ago, for growth. */
  mrrPrevUsdCents: number;
  /** Month-over-month MRR growth as a fraction, null when undefined. */
  momGrowth: number | null;
  /** Customer churn over the last 30 days as a fraction, null when undefined. */
  churn30d: number | null;
  /** Revenue collected in the last 30 days (charges + subscription renewals approximation). */
  revenue30dUsdCents: number;
  lifetimeRevenueUsdCents: number;
  /** One-time purchasers in the last 30 days. */
  oneTimeBuyers30d: number;
  daysSinceLaunch: number | null;
  daysOfData: number | null;
  signups30d: number | null;
  visitors30d: number | null;
  checkoutViews30d: number | null;
  activations30d: number | null;
  /** signups → purchase in 30d, null when no signups known */
  signupToPaid30d: number | null;
  /** checkout view → purchase in 30d */
  checkoutConversion30d: number | null;
};

const DAY_MS = 86_400_000;

function isActiveAt(sub: NormalizedSubscription, at: Date): boolean {
  if (sub.startedAt > at) return false;
  if (sub.canceledAt && sub.canceledAt <= at) return false;
  if (sub.canceledAt === null && (sub.status === "canceled" || sub.status === "incomplete")) return false;
  return true;
}

function subMonthlyUsd(sub: NormalizedSubscription): number {
  return toUsdCents(monthlyEquivalentCents(sub.amountCents, sub.interval, sub.intervalCount), sub.currency);
}

export function computeMetrics(
  data: NormalizedRevenueData,
  signals: AnalyticsSignals,
  opts: { launchedAt: Date | null; now?: Date },
): Metrics {
  const now = opts.now ?? new Date();
  const d30 = new Date(now.getTime() - 30 * DAY_MS);

  const activeNow = data.subscriptions.filter((s) => isActiveAt(s, now) && s.status !== "trialing");
  const activePrev = data.subscriptions.filter((s) => isActiveAt(s, d30) && s.status !== "trialing");

  const mrr = activeNow.reduce((sum, s) => sum + subMonthlyUsd(s), 0);
  const mrrPrev = activePrev.reduce((sum, s) => sum + subMonthlyUsd(s), 0);

  const paidCharges = data.charges.filter((c) => !c.refunded);
  const charges30 = paidCharges.filter((c) => c.occurredAt > d30 && c.occurredAt <= now);
  const subscriberIds = new Set(activeNow.map((s) => s.customerId));
  const oneTimeBuyers30 = new Set(charges30.map((c) => c.customerId).filter((id) => !subscriberIds.has(id)));

  const payingUsers = subscriberIds.size + oneTimeBuyers30.size;
  const trialingUsers = new Set(data.subscriptions.filter((s) => isActiveAt(s, now) && s.status === "trialing").map((s) => s.customerId)).size;

  // Churn: customers active 30 days ago who are no longer active now.
  const prevIds = new Set(activePrev.map((s) => s.customerId));
  let churned = 0;
  for (const id of prevIds) if (!subscriberIds.has(id)) churned += 1;
  const churn30d = prevIds.size > 0 ? churned / prevIds.size : null;

  const momGrowth = mrrPrev > 0 ? (mrr - mrrPrev) / mrrPrev : null;

  const revenue30 = charges30.reduce((s, c) => s + toUsdCents(c.amountCents, c.currency), 0);
  const lifetime = paidCharges.reduce((s, c) => s + toUsdCents(c.amountCents, c.currency), 0);

  const earliestCharge = paidCharges.reduce<Date | null>((min, c) => (min === null || c.occurredAt < min ? c.occurredAt : min), null);
  const earliestSub = data.subscriptions.reduce<Date | null>((min, s) => (min === null || s.startedAt < min ? s.startedAt : min), null);
  const earliestData = [earliestCharge, earliestSub].filter((d): d is Date => d !== null).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  const launch = opts.launchedAt ?? earliestData;
  const daysSinceLaunch = launch ? Math.max(0, Math.floor((now.getTime() - launch.getTime()) / DAY_MS)) : null;
  const dataSince = data.dataSince ?? earliestData;
  const daysOfData = dataSince ? Math.max(0, Math.floor((now.getTime() - dataSince.getTime()) / DAY_MS)) : null;

  const purchasers30 = new Set([
    ...charges30.map((c) => c.customerId),
    ...activeNow.filter((s) => s.startedAt > d30).map((s) => s.customerId),
  ]).size;

  const signupToPaid30d = signals.signups30d && signals.signups30d > 0 ? Math.min(1, purchasers30 / signals.signups30d) : null;
  const checkoutConversion30d =
    signals.checkoutViews30d && signals.checkoutViews30d > 0 ? Math.min(1, purchasers30 / signals.checkoutViews30d) : null;

  return {
    payingUsers,
    trialingUsers,
    mrrUsdCents: mrr,
    mrrPrevUsdCents: mrrPrev,
    momGrowth,
    churn30d,
    revenue30dUsdCents: revenue30,
    lifetimeRevenueUsdCents: lifetime,
    oneTimeBuyers30d: oneTimeBuyers30.size,
    daysSinceLaunch,
    daysOfData,
    signups30d: signals.signups30d,
    visitors30d: signals.visitors30d,
    checkoutViews30d: signals.checkoutViews30d,
    activations30d: signals.activations30d,
    signupToPaid30d,
    checkoutConversion30d,
  };
}

export const EMPTY_REVENUE: NormalizedRevenueData = { subscriptions: [], charges: [], dataSince: null };
export const EMPTY_SIGNALS: AnalyticsSignals = { signups30d: null, visitors30d: null, checkoutViews30d: null, activations30d: null };

/** Merge several sources' normalised data (e.g. Stripe + wrapped checkout). */
export function mergeRevenueData(parts: NormalizedRevenueData[]): NormalizedRevenueData {
  const subscriptions = parts.flatMap((p) => p.subscriptions);
  const charges = parts.flatMap((p) => p.charges);
  const dataSince = parts.reduce<Date | null>((min, p) => (p.dataSince && (min === null || p.dataSince < min) ? p.dataSince : min), null);
  return { subscriptions, charges, dataSince };
}

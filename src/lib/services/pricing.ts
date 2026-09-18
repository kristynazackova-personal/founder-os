import { eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import type { App, PricingInterview } from "../db/schema";
import { recommendPricing, type PricingAnswers, type PricingRecommendation, type Tier } from "../domain/pricing";
import { track } from "../track";

export async function getInterview(appId: string): Promise<PricingInterview | null> {
  const db = await getDb();
  const [row] = await db.select().from(schema.pricingInterviews).where(eq(schema.pricingInterviews.appId, appId)).limit(1);
  return row ?? null;
}

export async function markPricingStarted(app: App): Promise<void> {
  const existing = await getInterview(app.id);
  if (existing) return;
  await track("pricing_started", { userId: app.userId, appId: app.id });
}

export async function saveInterview(app: App, answers: PricingAnswers): Promise<PricingRecommendation> {
  const db = await getDb();
  const recommendation = recommendPricing(answers);
  const existing = await getInterview(app.id);
  if (existing) {
    await db.update(schema.pricingInterviews).set({ answers, recommendation, overrides: {}, completedAt: new Date() }).where(eq(schema.pricingInterviews.id, existing.id));
  } else {
    await db.insert(schema.pricingInterviews).values({ appId: app.id, answers, recommendation, completedAt: new Date() });
  }
  if (!app.activationEvent && recommendation.activationEvent) {
    await db.update(schema.apps).set({ activationEvent: recommendation.activationEvent }).where(eq(schema.apps.id, app.id));
  }
  await track("pricing_completed", { userId: app.userId, appId: app.id, props: { model: recommendation.model, tiers: recommendation.tiers.length } });
  return recommendation;
}

export type TierOverride = { name?: string; priceCents?: number; yearlyPriceCents?: number | null };

export async function saveOverrides(app: App, overrides: Record<string, TierOverride>): Promise<void> {
  const db = await getDb();
  await db.update(schema.pricingInterviews).set({ overrides }).where(eq(schema.pricingInterviews.appId, app.id));
}

export async function markCopied(app: App): Promise<void> {
  const db = await getDb();
  await db.update(schema.pricingInterviews).set({ copiedAt: new Date() }).where(eq(schema.pricingInterviews.appId, app.id));
  await track("pricing_page_copied", { userId: app.userId, appId: app.id });
}

/** The recommendation with the founder's edits applied - what checkout and the pricing block use. */
export function effectiveRecommendation(interview: PricingInterview): PricingRecommendation {
  const rec = interview.recommendation as PricingRecommendation;
  const overrides = interview.overrides ?? {};
  const tiers: Tier[] = rec.tiers.map((t) => {
    const o = overrides[t.key];
    if (!o) return t;
    return { ...t, name: o.name ?? t.name, priceCents: o.priceCents ?? t.priceCents, yearlyPriceCents: o.yearlyPriceCents === undefined ? t.yearlyPriceCents : o.yearlyPriceCents };
  });
  return { ...rec, tiers };
}

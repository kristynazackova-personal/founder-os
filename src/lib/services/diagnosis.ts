import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import type { App, Assessment } from "../db/schema";
import { computeMetrics, mergeRevenueData, type AnalyticsSignals, type Metrics } from "../domain/metrics";
import { diagnose, placeStage, type Diagnosis, type StagePlacement, type Stage, type Confidence } from "../domain/stages";
import { track } from "../track";
import { fetchExternalRevenue, fetchAnalyticsSignals } from "./sources";
import { snippetSignals } from "./attribution";
import { hasLivePlans, wrappedRevenueData } from "./checkout";
import { getInterview } from "./pricing";

export const ASSESSMENT_MAX_AGE_MS = 6 * 3_600_000;

/** Assessments stored before a metric existed lack its key; default every newer key so the UI never renders undefined. */
function withMetricDefaults(m: Partial<Metrics>): Metrics {
  return { trialingUsers: 0, trialStarts30d: 0, trialConversions30d: 0, trialToPaid30d: null, lapsed30d: 0, installs30d: null, ...m } as Metrics;
}

export type AssessmentResult = {
  assessment: Assessment;
  metrics: Metrics;
  placement: StagePlacement;
  errors: Array<{ type: string; message: string }>;
};

export async function runAssessment(app: App, now = new Date()): Promise<AssessmentResult> {
  const db = await getDb();
  const [ext, wrapped, snippet, analytics, livePlans] = await Promise.all([fetchExternalRevenue(app), wrappedRevenueData(app.id), snippetSignals(app.id, now), fetchAnalyticsSignals(app), hasLivePlans(app.id)]);

  const data = mergeRevenueData([ext.data, wrapped.data]);
  const signals: AnalyticsSignals = {
    visitors30d: snippet.visitors30d ?? analytics.signals.visitors30d ?? null,
    signups30d: snippet.signups30d ?? analytics.signals.signups30d ?? null,
    checkoutViews30d: snippet.checkoutViews30d ?? analytics.signals.checkoutViews30d ?? null,
    activations30d: snippet.activations30d ?? analytics.signals.activations30d ?? null,
    // GA4 first, not the snippet: Firebase has counted installs since the
    // app shipped, the app's own install calls only since it started sending them.
    installs30d: analytics.signals.installs30d ?? snippet.installs30d ?? null,
  };
  const metrics = computeMetrics(data, signals, { launchedAt: app.launchedAt, now });
  const revenueSourceConnected = ext.connected || wrapped.hasAny;
  const checkoutLive = livePlans || ext.hasProducts;
  const placement = placeStage({ metrics, checkoutLive, revenueSourceConnected, hasLiveApp: Boolean(app.url) });

  const sourcesUsed = [...new Set([...ext.sourcesUsed, ...(wrapped.hasAny ? ["wrapped_checkout"] : []), ...(snippet.hasAny ? ["snippet"] : []), ...analytics.used])];
  const [assessment] = await db
    .insert(schema.assessments)
    .values({ appId: app.id, computedAt: now, metrics, stage: placement.stage, confidence: placement.confidence, reasons: placement.reasons, confidenceReasons: placement.confidenceReasons, sourcesUsed })
    .returning();

  if (app.lastStage !== placement.stage) {
    if (app.lastStage !== null) await track("stage_changed", { userId: app.userId, appId: app.id, props: { from: app.lastStage, to: placement.stage } });
    await db.update(schema.apps).set({ lastStage: placement.stage, lastConfidence: placement.confidence }).where(eq(schema.apps.id, app.id));
  } else if (app.lastConfidence !== placement.confidence) {
    await db.update(schema.apps).set({ lastConfidence: placement.confidence }).where(eq(schema.apps.id, app.id));
  }

  const errors = [...ext.errors, ...analytics.errors];
  return { assessment, metrics, placement, errors };
}

export async function latestAssessment(appId: string): Promise<Assessment | null> {
  const db = await getDb();
  const [row] = await db.select().from(schema.assessments).where(eq(schema.assessments.appId, appId)).orderBy(desc(schema.assessments.computedAt)).limit(1);
  return row ?? null;
}

/** Latest assessment, refreshed when missing or stale. */
export async function getOrRunAssessment(app: App, opts: { force?: boolean } = {}): Promise<AssessmentResult> {
  const latest = opts.force ? null : await latestAssessment(app.id);
  if (latest && Date.now() - latest.computedAt.getTime() < ASSESSMENT_MAX_AGE_MS) {
    // Assessments stored before a metric existed lack its key; default it so the UI never renders undefined.
    return { assessment: latest, metrics: withMetricDefaults(latest.metrics as Partial<Metrics>), placement: placementFrom(latest), errors: [] };
  }
  return runAssessment(app);
}

export function placementFrom(a: Assessment): StagePlacement {
  return { stage: a.stage as Stage, confidence: a.confidence as Confidence, reasons: a.reasons, confidenceReasons: a.confidenceReasons };
}

export async function buildDiagnosis(app: App, result: AssessmentResult): Promise<Diagnosis> {
  const [interview, livePlans] = await Promise.all([getInterview(app.id), hasLivePlans(app.id)]);
  const base = `/app/${app.id}`;
  return diagnose(result.metrics, result.placement, {
    hasPricing: Boolean(interview?.completedAt),
    hasSnippet: Boolean(app.snippetInstalledAt),
    checkoutLive: livePlans,
    hrefs: { pricing: `${base}/pricing`, checkout: `${base}/checkout`, attribution: `${base}/attribution`, connect: `${base}/connect` },
  });
}

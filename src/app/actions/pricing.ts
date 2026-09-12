"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { getAppForUser } from "@/lib/services/apps";
import { markCopied, saveInterview, saveOverrides, type TierOverride } from "@/lib/services/pricing";
import type { PricingAnswers, PricingRecommendation } from "@/lib/domain/pricing";

const AUDIENCES = ["consumer", "prosumer", "smb", "b2b_team", "developer"];
const REPLACES = ["nothing", "manual_work", "spreadsheet", "human_service", "another_tool"];
const METRICS = ["flat", "seat", "usage", "project"];
const FREQ = ["daily", "weekly", "monthly", "once"];

function n(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
}

/** Validate untrusted client input into PricingAnswers. */
export async function saveInterviewAction(appId: string, raw: PricingAnswers): Promise<PricingRecommendation> {
  const user = await requireUser();
  const app = await getAppForUser(appId, user.id);
  if (!app) throw new Error("App not found");
  const answers: PricingAnswers = {
    audience: AUDIENCES.includes(raw.audience) ? raw.audience : "prosumer",
    replaces: REPLACES.includes(raw.replaces) ? raw.replaces : "manual_work",
    replacesCostMonthly: n(raw.replacesCostMonthly),
    valueMetric: METRICS.includes(raw.valueMetric) ? raw.valueMetric : "flat",
    frequency: FREQ.includes(raw.frequency) ? raw.frequency : "weekly",
    comparables: String(raw.comparables ?? "").slice(0, 120),
    comparablePriceMonthly: n(raw.comparablePriceMonthly),
    wtpTooCheap: n(raw.wtpTooCheap),
    wtpTooExpensive: n(raw.wtpTooExpensive),
    activationEvent: String(raw.activationEvent ?? "").slice(0, 120),
    costToServeMonthly: n(raw.costToServeMonthly),
  };
  const rec = await saveInterview(app, answers);
  revalidatePath(`/app/${appId}`, "layout");
  return rec;
}

export async function saveOverridesAction(appId: string, raw: Record<string, TierOverride>): Promise<void> {
  const user = await requireUser();
  const app = await getAppForUser(appId, user.id);
  if (!app) return;
  const clean: Record<string, TierOverride> = {};
  for (const [key, o] of Object.entries(raw ?? {}).slice(0, 5)) {
    if (!/^[a-z_]+$/.test(key)) continue;
    clean[key] = {
      ...(typeof o.name === "string" ? { name: o.name.slice(0, 40) } : {}),
      ...(typeof o.priceCents === "number" && Number.isFinite(o.priceCents) ? { priceCents: Math.max(0, Math.round(o.priceCents)) } : {}),
      ...(o.yearlyPriceCents === null ? { yearlyPriceCents: null } : typeof o.yearlyPriceCents === "number" && Number.isFinite(o.yearlyPriceCents) ? { yearlyPriceCents: Math.max(0, Math.round(o.yearlyPriceCents)) } : {}),
    };
  }
  await saveOverrides(app, clean);
  revalidatePath(`/app/${appId}`, "layout");
}

export async function markCopiedAction(appId: string): Promise<void> {
  const user = await requireUser();
  const app = await getAppForUser(appId, user.id);
  if (!app) return;
  await markCopied(app);
}

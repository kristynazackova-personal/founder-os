"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createApp, getAppForUser, PLATFORMS, updateApp, type Platform } from "@/lib/services/apps";
import { normalizeUrl } from "@/lib/domain/url";
import { asIndustry, asNature, regenerateGates } from "@/lib/services/gates";

export type FormState = { error?: string; ok?: boolean } | undefined;

function parseDate(v: string): Date | null {
  if (!v.trim()) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function createAppAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Give the app a name." };
  const platformRaw = String(formData.get("platform") ?? "other");
  const platform = (PLATFORMS as readonly string[]).includes(platformRaw) ? (platformRaw as Platform) : "other";
  const url = normalizeUrl(String(formData.get("url") ?? ""));
  const projectLink = normalizeUrl(String(formData.get("projectLink") ?? ""));
  const launchedAt = parseDate(String(formData.get("launchedAt") ?? ""));
  const industry = asIndustry(formData.get("industry"));
  const nature = asNature(formData.get("nature"));
  const app = await createApp(user.id, { name, url, platform, projectLink, launchedAt, industry, nature });
  redirect(`/app/${app.id}/connect?welcome=1`);
}

export async function updateAppAction(appId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const app = await getAppForUser(appId, user.id);
  if (!app) return { error: "App not found." };
  const name = String(formData.get("name") ?? "").trim() || app.name;
  const platformRaw = String(formData.get("platform") ?? app.platform);
  const industry = asIndustry(formData.get("industry") ?? app.industry);
  const nature = asNature(formData.get("nature") ?? app.nature);
  await updateApp(app.id, {
    name,
    platform: (PLATFORMS as readonly string[]).includes(platformRaw) ? platformRaw : app.platform,
    url: normalizeUrl(String(formData.get("url") ?? "")),
    projectLink: normalizeUrl(String(formData.get("projectLink") ?? "")),
    launchedAt: parseDate(String(formData.get("launchedAt") ?? "")),
    activationEvent: String(formData.get("activationEvent") ?? "").trim() || null,
    industry,
    nature,
  });
  // The gates are derived from these two answers, so changing either has to
  // re-derive them - otherwise the tiles keep judging against the old category.
  if (industry !== app.industry || nature !== app.nature) {
    try {
      await regenerateGates({ ...app, industry, nature });
    } catch (err) {
      console.error("[apps] gate regeneration failed:", err instanceof Error ? err.message : err);
    }
  }
  revalidatePath(`/app/${app.id}`, "layout");
  return { ok: true };
}

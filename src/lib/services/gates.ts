/**
 * Gates - generation and storage.
 *
 * Every app gets gates at creation from published category benchmarks
 * (domain/gates.ts `categoryGates`): deterministic, offline, no key needed, so
 * the B2C tiles are judged from the first render. A research pass can then
 * refine them per app from competitor data; it is optional, fail-soft, and
 * never blocks app creation.
 *
 * The research pass needs BOTH an AI provider that can read the web and a
 * model that will cite what it found. Without `GATE_RESEARCH_API_KEY` it does
 * not run and the category gates stand - which is a complete product, not a
 * degraded one.
 */
import { eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import type { App } from "../db/schema";
import {
  categoryGates, mergeGates, parseGateSet, parseResearchedGates,
  type BusinessProfile, type GateSet, type Industry, type Nature,
  INDUSTRIES, NATURES, INDUSTRY_LABEL, NATURE_LABEL,
} from "../domain/gates";

export const asIndustry = (v: unknown): Industry => ((INDUSTRIES as readonly string[]).includes(String(v)) ? (v as Industry) : "other");
export const asNature = (v: unknown): Nature => ((NATURES as readonly string[]).includes(String(v)) ? (v as Nature) : "web_subscription");

export const profileOf = (app: Pick<App, "industry" | "nature">): BusinessProfile => ({
  industry: asIndustry(app.industry),
  nature: asNature(app.nature),
});

/** The stored set, or the category default for the app's profile when nothing is stored. */
export function gatesOf(app: Pick<App, "industry" | "nature" | "gates">): GateSet {
  return parseGateSet(app.gates) ?? categoryGates(profileOf(app));
}

export async function saveGates(appId: string, set: GateSet): Promise<void> {
  const db = await getDb();
  await db
    .update(schema.apps)
    .set({ gates: set as unknown as Record<string, unknown>, gatesGeneratedAt: new Date(set.generatedAt) })
    .where(eq(schema.apps.id, appId));
}

/** Written at creation, before the founder ever sees a tile. */
export async function seedGates(appId: string, profile: BusinessProfile, now = new Date()): Promise<GateSet> {
  const set = categoryGates(profile, now);
  await saveGates(appId, set);
  return set;
}

// ---------------------------------------------------------------- research

const RESEARCH_MODEL = process.env.GATE_RESEARCH_MODEL ?? "gemini-2.5-flash";
const RESEARCH_KEY = process.env.GATE_RESEARCH_API_KEY ?? process.env.GEMINI_API_KEY ?? "";

export const gateResearchConfigured = (): boolean => RESEARCH_KEY.length > 0;

/** What the model is asked for. Kept here so the prompt is reviewable next to the parser that trusts it. */
export function researchPrompt(app: Pick<App, "name" | "url">, profile: BusinessProfile): string {
  return [
    `You are setting performance thresholds for a ${INDUSTRY_LABEL[profile.industry]} product sold as: ${NATURE_LABEL[profile.nature]}.`,
    app.url ? `The product is at ${app.url}.` : "",
    "",
    "Find the closest comparable apps or products and report what is publicly known about their performance.",
    "Return ONLY a JSON object of this shape, no prose:",
    '{"competitors":["name - what makes it comparable"],"gates":[{"metric":"d7","target":0.08,"low":0.07,"high":0.085,"source":"who published this and when","rationale":"why this product should be held to it"}]}',
    "",
    `Allowed metric values: d1, d7, d30, activation, north_star, signup_to_paid, trial_to_paid, churn_30d.`,
    "Rules you must follow:",
    "- Every gate needs a `source` naming who published the figure. A gate you cannot attribute must be omitted entirely.",
    "- Omit any metric you have no published figure for. A short list is correct; a complete list of guesses is not.",
    "- Targets are fractions (0.08), not percentages.",
    "- Prefer figures from the last 18 months, and say the year in the source.",
  ]
    .filter(Boolean)
    .join("\n");
}

type ResearchResult = { gates: ReturnType<typeof parseResearchedGates>; competitors: string[]; error: string | null };

/**
 * Ask the configured model for competitor-derived gates. Returns nothing
 * usable rather than throwing: the caller keeps the category gates.
 */
export async function researchGates(app: Pick<App, "name" | "url">, profile: BusinessProfile, timeoutMs = 20_000): Promise<ResearchResult> {
  if (!gateResearchConfigured()) return { gates: [], competitors: [], error: "no research key configured" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(RESEARCH_MODEL)}:generateContent?key=${encodeURIComponent(RESEARCH_KEY)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: researchPrompt(app, profile) }] }],
          tools: [{ google_search: {} }],
          generationConfig: { temperature: 0.2 },
        }),
        signal: controller.signal,
      },
    );
    if (!res.ok) return { gates: [], competitors: [], error: `research HTTP ${res.status}` };
    const body = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
    if (!json) return { gates: [], competitors: [], error: "research returned no JSON" };
    const parsed = JSON.parse(json) as { gates?: unknown; competitors?: unknown };
    return {
      gates: parseResearchedGates(parsed.gates),
      competitors: Array.isArray(parsed.competitors) ? parsed.competitors.filter((c): c is string => typeof c === "string").slice(0, 8) : [],
      error: null,
    };
  } catch (err) {
    return { gates: [], competitors: [], error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Seed, then refine in the background. App creation waits only for the
 * category gates; the research pass lands whenever it lands, and a failure
 * leaves the app with perfectly usable gates.
 */
export async function generateGatesForApp(app: Pick<App, "id" | "name" | "url" | "industry" | "nature">, opts: { await?: boolean } = {}): Promise<GateSet> {
  const profile = profileOf(app);
  const base = await seedGates(app.id, profile);
  const refine = async () => {
    const found = await researchGates(app, profile);
    if (found.gates.length === 0) return base;
    const merged = mergeGates(base, found.gates, {
      competitors: found.competitors,
      notes: [`Refined from comparable products${found.competitors.length ? `: ${found.competitors.join("; ")}` : ""}.`],
    });
    await saveGates(app.id, merged);
    return merged;
  };
  if (opts.await) return refine();
  void refine().catch((err) => console.error("[gates] research failed:", err instanceof Error ? err.message : err));
  return base;
}

/** Re-run both layers for an app whose industry or nature changed. */
export async function regenerateGates(app: Pick<App, "id" | "name" | "url" | "industry" | "nature">): Promise<GateSet> {
  return generateGatesForApp(app, { await: gateResearchConfigured() });
}

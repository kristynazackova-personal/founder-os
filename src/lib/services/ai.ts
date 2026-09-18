/**
 * The one place a model gets called.
 *
 * Two features use it: gate research (services/gates.ts) and filling the PMF
 * framework (services/pmfDocs.ts). Both are optional and both fail soft, so
 * this returns a result rather than throwing, and the callers keep whatever
 * deterministic output they already had.
 *
 * Without `GATE_RESEARCH_API_KEY` nothing here runs. That is a supported
 * configuration, not a broken one: every feature that uses this has an
 * offline path.
 */
const MODEL = process.env.GATE_RESEARCH_MODEL ?? "gemini-2.5-flash";
const KEY = process.env.GATE_RESEARCH_API_KEY ?? process.env.GEMINI_API_KEY ?? "";

export const aiConfigured = (): boolean => KEY.length > 0;

export type AiResult = { json: unknown | null; text: string; error: string | null };

/** The JSON object in a model reply, which usually arrives wrapped in prose or a fence. */
export function extractJson(text: string): unknown | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Ask for one JSON answer. `search` turns on grounding, which gate research
 * needs and the PMF fill does not.
 */
export async function askForJson(prompt: string, opts: { search?: boolean; timeoutMs?: number } = {}): Promise<AiResult> {
  if (!aiConfigured()) return { json: null, text: "", error: "no model key configured" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30_000);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent?key=${encodeURIComponent(KEY)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          ...(opts.search ? { tools: [{ google_search: {} }] } : {}),
          generationConfig: { temperature: 0.3 },
        }),
        signal: controller.signal,
      },
    );
    if (!res.ok) return { json: null, text: "", error: `model HTTP ${res.status}` };
    const body = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    return { json: extractJson(text), text, error: text ? null : "model returned nothing" };
  } catch (err) {
    return { json: null, text: "", error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

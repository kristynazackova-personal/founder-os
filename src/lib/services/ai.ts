/**
 * The one place a model gets called.
 *
 * Three features use it: gate research (services/gates.ts), filling the PMF
 * framework and its tables, and the stage-1 prefill (services/pmfDocs.ts).
 * All of them are optional and all fail soft, so this returns a result rather
 * than throwing and the callers keep whatever deterministic output they had.
 *
 * Without a key nothing here runs. That is a supported configuration, not a
 * broken one: every feature that uses this has an offline path.
 */
import Anthropic from "@anthropic-ai/sdk";

/**
 * `ANTHROPIC_API_KEY` is the name to set. `GATE_RESEARCH_API_KEY` is accepted
 * because it is what this deployment already had when the only consumer was
 * gate research; either may hold the key, and neither is read anywhere else.
 */
const KEY = process.env.ANTHROPIC_API_KEY ?? process.env.GATE_RESEARCH_API_KEY ?? "";

/**
 * Opus, deliberately. Every call here is a judgement the founder will read as
 * a finding - which columns a table earns, what a landing page says the
 * business is, which published figure a gate can be attributed to - and the
 * volume is a handful of calls per business, so the cheaper model saves
 * nothing worth having.
 *
 * `GATE_RESEARCH_MODEL` is NOT read: a deployment still carrying
 * `gemini-2.5-flash` in it would otherwise send that string to Anthropic and
 * get a 404 on every call.
 */
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5";

export const aiConfigured = (): boolean => KEY.length > 0;

export type AiResult = { json: unknown | null; text: string; error: string | null };

let client: Anthropic | null = null;
const getClient = (): Anthropic => (client ??= new Anthropic({ apiKey: KEY }));

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
 * Ask for one JSON answer.
 *
 * `search` turns on Anthropic's web search tool, which gate research needs to
 * find published competitor figures and the PMF fills do not. The search runs
 * server-side, so the answer arrives in the same response and there is no tool
 * loop to drive here.
 */
export async function askForJson(prompt: string, opts: { search?: boolean; timeoutMs?: number } = {}): Promise<AiResult> {
  if (!aiConfigured()) return { json: null, text: "", error: "no model key configured" };

  try {
    const response = await getClient().messages.create(
      {
        model: MODEL,
        max_tokens: 16_000,
        messages: [{ role: "user", content: prompt }],
        ...(opts.search ? { tools: [{ type: "web_search_20260209" as const, name: "web_search" as const }] } : {}),
      },
      { timeout: opts.timeoutMs ?? 60_000 },
    );

    // A safety decline is a 200 with no usable content, so it has to be read
    // before the blocks are.
    if (response.stop_reason === "refusal") {
      return { json: null, text: "", error: "the model declined this request" };
    }

    // Only the text blocks. A grounded answer also carries the search results
    // and the model's thinking, neither of which is the answer.
    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    if (response.stop_reason === "max_tokens" && !text.trimEnd().endsWith("}")) {
      return { json: null, text, error: "the model's answer was cut off" };
    }
    return { json: extractJson(text), text, error: text ? null : "model returned nothing" };
  } catch (err) {
    return { json: null, text: "", error: describe(err) };
  }
}

/** A sentence a founder can act on, from the SDK's typed errors. */
function describe(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "the model key was rejected";
  if (err instanceof Anthropic.PermissionDeniedError) return "the model key is not allowed to use this model";
  if (err instanceof Anthropic.RateLimitError) return "the model is rate limited right now; try again shortly";
  if (err instanceof Anthropic.BadRequestError) return `the request was rejected: ${err.message}`;
  if (err instanceof Anthropic.APIConnectionTimeoutError) return "the model took too long to answer";
  if (err instanceof Anthropic.APIConnectionError) return "the model could not be reached";
  if (err instanceof Anthropic.APIError) return `model error ${err.status ?? ""}`.trim();
  return err instanceof Error ? err.message : String(err);
}

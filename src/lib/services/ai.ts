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

/** One name for one secret. */
const KEY = process.env.ANTHROPIC_API_KEY ?? "";

/**
 * What each call is for.
 *
 * The point of naming these is that they are not the same kind of work, so
 * they will not always want the same model. Deriving a table's columns decides
 * what the founder is asked to compare on; drafting rows against columns that
 * are already fixed is a smaller job. Keeping the distinction in the type means
 * a future split is an edit to one table rather than a hunt through callers.
 */
export type AiPurpose = "gate_research" | "table_columns" | "table_rows" | "segmentations" | "doc_fill" | "prefill";

/**
 * Purpose -> model. **Every purpose is Opus today, deliberately.**
 *
 * The split that will probably come is rows and doc-fill to Sonnet: they draft
 * against a shape something else already decided. It has not been made yet
 * because nothing here has run against real businesses, and choosing a cheaper
 * model for output nobody has read is guessing at where quality is safe to
 * spend less. Run it on Opus, compare, then change a line here.
 *
 * The rule for changing one: you need the Opus output for that same call to
 * compare against. Never downgrade a purpose whose results you have not seen.
 */
export const MODEL_FOR: Record<AiPurpose, string> = {
  // Judges which published figure can be attributed, over live search results.
  gate_research: "claude-opus-5",
  // The load-bearing one: it is what drops the pay-strength column for a
  // founder who says they do not care about profit.
  table_columns: "claude-opus-5",
  // Drafts candidates against columns that are already fixed.
  table_rows: "claude-opus-5",
  // Proposes several whole ways to split a market and argues each one's cost.
  // Judgement, not drafting - the hardest call in the framework.
  segmentations: "claude-opus-5",
  // Writes and pressure-tests the framework's prose fields.
  doc_fill: "claude-opus-5",
  // Has to REFUSE to infer the founder's motive from marketing copy, which is
  // judgement rather than extraction.
  prefill: "claude-opus-5",
};

/**
 * Purpose -> how long to wait, in ms.
 *
 * The 60 second default was one number for every call, and it timed out the
 * segmentations one - reasonably, since that asks for four complete
 * alternatives with their reasoning, over a prompt carrying the whole answer
 * guidance. These calls all run as background jobs now, so nobody is watching
 * a spinner and a generous ceiling costs nothing but a slower failure.
 *
 * Transport stays non-streaming on purpose: `max_tokens` is 16k, far inside
 * what a single response can carry, so the problem was our own deadline
 * rather than the provider's. If a call ever needs to exceed these, stream it
 * rather than raising them again.
 */
export const TIMEOUT_FOR: Record<AiPurpose, number> = {
  // Reads live search results before it can judge them.
  gate_research: 180_000,
  table_columns: 180_000,
  table_rows: 180_000,
  // Four whole segmentations, each with rows and an argument against itself.
  segmentations: 420_000,
  // Every field of the framework in one answer.
  doc_fill: 300_000,
  prefill: 180_000,
};

const DEFAULT_PURPOSE: AiPurpose = "doc_fill";

/**
 * A global override, for trying one model across the board without editing the
 * table. `GATE_RESEARCH_MODEL` is deliberately NOT read: a deployment still
 * carrying `gemini-2.5-flash` in it would send that string to Anthropic and
 * get a 404 on every call.
 */
const modelFor = (purpose: AiPurpose): string => process.env.ANTHROPIC_MODEL ?? MODEL_FOR[purpose];

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
export async function askForJson(
  prompt: string,
  opts: { purpose?: AiPurpose; search?: boolean; timeoutMs?: number } = {},
): Promise<AiResult> {
  if (!aiConfigured()) return { json: null, text: "", error: "no model key configured" };

  try {
    const response = await getClient().messages.create(
      {
        model: modelFor(opts.purpose ?? DEFAULT_PURPOSE),
        max_tokens: 16_000,
        messages: [{ role: "user", content: prompt }],
        ...(opts.search ? { tools: [{ type: "web_search_20260209" as const, name: "web_search" as const }] } : {}),
      },
      { timeout: opts.timeoutMs ?? TIMEOUT_FOR[opts.purpose ?? DEFAULT_PURPOSE] },
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

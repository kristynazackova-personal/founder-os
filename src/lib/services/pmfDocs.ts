/**
 * Filled-in PMF frameworks: read, generate, edit, rewrite.
 *
 * Every write appends a version (schema.pmfDocuments is immutable per row),
 * so the history of a document is the history of the thinking.
 *
 * Three ways a version comes to exist:
 *  - `scaffold`  - written the moment a business is created, deterministic,
 *                  no model needed. Every field is a question aimed at that
 *                  business rather than an invented answer.
 *  - `generated` - a model fills what it can from the business and its own
 *                  numbers. Runs at creation when a key is configured, and on
 *                  demand for a business that already existed.
 *  - `edited` / `rewritten` - the founder's own edit, or a rewrite driven by
 *                  their comment.
 */
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import type { App } from "../db/schema";
import { INDUSTRY_LABEL, NATURE_LABEL } from "../domain/gates";
import { nextVersion, parseModelValues, parseStoredValues, scaffoldDoc, type PmfDoc, type PmfDocSource, type PmfFieldKey } from "../domain/pmfDoc";
import { DEFAULT_FRAMEWORK, asFrameworkId, frameworkOf, type PmfFramework, type PmfFrameworkId } from "../domain/pmfFrameworks";
import { profileOf } from "./gates";
import { aiConfigured, askForJson } from "./ai";
import { latestAssessment } from "./diagnosis";
import type { Metrics } from "../domain/metrics";

const rowToDoc = (row: { framework: string; version: number; source: string; comment: string | null; values: unknown; createdAt: Date }): PmfDoc => ({
  framework: asFrameworkId(row.framework),
  version: row.version,
  source: (["scaffold", "generated", "edited", "rewritten"] as const).includes(row.source as PmfDocSource) ? (row.source as PmfDocSource) : "edited",
  comment: row.comment,
  values: parseStoredValues(frameworkOf(row.framework), row.values),
  createdAt: row.createdAt.toISOString(),
});

export async function latestDoc(appId: string, framework: PmfFrameworkId = DEFAULT_FRAMEWORK): Promise<PmfDoc | null> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(schema.pmfDocuments)
    .where(and(eq(schema.pmfDocuments.appId, appId), eq(schema.pmfDocuments.framework, framework)))
    .orderBy(desc(schema.pmfDocuments.version))
    .limit(1);
  return row ? rowToDoc(row) : null;
}

export async function listDocs(appId: string, framework: PmfFrameworkId = DEFAULT_FRAMEWORK): Promise<PmfDoc[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.pmfDocuments)
    .where(and(eq(schema.pmfDocuments.appId, appId), eq(schema.pmfDocuments.framework, framework)))
    .orderBy(desc(schema.pmfDocuments.version));
  return rows.map(rowToDoc);
}

export async function getDoc(appId: string, framework: PmfFrameworkId, version: number): Promise<PmfDoc | null> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(schema.pmfDocuments)
    .where(and(eq(schema.pmfDocuments.appId, appId), eq(schema.pmfDocuments.framework, framework), eq(schema.pmfDocuments.version, version)))
    .limit(1);
  return row ? rowToDoc(row) : null;
}

/**
 * Append a version. The unique index on (app, version) is the guard: two
 * concurrent saves cannot both claim the same number, and the loser retries
 * against whatever landed.
 */
async function appendVersion(appId: string, framework: PmfFrameworkId, values: Partial<Record<PmfFieldKey, string>>, meta: { source: PmfDocSource; comment?: string | null }): Promise<PmfDoc> {
  const db = await getDb();
  for (let attempt = 0; attempt < 3; attempt++) {
    const previous = await latestDoc(appId, framework);
    const doc = nextVersion(framework, previous, values, meta);
    try {
      await db.insert(schema.pmfDocuments).values({
        appId,
        framework,
        version: doc.version,
        source: doc.source,
        comment: doc.comment,
        values: doc.values as Record<string, string>,
      });
      return doc;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Someone else took this version number; read again and rebase onto theirs.
      if (!/unique|duplicate/i.test(message) || attempt === 2) throw err;
    }
  }
  throw new Error("could not append a PMF version");
}

export const saveEdit = (appId: string, framework: PmfFrameworkId, values: Partial<Record<PmfFieldKey, string>>): Promise<PmfDoc> =>
  appendVersion(appId, framework, values, { source: "edited" });

// ---------------------------------------------------------------- generation

async function contextFor(app: App): Promise<{ scaffoldInput: Parameters<typeof scaffoldDoc>[1]; metrics: Metrics | null }> {
  const assessment = await latestAssessment(app.id).catch(() => null);
  const metrics = (assessment?.metrics ?? null) as Metrics | null;
  const profile = profileOf(app);
  return {
    scaffoldInput: {
      appName: app.name,
      url: app.url,
      industryLabel: INDUSTRY_LABEL[profile.industry],
      natureLabel: NATURE_LABEL[profile.nature],
      payingUsers: metrics?.payingUsers ?? null,
    },
    metrics,
  };
}

/**
 * What the model is asked for. Reviewable next to the parser that trusts it.
 *
 * The instructions differ by framework because the frameworks disagree about
 * whose ideas these are. `fill` lets the model draft answers. `pressure_test`
 * does not: that framework says the ideas must be the founder's, so the model
 * may only sharpen the questions and challenge what is already written.
 */
export function fillPrompt(f: PmfFramework, app: App, ctx: Awaited<ReturnType<typeof contextFor>>, previous: PmfDoc | null, comment: string | null): string {
  const { scaffoldInput: s, metrics } = ctx;
  const facts = [
    `Business: ${app.name}`,
    app.url ? `Site: ${app.url}` : "",
    `Category: ${s.industryLabel}`,
    `Sells as: ${s.natureLabel}`,
    metrics ? `Paying customers: ${metrics.payingUsers}. MRR: $${(metrics.mrrUsdCents / 100).toFixed(2)}.` : "No payment data connected yet.",
  ].filter(Boolean);

  const framework = f.stages
    .map((stage) => {
      const fields = f.fields.filter((x) => x.stage === stage.key);
      return [
        `Stage ${stage.n}: ${stage.title}`,
        `  Purpose: ${stage.purpose}`,
        ...stage.quotes.slice(0, 1).map((q) => `  In the author's words: "${q.text}"`),
        ...fields.map((x) => `  Field "${x.key}" - ${x.label}: ${x.prompt}`),
      ].join("\n");
    })
    .join("\n\n");

  const prior = previous
    ? `\nThe current answers, which you are revising:\n${JSON.stringify(previous.values, null, 1)}\n`
    : "";
  const ask = comment
    ? `\nThe founder asked for this rewrite:\n"${comment}"\nRewrite only what that comment bears on. Return every field, carrying the rest through unchanged.\n`
    : "";

  const role =
    f.aiRole === "fill"
      ? "You are filling in a product worksheet for a small software business. The framework is fixed - fill its fields, do not restructure it."
      : [
          "You are preparing a product worksheet for a founder to fill in themselves. The framework's own rule is that the ideas must be theirs:",
          `"${f.rules[0]}"`,
          "So you do NOT answer the questions. For each field, write the sharpest version of the question for THIS business - what to look at, what would make an answer good, what a common wrong answer looks like - prefixed exactly with [to fill]. Where the founder has already written an answer, you may pressure-test it: say what it is missing or what it assumes, and leave their words in place.",
        ].join("\n");

  return [
    role,
    "",
    "What is known:",
    ...facts.map((f) => `- ${f}`),
    "",
    "The framework:",
    framework,
    prior,
    ask,
    "Return ONLY a JSON object: {\"values\": {\"<field key>\": \"<answer>\"}}. No prose outside it.",
    "",
    "Rules that matter more than completeness:",
    "- Where you do not know something about THIS business, write the question the founder should answer, prefixed exactly with [to fill]. Never invent a customer, a competitor's number, a revenue figure or an interview finding.",
    f.aiRole === "fill"
      ? "- Later stages depend on conversations that may not have happened. If there is no evidence they have, leave those fields as [to fill] prompts aimed at this business."
      : "- Every field you return must start with [to fill] unless it is a pressure-test of words the founder already wrote. Proposing a segment, a pain, a solution or a metric for them breaks this framework's first rule.",
    "- Two sentences per field at most. This is a worksheet, not an essay.",
    "- Never use an em dash. Use a hyphen.",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * The document a business starts with. Written at creation, and on demand for
 * a business that predates this feature.
 *
 * The scaffold lands first and always - a business is never left without a
 * document because a model was unreachable. When a key is configured the fill
 * runs on top and appends version 2.
 */
export async function generateDoc(app: App, framework: PmfFrameworkId = DEFAULT_FRAMEWORK, opts: { awaitModel?: boolean } = {}): Promise<PmfDoc> {
  const f = frameworkOf(framework);
  const existing = await latestDoc(app.id, f.id);
  const ctx = await contextFor(app);
  const base = existing ?? (await appendVersion(app.id, f.id, scaffoldDoc(f, ctx.scaffoldInput).values, { source: "scaffold" }));
  if (!aiConfigured()) return base;

  const fill = async (): Promise<PmfDoc> => {
    const res = await askForJson(fillPrompt(f, app, ctx, existing, null));
    const values = parseModelValues(f, res.json);
    if (Object.keys(values).length === 0) return base;
    return appendVersion(app.id, f.id, values, { source: "generated" });
  };
  if (opts.awaitModel) return fill();
  void fill().catch((err) => console.error("[pmf] fill failed:", err instanceof Error ? err.message : err));
  return base;
}

/**
 * A rewrite driven by the founder's comment. Needs a model: without one there
 * is nothing to do but edit by hand, and the caller says so rather than
 * silently writing an unchanged version.
 */
export async function rewriteDoc(app: App, framework: PmfFrameworkId, comment: string): Promise<{ doc: PmfDoc | null; error: string | null }> {
  const f = frameworkOf(framework);
  const trimmed = comment.trim().slice(0, 1_000);
  if (trimmed.length < 3) return { doc: null, error: "Say what should change." };
  if (!aiConfigured()) return { doc: null, error: "Rewriting needs a model key on this deployment. Edit the fields directly instead." };
  const previous = await latestDoc(app.id, f.id);
  const ctx = await contextFor(app);
  const res = await askForJson(fillPrompt(f, app, ctx, previous, trimmed));
  const values = parseModelValues(f, res.json);
  if (Object.keys(values).length === 0) return { doc: null, error: res.error ?? "The rewrite came back empty. Nothing was saved." };
  return { doc: await appendVersion(app.id, f.id, values, { source: "rewritten", comment: trimmed }), error: null };
}

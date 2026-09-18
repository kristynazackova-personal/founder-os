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
import { PMF_FIELDS, nextVersion, parseModelValues, parseStoredValues, scaffoldDoc, type PmfDoc, type PmfDocSource, type PmfFieldKey } from "../domain/pmfDoc";
import { PMF_STEPS } from "../domain/pmf";
import { profileOf } from "./gates";
import { aiConfigured, askForJson } from "./ai";
import { latestAssessment } from "./diagnosis";
import type { Metrics } from "../domain/metrics";

const rowToDoc = (row: { version: number; source: string; comment: string | null; values: unknown; createdAt: Date }): PmfDoc => ({
  version: row.version,
  source: (["scaffold", "generated", "edited", "rewritten"] as const).includes(row.source as PmfDocSource) ? (row.source as PmfDocSource) : "edited",
  comment: row.comment,
  values: parseStoredValues(row.values),
  createdAt: row.createdAt.toISOString(),
});

export async function latestDoc(appId: string): Promise<PmfDoc | null> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(schema.pmfDocuments)
    .where(eq(schema.pmfDocuments.appId, appId))
    .orderBy(desc(schema.pmfDocuments.version))
    .limit(1);
  return row ? rowToDoc(row) : null;
}

export async function listDocs(appId: string): Promise<PmfDoc[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.pmfDocuments)
    .where(eq(schema.pmfDocuments.appId, appId))
    .orderBy(desc(schema.pmfDocuments.version));
  return rows.map(rowToDoc);
}

export async function getDoc(appId: string, version: number): Promise<PmfDoc | null> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(schema.pmfDocuments)
    .where(and(eq(schema.pmfDocuments.appId, appId), eq(schema.pmfDocuments.version, version)))
    .limit(1);
  return row ? rowToDoc(row) : null;
}

/**
 * Append a version. The unique index on (app, version) is the guard: two
 * concurrent saves cannot both claim the same number, and the loser retries
 * against whatever landed.
 */
async function appendVersion(appId: string, values: Partial<Record<PmfFieldKey, string>>, meta: { source: PmfDocSource; comment?: string | null }): Promise<PmfDoc> {
  const db = await getDb();
  for (let attempt = 0; attempt < 3; attempt++) {
    const previous = await latestDoc(appId);
    const doc = nextVersion(previous, values, meta);
    try {
      await db.insert(schema.pmfDocuments).values({
        appId,
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

export const saveEdit = (appId: string, values: Partial<Record<PmfFieldKey, string>>): Promise<PmfDoc> =>
  appendVersion(appId, values, { source: "edited" });

// ---------------------------------------------------------------- generation

async function contextFor(app: App): Promise<{ scaffoldInput: Parameters<typeof scaffoldDoc>[0]; metrics: Metrics | null }> {
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

/** What the model is asked for. Reviewable next to the parser that trusts it. */
export function fillPrompt(app: App, ctx: Awaited<ReturnType<typeof contextFor>>, previous: PmfDoc | null, comment: string | null): string {
  const { scaffoldInput: s, metrics } = ctx;
  const facts = [
    `Business: ${app.name}`,
    app.url ? `Site: ${app.url}` : "",
    `Category: ${s.industryLabel}`,
    `Sells as: ${s.natureLabel}`,
    metrics ? `Paying customers: ${metrics.payingUsers}. MRR: $${(metrics.mrrUsdCents / 100).toFixed(2)}.` : "No payment data connected yet.",
  ].filter(Boolean);

  const framework = PMF_STEPS.map((step) => {
    const fields = PMF_FIELDS.filter((f) => f.step === step.key);
    return [
      `Step ${step.n}: ${step.title}`,
      `  Purpose: ${step.purpose}`,
      ...step.quotes.slice(0, 1).map((q) => `  In the author's words: "${q.text}"`),
      ...fields.map((f) => `  Field "${f.key}" - ${f.label}: ${f.prompt}`),
    ].join("\n");
  }).join("\n\n");

  const prior = previous
    ? `\nThe current answers, which you are revising:\n${JSON.stringify(previous.values, null, 1)}\n`
    : "";
  const ask = comment
    ? `\nThe founder asked for this rewrite:\n"${comment}"\nRewrite only what that comment bears on. Return every field, carrying the rest through unchanged.\n`
    : "";

  return [
    "You are filling in a product-market-fit worksheet for a small software business. The framework is fixed - fill its fields, do not restructure it.",
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
    "- Steps 3 to 5 depend on conversations that may not have happened. If there is no evidence they have, leave those fields as [to fill] prompts aimed at this business.",
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
export async function generateDoc(app: App, opts: { awaitModel?: boolean } = {}): Promise<PmfDoc> {
  const existing = await latestDoc(app.id);
  const ctx = await contextFor(app);
  const base = existing ?? (await appendVersion(app.id, scaffoldDoc(ctx.scaffoldInput).values, { source: "scaffold" }));
  if (!aiConfigured()) return base;

  const fill = async (): Promise<PmfDoc> => {
    const res = await askForJson(fillPrompt(app, ctx, existing, null));
    const values = parseModelValues(res.json);
    if (Object.keys(values).length === 0) return base;
    return appendVersion(app.id, values, { source: "generated" });
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
export async function rewriteDoc(app: App, comment: string): Promise<{ doc: PmfDoc | null; error: string | null }> {
  const trimmed = comment.trim().slice(0, 1_000);
  if (trimmed.length < 3) return { doc: null, error: "Say what should change." };
  if (!aiConfigured()) return { doc: null, error: "Rewriting needs a model key on this deployment. Edit the fields directly instead." };
  const previous = await latestDoc(app.id);
  const ctx = await contextFor(app);
  const res = await askForJson(fillPrompt(app, ctx, previous, trimmed));
  const values = parseModelValues(res.json);
  if (Object.keys(values).length === 0) return { doc: null, error: res.error ?? "The rewrite came back empty. Nothing was saved." };
  return { doc: await appendVersion(app.id, values, { source: "rewritten", comment: trimmed }), error: null };
}

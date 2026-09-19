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
import { parseTable, readTable, renderTableForPrompt, serializeTable, withRowLabelColumn, type PmfTable } from "../domain/pmfTable";
import { SELF_DESCRIPTION_COLUMN, parseSegmentations, segmentationsPrompt, type SegmentationOption } from "../domain/pmfSegmentations";
import { columnPrompt, promptFor, rowPrompt, tableStageForField, type TablePromptSpec } from "../domain/pmfPrompts";
import { PREFILL_STAGE, prefillFields, prefillPrompt } from "../domain/pmfPrefill";
import { answerGuidance } from "../domain/pmfAnswers";
import { sourceSummary } from "../domain/businessCase";
import { extractUploadText, fetchWebsiteText } from "./businessCase";
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
    answerGuidance(),
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
    const res = await askForJson(fillPrompt(f, app, ctx, existing, null), { purpose: "doc_fill" });
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
  const res = await askForJson(fillPrompt(f, app, ctx, previous, trimmed), { purpose: "doc_fill" });
  const values = parseModelValues(f, res.json);
  if (Object.keys(values).length === 0) return { doc: null, error: res.error ?? "The rewrite came back empty. Nothing was saved." };
  return { doc: await appendVersion(app.id, f.id, values, { source: "rewritten", comment: trimmed }), error: null };
}

// ---------------------------------------------------------------- tables

/**
 * Generate one table: its columns first, then its rows against those columns.
 *
 * Two calls rather than one, because the column set is a decision in its own
 * right - her doc treats the parameters as something to choose per business -
 * and asking for both at once produces rows shaped to columns the model has
 * not committed to yet.
 *
 * The prompts are in domain/pmfPrompts.ts, condensed from the research in
 * docs/research/pmf-build/. Rows are prompts with their cells filled in as
 * questions: the framework's first rule is not suspended by a table.
 */
/**
 * What a table's prompts read: the business, and the answers ABOVE this table
 * in framework order.
 *
 * Only upward. Feeding later stages back would be circular, and the chain is
 * segment -> pains -> solutions, so earlier TABLES count: the pains table
 * reads the segments the founder actually wrote. `[to fill]` values are
 * dropped, so a half-answered stage produces a weaker table rather than a
 * confidently wrong one.
 */
async function tableContext(app: App, f: PmfFramework, spec: TablePromptSpec, field: string) {
  const doc = await latestDoc(app.id, f.id);
  const ctx = await contextFor(app);
  const business = [
    app.name,
    ctx.scaffoldInput.industryLabel,
    ctx.scaffoldInput.natureLabel,
    app.url ?? "",
  ].filter(Boolean).join(" · ");

  const stageIndex = f.stages.findIndex((x) => x.key === spec.stage);
  const above = f.fields.filter((x) => {
    const at = f.stages.findIndex((st) => st.key === x.stage);
    return at >= 0 && at <= stageIndex && x.key !== field;
  });
  const answers = above
    .map((x) => {
      const v = doc?.values[x.key];
      if (!v) return null;
      if (x.table) return renderTableForPrompt(readTable(v), x.label) || null;
      return v.startsWith("[to fill]") ? null : `${x.label}: ${v}`;
    })
    .filter(Boolean)
    .join("\n\n");

  return { doc, business, answers };
}

/** Draft rows against columns that already exist. Shared by both entry points. */
async function draftRows(
  spec: TablePromptSpec,
  columns: PmfTable["columns"],
  context: { business: string; answers: string },
): Promise<{ rows: PmfTable["rows"]; error: string | null }> {
  const rendered = columns
    .map((c) => `- ${c.key} (${c.label}, ${c.kind}${c.options ? `: ${c.options.join(" / ")}` : c.kind === "scale" ? `: ${c.min} to ${c.max}` : ""})${c.anchors ? ` - ${c.anchors}` : ""}`)
    .join("\n");
  const res = await askForJson(rowPrompt(spec, { ...context, columns: rendered }), { purpose: "table_rows" });
  const rows = parseTable({ columns, rows: (res.json as { rows?: unknown } | null)?.rows }).rows;
  // An empty table used to save as a success, which read as "the model had
  // nothing to suggest" when it actually meant the call failed.
  return { rows, error: rows.length > 0 ? null : res.error ?? "The model returned no usable rows." };
}

export async function generateTable(app: App, framework: PmfFrameworkId, field: string): Promise<{ table: PmfTable | null; error: string | null }> {
  const stage = tableStageForField(field);
  if (!stage) return { table: null, error: "That field is not a table." };
  if (!aiConfigured()) return { table: null, error: "Generating a table needs a model key on this deployment. Add rows by hand instead." };

  const f = frameworkOf(framework);
  const spec = promptFor(stage);
  const { business, answers } = await tableContext(app, f, spec, field);

  const colRes = await askForJson(columnPrompt(spec, { business, answers }), { purpose: "table_columns" });
  const derived = parseTable(colRes.json).columns;
  if (derived.length === 0) return { table: null, error: colRes.error ?? "The model returned no usable columns." };
  const columns = withRowLabelColumn(derived, spec.rowLabel.label, spec.rowLabel.prompt);

  const drafted = await draftRows(spec, columns, { business, answers });
  const table: PmfTable = { columns, rows: drafted.rows };
  // The columns are saved either way: they are the expensive half, and losing
  // them to a failure in the second call would mean deriving them again.
  await appendVersion(app.id, f.id, { [field]: serializeTable(table) }, { source: "generated" });
  return { table, error: drafted.error };
}

/**
 * Rows only, against the columns already stored.
 *
 * Re-deriving is destructive - it replaces the columns the founder just
 * approved - so a row call that came back empty needs its own retry. This is
 * also the button for "these columns are right, now suggest some rows".
 */
export async function generateRows(app: App, framework: PmfFrameworkId, field: string): Promise<{ table: PmfTable | null; error: string | null }> {
  const stage = tableStageForField(field);
  if (!stage) return { table: null, error: "That field is not a table." };
  if (!aiConfigured()) return { table: null, error: "Suggesting rows needs a model key on this deployment. Add rows by hand instead." };

  const f = frameworkOf(framework);
  const spec = promptFor(stage);
  const { doc, business, answers } = await tableContext(app, f, spec, field);
  const columns = readTable(doc?.values[field]).columns;
  if (columns.length === 0) return { table: null, error: "There are no columns yet. Generate with AI first." };

  const drafted = await draftRows(spec, columns, { business, answers });
  if (drafted.rows.length === 0) return { table: null, error: drafted.error };

  const table: PmfTable = { columns, rows: drafted.rows };
  await appendVersion(app.id, f.id, { [field]: serializeTable(table) }, { source: "generated" });
  return { table, error: null };
}

/**
 * Several whole ways to split this market, for the founder to choose between.
 *
 * Writes nothing. The unpicked alternatives are deliberately not stored: they
 * are cheap to ask for again, and keeping them would turn one decision into a
 * drawer of half-considered ones.
 */
export async function proposeSegmentations(
  app: App,
  framework: PmfFrameworkId,
  field: string,
): Promise<{ options: SegmentationOption[]; error: string | null }> {
  const stage = tableStageForField(field);
  if (!stage) return { options: [], error: "That field is not a table." };
  if (!aiConfigured()) return { options: [], error: "Comparing segmentations needs a model key on this deployment." };

  const f = frameworkOf(framework);
  const spec = promptFor(stage);
  const { business, answers } = await tableContext(app, f, spec, field);
  const res = await askForJson(segmentationsPrompt(spec, { business, answers }), { purpose: "segmentations" });
  const options = parseSegmentations(res.json);
  return { options, error: options.length > 0 ? null : res.error ?? "The model returned no usable segmentations." };
}

/**
 * Adopt one segmentation as the table.
 *
 * The chosen axis decides the rows, so this REPLACES them rather than
 * appending - mixing rows from two axes is the overlap the compare step
 * exists to prevent. Any scoring columns already derived are kept and left
 * empty, because scoring is the founder's judgement and always was.
 */
export async function chooseSegmentation(
  app: App,
  framework: PmfFrameworkId,
  field: string,
  option: SegmentationOption,
): Promise<{ table: PmfTable | null; error: string | null }> {
  const stage = tableStageForField(field);
  if (!stage) return { table: null, error: "That field is not a table." };
  if (option.rows.length === 0) return { table: null, error: "That segmentation has no rows." };

  const f = frameworkOf(framework);
  const spec = promptFor(stage);
  const doc = await latestDoc(app.id, f.id);
  const existing = readTable(doc?.values[field]);

  // The label column may not exist yet - a segmentation can be chosen before
  // any columns have been derived, and then it is the whole table.
  const withLabel = withRowLabelColumn(existing.columns, spec.rowLabel.label, spec.rowLabel.prompt);
  const columns = withLabel.some((c) => c.key === SELF_DESCRIPTION_COLUMN.key)
    ? withLabel
    : [
        withLabel[0]!,
        { key: SELF_DESCRIPTION_COLUMN.key, label: SELF_DESCRIPTION_COLUMN.label, kind: "text" as const, anchors: SELF_DESCRIPTION_COLUMN.prompt },
        ...withLabel.slice(1),
      ];

  const labelKey = columns[0]!.key;
  const table = parseTable({
    columns,
    rows: option.rows.map((r) => ({
      cells: { [labelKey]: r.situation, [SELF_DESCRIPTION_COLUMN.key]: r.selfDescription },
    })),
  });
  await appendVersion(app.id, f.id, { [field]: serializeTable(table) }, { source: "generated" });
  return { table, error: null };
}

/** Save edited rows against the columns already stored, which the form cannot change. */
export async function saveTable(app: App, framework: PmfFrameworkId, field: string, rows: PmfTable["rows"]): Promise<PmfTable> {
  const f = frameworkOf(framework);
  const doc = await latestDoc(app.id, f.id);
  const existing = readTable(doc?.values[field]);
  const table = parseTable({ columns: existing.columns, rows });
  await appendVersion(app.id, f.id, { [field]: serializeTable(table) }, { source: "edited" });
  return table;
}

export type PrefillResult = { filled: string[]; asked: string[]; sources: string; error: string | null };

/**
 * Prefill stage 1 from the founder's own website and business case.
 *
 * Deliberately separate from everything below it. Stage 1 describes a
 * business that already exists, so the tool may answer it; every stage after
 * it is the founder's thinking, and stays behind its own button. See
 * domain/pmfPrefill.ts for why that line is where it is.
 *
 * Only stage-1 keys are ever written, whatever the model returns, and a field
 * the evidence could not answer comes back as a `[to fill]` question rather
 * than a guess - so the founder can see at a glance what it knew and what it
 * is asking them.
 */
export async function prefillGoalStage(
  app: App,
  framework: PmfFrameworkId,
  opts: { websiteUrl?: string | null; file?: File | null },
): Promise<PrefillResult> {
  const f = frameworkOf(framework);
  const keys = new Set(prefillFields(f).map((x) => x.key));
  if (keys.size === 0) return { filled: [], asked: [], sources: "nothing yet", error: "This framework has no stage to prefill." };
  if (!aiConfigured()) return { filled: [], asked: [], sources: "nothing yet", error: "Prefilling needs a model key on this deployment." };

  const problems: string[] = [];
  let website: string | null = null;
  let document: string | null = null;

  // The URL is passed in, not read off the record: the founder can point this
  // run at a different address without changing their business settings.
  if (opts.websiteUrl) {
    const res = await fetchWebsiteText(opts.websiteUrl);
    website = res.text;
    if (res.error) problems.push(res.error);
  }
  if (opts.file && opts.file.size > 0) {
    const res = await extractUploadText(opts.file);
    document = res.text;
    if (res.error) problems.push(res.error);
  }

  const sources = sourceSummary({ website, document });
  if (!website && !document) {
    return { filled: [], asked: [], sources, error: problems.join(" ") || "Nothing to read. Tick the website, upload a document, or both." };
  }

  const ctx = await contextFor(app);
  const business = [app.name, ctx.scaffoldInput.industryLabel, ctx.scaffoldInput.natureLabel, app.url ?? ""].filter(Boolean).join(" \u00b7 ");
  const res = await askForJson(prefillPrompt(f, { business, website, document }), { purpose: "prefill", timeoutMs: 60_000 });
  const values = parseModelValues(f, res.json);

  // Whatever came back, only stage 1 is written. A model that answers a later
  // stage here would be answering for the founder, which is the one thing this
  // framework does not do.
  const stageOnly: Partial<Record<PmfFieldKey, string>> = {};
  for (const [k, v] of Object.entries(values)) if (keys.has(k) && v) stageOnly[k] = v;
  if (Object.keys(stageOnly).length === 0) {
    return { filled: [], asked: [], sources, error: res.error ?? "The model returned nothing usable for this stage." };
  }

  await appendVersion(app.id, f.id, stageOnly, { source: "generated" });
  const label = (key: string) => f.fields.find((x) => x.key === key)?.label ?? key;
  return {
    filled: Object.keys(stageOnly).filter((k) => !stageOnly[k]!.startsWith("[to fill]")).map(label),
    asked: Object.keys(stageOnly).filter((k) => stageOnly[k]!.startsWith("[to fill]")).map(label),
    sources,
    error: problems.length > 0 ? problems.join(" ") : null,
  };
}

export { PREFILL_STAGE };

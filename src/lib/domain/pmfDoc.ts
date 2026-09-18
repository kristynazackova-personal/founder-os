/**
 * A filled-in framework, versioned.
 *
 * The frameworks themselves are domain/pmfFrameworks.ts. This module is one
 * app's ANSWERS to one of them: the framework owns the field list, so the
 * form, the model prompt and the stored document can never disagree about
 * what is being asked.
 *
 * Pure. No DB, no env, no network.
 *
 * Versioning: a document is immutable once written. An edit writes version
 * n+1, and so does a rewrite from a comment. Nothing is overwritten, so the
 * founder can always see what the tool wrote first and what they changed.
 */
import { fieldsOfStage, type PmfFramework, type PmfFrameworkId } from "./pmfFrameworks";

export type PmfFieldKey = string;

export type PmfDocSource = "scaffold" | "generated" | "edited" | "rewritten";

export const SOURCE_LABEL: Record<PmfDocSource, string> = {
  scaffold: "Starting draft",
  generated: "Filled in by Founder OS",
  edited: "Edited by you",
  rewritten: "Rewritten from your comment",
};

export type PmfDoc = {
  framework: PmfFrameworkId;
  version: number;
  source: PmfDocSource;
  /** The comment that produced a rewrite, kept with the version it produced. */
  comment: string | null;
  values: Partial<Record<PmfFieldKey, string>>;
  createdAt: string;
};

/** A field the founder has not answered yet. Blank is honest; invented text is not. */
export const UNANSWERED = "";

export const isAnswered = (v: string | undefined): boolean => Boolean(v && v.trim().length > 0);

export const answeredCount = (f: PmfFramework, doc: Pick<PmfDoc, "values"> | null): number =>
  doc ? f.fields.filter((x) => isAnswered(doc.values[x.key])).length : 0;

export const completion = (f: PmfFramework, doc: Pick<PmfDoc, "values"> | null): number =>
  f.fields.length === 0 ? 0 : answeredCount(f, doc) / f.fields.length;

/** Which stages still have an empty field, in framework order. */
export function incompleteStages(f: PmfFramework, doc: Pick<PmfDoc, "values"> | null): string[] {
  return f.stages.filter((s) => fieldsOfStage(f, s.key).some((x) => !isAnswered(doc?.values[x.key]))).map((s) => s.key);
}

// ---------------------------------------------------------------- scaffold

export type ScaffoldInput = {
  appName: string;
  url: string | null;
  industryLabel: string;
  natureLabel: string;
  /** Paying customers, when an assessment exists. */
  payingUsers: number | null;
};

/**
 * The deterministic first draft, written from the little that is known at
 * creation: the name, the category and how it charges.
 *
 * It answers nothing it cannot know. Every field is a question aimed at this
 * specific business, so the document is useful before any model has run and
 * stays honest if none ever does. A guessed answer here would be worse than
 * an empty one - the founder would read it as a finding.
 */
export function scaffoldDoc(f: PmfFramework, input: ScaffoldInput, now = new Date()): PmfDoc {
  const { appName, industryLabel, natureLabel, payingUsers } = input;
  const who = payingUsers && payingUsers > 0 ? `${payingUsers} paying customer${payingUsers === 1 ? "" : "s"}` : "your first customers";
  const context = `${appName}, a ${industryLabel.toLowerCase()} product sold as ${natureLabel.toLowerCase()}`;
  const values: Partial<Record<PmfFieldKey, string>> = {};
  for (const field of f.fields) {
    // The prompt is the answer until the founder writes one. It carries the
    // business into the question so the page is about them from the start.
    values[field.key] = `${PLACEHOLDER_PREFIX} ${field.prompt} (${context}${field.stage === "qualitative" ? `, starting with ${who}` : ""})`;
  }
  return { framework: f.id, version: 1, source: "scaffold", comment: null, createdAt: now.toISOString(), values };
}

/** Text the scaffold wrote, which the UI marks as a prompt rather than an answer. */
export const PLACEHOLDER_PREFIX = "[to fill]";
export const isPlaceholder = (v: string | undefined): boolean => Boolean(v && v.trim().startsWith(PLACEHOLDER_PREFIX));

// ---------------------------------------------------------------- model output

/**
 * Keep only fields the framework asks for, trimmed and bounded. A model that
 * invents a field, or answers one with a paragraph of filler, gets that
 * answer dropped rather than stored.
 */
export function parseModelValues(f: PmfFramework, input: unknown): Partial<Record<PmfFieldKey, string>> {
  if (!input || typeof input !== "object") return {};
  const raw = (input as { values?: unknown }).values ?? input;
  if (!raw || typeof raw !== "object") return {};
  const known = new Set(f.fields.map((x) => x.key));
  const out: Partial<Record<PmfFieldKey, string>> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!known.has(k) || typeof v !== "string") continue;
    const text = v.trim().slice(0, 2_000);
    if (text.length === 0) continue;
    out[k as PmfFieldKey] = text;
  }
  return out;
}

/** The next version, carrying forward anything the new values do not cover. */
export function nextVersion(
  framework: PmfFrameworkId,
  previous: PmfDoc | null,
  values: Partial<Record<PmfFieldKey, string>>,
  meta: { source: PmfDocSource; comment?: string | null; now?: Date },
): PmfDoc {
  return {
    framework,
    version: (previous?.version ?? 0) + 1,
    source: meta.source,
    comment: meta.comment ?? null,
    createdAt: (meta.now ?? new Date()).toISOString(),
    values: { ...(previous?.values ?? {}), ...values },
  };
}

/** Round-trip guard for the jsonb column. */
export function parseStoredValues(f: PmfFramework, value: unknown): Partial<Record<PmfFieldKey, string>> {
  return parseModelValues(f, { values: value });
}

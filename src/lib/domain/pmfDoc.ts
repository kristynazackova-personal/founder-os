/**
 * A filled-in PMF framework, versioned.
 *
 * The framework itself is domain/pmf.ts - her five steps, her words. This is
 * one app's ANSWERS to it: a fixed set of fields per step, so the form, the
 * model prompt and the stored document can never disagree about what the
 * framework asks for.
 *
 * Pure. No DB, no env, no network.
 *
 * Versioning: a document is immutable once written. An edit writes version
 * n+1, and so does a rewrite from a comment. Nothing is overwritten, so the
 * founder can always see what the tool wrote first and what they changed.
 */
import { PMF_STEPS, type PmfStepKey } from "./pmf";

export type PmfFieldKey =
  | "hurt_sentence" | "mechanism"
  | "who_uses" | "who_decides" | "interview_plan"
  | "candidates" | "competitors" | "revenue_estimate"
  | "burning" | "not_burning"
  | "revenue_driver" | "quarterly_goal" | "launch_metrics" | "measurement_hygiene";

export type PmfField = {
  key: PmfFieldKey;
  step: PmfStepKey;
  label: string;
  /** What a good answer contains. Shown under the field and sent to the model. */
  prompt: string;
  /** Long answers get a textarea. */
  long?: boolean;
};

export const PMF_FIELDS: PmfField[] = [
  { key: "hurt_sentence", step: "bar", label: "What breaks the day they stop paying", prompt: "One sentence, concrete. Not a benefit - the thing that stops working for them." },
  { key: "mechanism", step: "bar", label: "Cost or revenue", prompt: "Which of the two mechanisms this is, and roughly how much. If it is neither, say so plainly." },
  { key: "who_uses", step: "qualitative", label: "Who actually uses it", prompt: "The role inside the customer, and what they open it to do." },
  { key: "who_decides", step: "qualitative", label: "Who decided to buy", prompt: "The person who signs off, which is often not the user, and what they are measured on." },
  { key: "interview_plan", step: "qualitative", label: "Who to talk to first", prompt: "Named customers or segments, in order, with which of the two conversations each one is for.", long: true },
  { key: "candidates", step: "quantitative", label: "Candidate solutions", prompt: "At most three, each one a thing you could build or sharpen. Fewer is better.", long: true },
  { key: "competitors", step: "quantitative", label: "Competitors and the gap", prompt: "Who else solves this, and the specific gap you would be filling.", long: true },
  { key: "revenue_estimate", step: "quantitative", label: "Revenue per candidate", prompt: "A rough number per candidate that you could defend out loud." },
  { key: "burning", step: "prioritise", label: "Burning", prompt: "What breaks if you do not do it, ordered by how fast and how widely it breaks.", long: true },
  { key: "not_burning", step: "prioritise", label: "Not burning", prompt: "Everything else, ordered by cost saved or revenue added. Nothing else gets a vote.", long: true },
  { key: "revenue_driver", step: "kpis", label: "The one revenue driver", prompt: "The single metric that moves revenue for this business." },
  { key: "quarterly_goal", step: "kpis", label: "Quarterly goal", prompt: "One number above the driver, checked roughly every three months." },
  { key: "launch_metrics", step: "kpis", label: "Per-launch numbers", prompt: "What to read when a feature ships, and in the dashboard day to day." },
  { key: "measurement_hygiene", step: "kpis", label: "Measurement hygiene", prompt: "Whether test traffic is separated from real traffic, and what to fix if not." },
];

export const fieldsForStep = (step: PmfStepKey): PmfField[] => PMF_FIELDS.filter((f) => f.step === step);

export type PmfDocSource = "scaffold" | "generated" | "edited" | "rewritten";

export const SOURCE_LABEL: Record<PmfDocSource, string> = {
  scaffold: "Starting draft",
  generated: "Filled in by Founder OS",
  edited: "Edited by you",
  rewritten: "Rewritten from your comment",
};

export type PmfDoc = {
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

export const answeredCount = (doc: Pick<PmfDoc, "values"> | null): number =>
  doc ? PMF_FIELDS.filter((f) => isAnswered(doc.values[f.key])).length : 0;

export const completion = (doc: Pick<PmfDoc, "values"> | null): number => answeredCount(doc) / PMF_FIELDS.length;

/** Which steps still have an empty field, in framework order. */
export function incompleteSteps(doc: Pick<PmfDoc, "values"> | null): PmfStepKey[] {
  return PMF_STEPS.filter((s) => fieldsForStep(s.key).some((f) => !isAnswered(doc?.values[f.key]))).map((s) => s.key);
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
export function scaffoldDoc(input: ScaffoldInput, now = new Date()): PmfDoc {
  const { appName, industryLabel, natureLabel, payingUsers } = input;
  const who = payingUsers && payingUsers > 0 ? `${payingUsers} paying customer${payingUsers === 1 ? "" : "s"}` : "your first customers";
  return {
    version: 1,
    source: "scaffold",
    comment: null,
    createdAt: now.toISOString(),
    values: {
      hurt_sentence: `[to fill] What stops working for a ${industryLabel.toLowerCase()} customer the day they stop paying for ${appName}?`,
      mechanism: `[to fill] Cost or revenue - which one, and how much. ${natureLabel} pricing means the answer has to be worth the recurring charge.`,
      who_uses: "[to fill] The role that opens it, and what they open it to do.",
      who_decides: "[to fill] Who signs off, and what their company measures them on.",
      interview_plan: `[to fill] Start with ${who}. One hour each with a user, a separate conversation with whoever decided to buy.`,
      candidates: "[to fill] Fill this after the conversations, not before. At most three.",
      competitors: "[to fill] Who else solves this, and the gap you would fill.",
      revenue_estimate: "[to fill] A defensible rough number per candidate.",
      burning: "[to fill] What breaks if you do not do it.",
      not_burning: "[to fill] Everything else, ordered by cost saved or revenue added.",
      revenue_driver: "[to fill] The one metric that moves revenue here.",
      quarterly_goal: "[to fill] One number above the driver.",
      launch_metrics: "[to fill] What to read when a feature ships.",
      measurement_hygiene: "[to fill] Is test traffic separated from real traffic?",
    },
  };
}

/** Text the scaffold wrote, which the UI marks as a prompt rather than an answer. */
export const isPlaceholder = (v: string | undefined): boolean => Boolean(v && v.trim().startsWith("[to fill]"));

// ---------------------------------------------------------------- model output

/**
 * Keep only fields the framework asks for, trimmed and bounded. A model that
 * invents a field, or answers one with a paragraph of filler, gets that
 * answer dropped rather than stored.
 */
export function parseModelValues(input: unknown): Partial<Record<PmfFieldKey, string>> {
  if (!input || typeof input !== "object") return {};
  const raw = (input as { values?: unknown }).values ?? input;
  if (!raw || typeof raw !== "object") return {};
  const known = new Set(PMF_FIELDS.map((f) => f.key as string));
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
  previous: PmfDoc | null,
  values: Partial<Record<PmfFieldKey, string>>,
  meta: { source: PmfDocSource; comment?: string | null; now?: Date },
): PmfDoc {
  return {
    version: (previous?.version ?? 0) + 1,
    source: meta.source,
    comment: meta.comment ?? null,
    createdAt: (meta.now ?? new Date()).toISOString(),
    values: { ...(previous?.values ?? {}), ...values },
  };
}

/** Round-trip guard for the jsonb column. */
export function parseStoredValues(value: unknown): Partial<Record<PmfFieldKey, string>> {
  return parseModelValues({ values: value });
}

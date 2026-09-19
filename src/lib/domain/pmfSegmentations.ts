/**
 * Comparing whole WAYS to split a market, rather than one set of rows.
 *
 * A MECE list is only MECE with respect to an axis, and until now the
 * generator picked an axis silently and returned the rows it implied. That
 * hid the actual strategic decision: whether this business is splitting its
 * market by the moment someone is in, by what they have already tried, by
 * what they can afford, or by something else again. Each axis produces a
 * defensible table and a different company.
 *
 * So this asks for several complete segmentations and makes the founder
 * choose between them. Two rules come out of that framing:
 *
 *  - **A row is a situation, never a label.** "Depression" is not a segment;
 *    "cannot get out of bed while their partner quietly carries everything"
 *    is. The label is a diagnosis, which for most products is a claim they
 *    are not entitled to make, and it does not predict a purchase either.
 *  - **The label still matters, in its own field.** It is how these people
 *    search and how an ad reaches them, which is a different job from
 *    describing their situation. `selfDescription` is that bridge, and it is
 *    what marketing copy gets written from.
 *
 * Axes must not be mixed. Someone with depression can be in any of the
 * rupture situations, so a table holding "depression" rows next to "just
 * moved in together" rows is not mutually exclusive even though every row
 * looks fine on its own. Presenting axes as whole alternatives is what
 * prevents that.
 *
 * Pure strings and parsing. No DB, no env, no network.
 */
import { answerGuidance } from "./pmfAnswers";
import type { TablePromptSpec } from "./pmfPrompts";

/**
 * The one field this applies to.
 *
 * "Which axis" is a much sharper question for users than for pains or
 * solutions: a pain is anchored to a step of a journey that is already
 * written, so the axis is given. Widen this only when a second table turns
 * out to have the same ambiguity.
 */
export const SEGMENTATION_FIELD = "segment_list";

export const MIN_SEGMENTATIONS = 2;
export const MAX_SEGMENTATIONS = 4;
export const MAX_ROWS_PER_SEGMENTATION = 6;

/** The column a chosen segmentation needs, beyond the row label. */
export const SELF_DESCRIPTION_COLUMN = {
  key: "self_description",
  label: "How they describe themselves",
  prompt: "The words these people use for their own situation, and would type into a search box. This is what an ad has to match.",
} as const;

export type SegmentationRow = { situation: string; selfDescription: string };

export type SegmentationOption = {
  /** The lens: what this way of splitting divides people BY. */
  axis: string;
  /** Why it might be the right lens for this business. */
  why: string;
  /** What it cannot see, and what it costs. Never empty - every axis hides something. */
  hides: string;
  rows: SegmentationRow[];
};

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Tolerant: a model that returns one option, or rows without a self-description, still parses. */
export function parseSegmentations(json: unknown): SegmentationOption[] {
  const raw = (json as { segmentations?: unknown } | null)?.segmentations;
  if (!Array.isArray(raw)) return [];

  const options: SegmentationOption[] = [];
  for (const item of raw.slice(0, MAX_SEGMENTATIONS)) {
    const o = item as Record<string, unknown>;
    const axis = str(o.axis);
    const rows = (Array.isArray(o.rows) ? o.rows : [])
      .slice(0, MAX_ROWS_PER_SEGMENTATION)
      .map((r) => {
        const row = r as Record<string, unknown>;
        return { situation: str(row.situation), selfDescription: str(row.selfDescription) };
      })
      .filter((r) => r.situation.length > 0);
    // An axis with no rows is a slogan, not a segmentation, and cannot be
    // compared against one that has them.
    if (axis && rows.length > 0) options.push({ axis, why: str(o.why), hides: str(o.hides), rows });
  }
  return options;
}

export function segmentationsPrompt(spec: TablePromptSpec, context: { business: string; answers: string }): string {
  return [
    `You are proposing several different WAYS TO SPLIT the market for "${spec.title}", so the founder can choose between them.`,
    "",
    `The business: ${context.business}`,
    "",
    "What the founder has already answered above this table:",
    context.answers || "(nothing yet)",
    "",
    `Return between ${MIN_SEGMENTATIONS} and ${MAX_SEGMENTATIONS} segmentations. Each one is a COMPLETE alternative: one axis, and the rows that axis produces.`,
    "",
    "Rules:",
    ...[
      "An axis is what you divide people BY - the moment they are in, what they have already tried, what they can afford, who else is involved. Not a demographic, and not a feature of the product.",
      "The axes must genuinely differ. Two that produce almost the same rows are one axis described twice, and comparing them teaches the founder nothing.",
      "Within one segmentation the rows are mutually exclusive and collectively exhaustive. Never mix axes inside one: a person can be in a situation AND have a diagnosis, so rows drawn from two axes overlap even when each looks fine alone.",
      "A row is a SITUATION, never a label. 'Depression' is a diagnosis, not a segment, and claiming to address it is a claim most products are not entitled to make; 'cannot get out of bed while their partner quietly carries everything' is a situation. The same goes for ADHD, anxiety, burnout and any other clinical term.",
      "`selfDescription` is how those people talk about themselves and what they would type into a search box. It does the acquisition job the label was reaching for, without the claim. It may use their words for their condition; the row itself may not.",
      "`hides` is required and must be real. Every axis is blind to something and costs something - a pricing ceiling, churn when a crisis passes, a market too small to reach. An axis presented with no downside has not been thought about.",
      `At most ${MAX_ROWS_PER_SEGMENTATION} rows per segmentation, and fewer is better.`,
      "Never use an em dash; use a hyphen.",
    ].map((r) => `- ${r}`),
    "",
    "Watch for:",
    ...spec.cautions.map((c) => `- ${c}`),
    "",
    answerGuidance(),
    "",
    'Return ONLY JSON: {"segmentations":[{"axis":"what this splits people by","why":"why it might be right here","hides":"what it cannot see and what it costs","rows":[{"situation":"…","selfDescription":"…"}]}]}',
  ].join("\n");
}

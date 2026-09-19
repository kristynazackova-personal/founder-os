/**
 * The prompt that prefills stage 1 of the build framework from a founder's
 * website and their business case.
 *
 * This is the ONE place the build framework is allowed to answer rather than
 * only ask, and the exemption is narrow on purpose. Stage 1 is a description
 * of a business that already exists: what it does, what the user gets, what
 * the founder wants, where they want to be. The framework's first rule -
 * "the ideas should be yours" - protects the segments, the pains and the
 * solutions, which are the thinking. It was never meant to make someone
 * retype their own homepage. Do not widen this to any other stage.
 *
 * Pure strings. No DB, no env, no network.
 */
import type { PmfFramework } from "./pmfFrameworks";
import { answerGuidance } from "./pmfAnswers";

export const PREFILL_STAGE = "goal";

/**
 * The one answer a website almost never contains.
 *
 * "What do YOU want out of it" is the single most load-bearing answer in the
 * framework: it is what drops the pay-strength column for an impact-first
 * founder, and it steers every table below. A landing page is marketing copy,
 * written for customers, and it will happily imply a revenue motive that the
 * founder does not hold. Guessing it corrupts everything downstream, so the
 * prompt is told to ask rather than infer unless the evidence says it plainly.
 */
export const FOUNDER_INTENT_FIELD = "your_outcome";

export const PREFILL_RULES: string[] = [
  "Answer ONLY what the evidence supports. This is a description of their business, not a proposal for it.",
  `Be especially careful with "${FOUNDER_INTENT_FIELD}". A website is marketing copy written for customers and will imply a revenue motive the founder may not hold. Unless they state what THEY want out of it, ask.`,
  "Stage 1 is four decisions, not a precis of the source. The evidence is usually a page selling the product, and a faithful summary of it answers none of these four questions.",
  "Never use an em dash; use a hyphen.",
];

/** The stage-1 fields, rendered for the prompt with the question each one asks. */
export function prefillFields(f: PmfFramework): { key: string; label: string; prompt: string }[] {
  return f.fields
    .filter((x) => x.stage === PREFILL_STAGE)
    .map((x) => ({ key: x.key, label: x.label, prompt: x.prompt }));
}

export function prefillPrompt(
  f: PmfFramework,
  context: { business: string; website: string | null; document: string | null },
): string {
  const fields = prefillFields(f);
  const evidence: string[] = [];
  if (context.website) evidence.push(`--- THEIR WEBSITE ---\n${context.website}`);
  if (context.document) evidence.push(`--- THEIR BUSINESS CASE ---\n${context.document}`);

  return [
    "You are filling in the first stage of a product framework worksheet for a founder, from evidence they provided about their own business.",
    "",
    `The business: ${context.business}`,
    "",
    evidence.length > 0 ? evidence.join("\n\n") : "(no evidence provided)",
    "",
    "Fill in these fields:",
    ...fields.map((x) => `- ${x.key} (${x.label}): ${x.prompt}`),
    "",
    answerGuidance(),
    "",
    "Also, for this stage:",
    ...PREFILL_RULES.map((r) => `- ${r}`),
    "",
    `Return ONLY JSON: {"values":{${fields.map((x) => `"${x.key}":"..."`).join(",")}}}`,
  ].join("\n");
}

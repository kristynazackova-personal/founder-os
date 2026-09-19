/**
 * What a filled-in answer has to be, whatever the question.
 *
 * These rules exist because of one observed failure, and they are written to
 * prevent exactly it. Asked "in one sentence, what does this product do", a
 * model fed a real business case answered:
 *
 *   "Selvenn takes a conversation you have with a digital coach, or an audio,
 *    video or text file you upload, and analyses it to surface patterns,
 *    emotions, blockers and progress signals, tracked as scores over time
 *    across two tracks: couples coaching and life coaching."
 *
 * Nothing in it is false. It is still the wrong answer, because it is an
 * inventory of capabilities where the question asks for an intent. Every
 * input format, both tracks and all four outputs are in there; what the
 * business is FOR is not.
 *
 * The cause generalises past that one field. Given a website or a business
 * case as evidence, a model's safest move is to summarise it faithfully, and
 * a question that specifies only a SHAPE ("one per line", "mechanism, not
 * benefit") gets that summary poured into the shape. The result is accurate,
 * complete and useless: it decides nothing, and every question in this
 * framework exists to make the founder decide something.
 *
 * So each field's own prompt now names the decision, and these rules cover
 * what no single field can say on its own.
 *
 * Pure strings. No DB, no env, no network.
 */

/** The answer that is wrong in the way that matters, kept as the worked example. */
export const FEATURE_LIST_EXAMPLE = {
  question: "In one sentence, what does this product do",
  bad:
    "Selvenn takes a conversation you have with a digital coach, or an audio, video or text file you upload, " +
    "and analyses it to surface patterns, emotions, blockers and progress signals, tracked as scores over " +
    "time across two tracks: couples coaching and life coaching.",
  whyBad:
    "Every capability is in there and the point is not: it lists what the product can do instead of saying " +
    "what it is for. The inputs, the tracks and the outputs are detail the founder already knows.",
  good: "Selvenn shows a person what is actually happening in their relationships, from conversations they already have.",
} as const;

export const ANSWER_RULES: string[] = [
  "Answer the question that was asked. The website and the business case are EVIDENCE about this business, not the answer - never summarise them back.",
  "One idea per answer. If you need 'and' twice, or you are listing input formats, product tracks, tiers, output types or audiences, you have written a feature list rather than an answer.",
  "Where the evidence supports several, name the PRIMARY one and drop the rest. A complete list is not a better answer; it is a refusal to choose, and choosing is what each of these questions is for.",
  "Say what it is FOR, not everything it can do. Capabilities are what the product is able to do; this framework asks what it is meant to change, for whom, and what the founder is deciding.",
  "Prefer the founder's own plain words over the marketing copy on the page. Marketing copy sells; these answers have to be usable by someone making a decision.",
  "One or two sentences. A long answer here is almost always a summary that has not been reduced to a point.",
  "Where the evidence does not say, write the question instead, starting with [to fill]. A flagged blank is useful; a plausible sentence the founder did not write is worse than nothing, because they will read it as a finding.",
];

/** The rules plus the worked example, for a prompt. */
export function answerGuidance(): string {
  return [
    "How to answer, whatever the field:",
    ...ANSWER_RULES.map((r) => `- ${r}`),
    "",
    "The failure to avoid, from a real run:",
    `  Question: ${FEATURE_LIST_EXAMPLE.question}`,
    `  Rejected: "${FEATURE_LIST_EXAMPLE.bad}"`,
    `  Why: ${FEATURE_LIST_EXAMPLE.whyBad}`,
    `  Better: "${FEATURE_LIST_EXAMPLE.good}"`,
  ].join("\n");
}

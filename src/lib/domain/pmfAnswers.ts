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
 * One constraint was removed rather than sharpened. The first field used to
 * ask for the answer "in one sentence", which this framework inherited from
 * the product-design interview it descends from. In an interview brevity is
 * the point: you are timed and the interviewer has to follow you live. A
 * founder at their desk is not timed, so the rule was grading the wrong
 * thing, and it was doing real damage on a business with two products -
 * squeezed into one sentence, the honest answer becomes an umbrella vague
 * enough to cover both, and every table below inherits the vagueness. What
 * the constraint was really for - forcing a choice - now lives in the prompt
 * and in the rules, where length is not the test and listing is.
 *
 * Pure strings. No DB, no env, no network.
 */

/**
 * Two real rejected answers to the same question, kept verbatim.
 *
 * They fail in opposite directions, which is why both are here. The first
 * described everything and decided nothing. The second decided, and then
 * narrated the deciding.
 */
export const FEATURE_LIST_EXAMPLE = {
  question: "What does this product do",
  bad:
    "Selvenn takes a conversation you have with a digital coach, or an audio, video or text file you upload, " +
    "and analyses it to surface patterns, emotions, blockers and progress signals, tracked as scores over " +
    "time across two tracks: couples coaching and life coaching.",
  whyBad:
    "Every capability is in there and the point is not: it lists what the product can do instead of saying " +
    "what it is for. The inputs, the tracks and the outputs are detail the founder already knows.",
  good:
    "Selvenn exists so that people can see what is actually happening in their closest relationships instead " +
    "of guessing. Couples record or upload the conversations they are already having, and get a shared picture " +
    "of the patterns they keep repeating and whether those patterns are improving.\n\n" +
    "[to fill] Life coaching is a second product here - a different person, on their own, for a different " +
    "reason. This framework is filled in for one product at a time, and this answer is written for couples " +
    "coaching. Is that the one you are building now?",
  whyGood:
    "It names who it is for, the problem it exists to solve and what the product is, which is the mission - " +
    "not a mechanism sketch and not an inventory. The second product is not merged into an umbrella wide " +
    "enough to cover both, and it is not dropped either; it is flagged with the marker this framework " +
    "already uses for a decision that is the founder's to make.",
} as const;

/**
 * The second failure, and the subtler one.
 *
 * This answer got the hard part right - it noticed two products where the
 * first run had flattened them. Then it wrote that noticing down. "The
 * evidence shows", "assuming", "if the answer is life coaching, this needs
 * rewriting": every one of those is a sentence about the process, addressed
 * to whoever is reading the output, sitting in a field whose value is pasted
 * into the founder's worksheet and shown back to them as their own document.
 *
 * It is worth its own example because no rule about CONTENT catches it. The
 * answer can be entirely right about the business and still be unusable,
 * because of who it is written to.
 */
export const META_VOICE_EXAMPLE = {
  question: "What outcome do you want for the user",
  bad:
    "Assuming couples is the answer above: a partner stops arguing about who said what and can see the pattern " +
    "the two of them keep repeating, so the next hard conversation starts from something they both recognise " +
    "rather than from blame. If the answer is life coaching, this needs rewriting, because getting unstuck " +
    "alone is a different change for a different day.",
  whyBad:
    "The observation is fine and the framing is not. \"Assuming\", \"the answer above\" and \"this needs " +
    "rewriting\" are talk about the worksheet rather than entries in it, and the founder reads this field as " +
    "their own writing. Commit to the answer; if something genuinely has to be decided first, that is what the " +
    "[to fill] marker is for.",
  good:
    "Couples stop relitigating who said what, because the pattern they keep repeating is visible to both of " +
    "them in the same place. That turns the recurring argument into something they can work on together, and " +
    "makes it possible to tell whether it is actually getting better over weeks rather than each of them " +
    "keeping a private tally.",
  whyGood:
    "It answers how the problem gets solved in general, so it holds for every couple rather than telling a " +
    "story about one of them on one day, and every trace of the machinery is gone.",
} as const;

export const ANSWER_RULES: string[] = [
  "Write the ANSWER, never your reasoning about it. What you return is pasted straight into the founder's own worksheet, so it has to read as something they wrote. Nothing about the evidence, the website, the business case or what you worked out from them; no 'assuming', no 'if the answer is X then this needs rewriting', no hedging about your own confidence, nothing addressed to a reader. Those words are about the machinery, and the machinery is not part of their document.",
  "Answer the question that was asked. The website and the business case are EVIDENCE about this business, not the answer - never summarise them back.",
  "One idea per answer. If you need 'and' twice, or you are listing input formats, product tracks, tiers, output types or audiences, you have written a feature list rather than an answer.",
  "Where the evidence supports several, name the PRIMARY one and drop the rest. A complete list is not a better answer; it is a refusal to choose, and choosing is what each of these questions is for.",
  "The exception, and it is the only one: where there are two genuinely SEPARATE products - different users, in a different situation, paying for a different reason - do not merge them into an umbrella and do not quietly drop one. Answer for the one that leads, then add a final line starting [to fill] that names the other and says this framework is filled in for one product at a time. The flag is how that question gets asked; never ask it inside the answer itself. Merging them corrupts every table below, because a segment list drawn across two products is not MECE.",
  "Say what it is FOR, not everything it can do. Capabilities are what the product is able to do; this framework asks what it is meant to change, for whom, and what the founder is deciding.",
  "Prefer the founder's own plain words over the marketing copy on the page. Marketing copy sells; these answers have to be usable by someone making a decision.",
  "Length is not the test; listing is. Two sentences naming one user, one change and one mechanism are a better answer than one sentence packing in three of each. Brevity is what an interview grades under time pressure - here nothing is timed, and the only thing being graded is whether a decision got made.",
  "Where the evidence does not say, write the question instead, starting with [to fill]. A flagged blank is useful; a plausible sentence the founder did not write is worse than nothing, because they will read it as a finding.",
];

/** The rules plus both worked examples, for a prompt. */
export function answerGuidance(): string {
  const worked = (e: { question: string; bad: string; whyBad: string; good: string; whyGood: string }) => [
    `  Question: ${e.question}`,
    `  Rejected: "${e.bad}"`,
    `  Why: ${e.whyBad}`,
    `  Better: "${e.good}"`,
    `  Why: ${e.whyGood}`,
  ];

  return [
    "How to answer, whatever the field:",
    ...ANSWER_RULES.map((r) => `- ${r}`),
    "",
    "Two failures to avoid, both from real runs. The first described everything and decided nothing:",
    ...worked(FEATURE_LIST_EXAMPLE),
    "",
    "The second decided, and then narrated the deciding:",
    ...worked(META_VOICE_EXAMPLE),
  ].join("\n");
}

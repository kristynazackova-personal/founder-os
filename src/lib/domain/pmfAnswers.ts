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
 * the product design interview it descends from. In an interview brevity is
 * the point: you are timed and the interviewer has to follow you live. A
 * founder at their desk is not timed, so the rule was grading the wrong
 * thing. What it was really for - forcing a choice - now lives in the prompt
 * and in the rules, where length is not the test and listing is.
 *
 * Every round since has been the same kind of problem and not the one it
 * looked like. The model knew the business each time. It wrote a catalogue,
 * then narrated its own reasoning into a field the founder reads as their own
 * writing, then split one product into two because two kinds of person use
 * it, then answered a question about vision at the altitude of a usage
 * report. None of those are knowledge failures, and none of them were fixed
 * by adding a rule alone: a rule about register reads as already satisfied by
 * the answer that breaks it. That is why the rejected answers are kept here
 * word for word, and why every one of them is TRUE about the business.
 *
 * Pure strings. No DB, no env, no network.
 */

/**
 * Real rejected answers, kept verbatim, grouped by the question that produced
 * them.
 *
 * Each round of this has been a REGISTER problem rather than a knowledge one:
 * the model knew the business every time, and wrote it at the wrong altitude,
 * in the wrong voice, or split the wrong way. Rules alone have not been enough
 * to fix that, because a rule about register reads as already satisfied by the
 * answer that violates it. The rejected text is what shows the distance.
 */
export type WorkedExample = {
  question: string;
  rejected: { answer: string; why: string }[];
  good: string;
  whyGood: string;
};

/** Stage 1, field 1: the mission. */
export const MISSION_EXAMPLE: WorkedExample = {
  question: "What does this product do",
  rejected: [
    {
      answer:
        "Selvenn takes a conversation you have with a digital coach, or an audio, video or text file you " +
        "upload, and analyses it to surface patterns, emotions, blockers and progress signals, tracked as " +
        "scores over time across two tracks: couples coaching and life coaching.",
      why:
        "Every capability is in there and the point is not: it lists what the product can do instead of " +
        "saying what it is for. The inputs, the tracks and the outputs are detail the founder already knows.",
    },
    {
      answer:
        "Selvenn exists so that couples can see what is actually happening between them instead of arguing " +
        "from memory. Partners talk to the coach or hand over the conversations they are already having, and " +
        "get a shared, research-grounded read of the patterns they keep repeating and whether those patterns " +
        "are shifting. [to fill] Life coaching is a second product here - one person, on their own, for a " +
        "different reason. This framework is filled in for one product at a time, and this answer is written " +
        "for couples coaching. Is that the one you are building now?",
      why:
        "Two audiences are not two businesses. One person alone and a couple together are two USES of the " +
        "same product, and the framework has an entire stage for splitting users up. Manufacturing a product " +
        "split at the mission turns a question about what the business is into an admin question about which " +
        "worksheet to open. It also describes one branch in full before mentioning the other, so the reader " +
        "never gets the whole picture.",
    },
  ],
  good:
    "Selvenn exists so that people can see what is actually happening in their closest relationships, instead " +
    "of arguing from memory or guessing. The conversations they are already having - with a partner, or with " +
    "the coach on their own - become a read of the patterns they keep repeating and whether those patterns " +
    "are shifting. Couples can work from the same picture together; one person can also use it alone.",
  whyGood:
    "It opens with the widest true statement, so the reader has the whole business before any branch, and the " +
    "two ways it gets used arrive last, subordinate to the one thing the product does - which is what they " +
    "are. Who to build for first is a real decision, but the framework makes it later, in the stage built " +
    "for it.",
};

/** Stage 1, field 2: the vision. */
export const VISION_EXAMPLE: WorkedExample = {
  question: "What outcome do you want for the user",
  rejected: [
    {
      answer:
        "Assuming couples is the answer above: a partner stops arguing about who said what and can see the " +
        "pattern the two of them keep repeating, so the next hard conversation starts from something they " +
        "both recognise rather than from blame. If the answer is life coaching, this needs rewriting, because " +
        "getting unstuck alone is a different change for a different day.",
      why:
        "The observation is fine and the framing is not. \"Assuming\", \"the answer above\" and \"this needs " +
        "rewriting\" are talk about the worksheet rather than entries in it, and the founder reads this field " +
        "as their own writing. Commit to the answer.",
    },
    {
      answer:
        "Couples stop relitigating who said what and start working on the pattern itself, because both of " +
        "them are looking at the same description of it rather than at each other. Over weeks they can tell " +
        "whether the thing they keep fighting about is actually improving, instead of each keeping a private " +
        "tally.",
      why:
        "The voice is right and the altitude is not. It describes the mechanics of a few weeks of use, where " +
        "the question asks what the product is ultimately FOR someone. A founder answers this one at the " +
        "level of a vision, not a usage report.",
    },
  ],
  good:
    "People stop being at the mercy of patterns they cannot see. Relationships mostly fail slowly and " +
    "privately, and the people inside them understand why long after it would have made a difference; " +
    "Selvenn is for making that visible early enough to act on.",
  whyGood:
    "It names the larger problem and the change the business is working toward, which is the altitude this " +
    "question asks for. It is still about THIS business and no other: it says exactly what goes wrong " +
    "(patterns stay invisible until it is too late), so it could not be pasted onto a competitor's page.",
};

export const WORKED_EXAMPLES: WorkedExample[] = [MISSION_EXAMPLE, VISION_EXAMPLE];

export const ANSWER_RULES: string[] = [
  "Write the ANSWER, never your reasoning about it. What you return is pasted straight into the founder's own worksheet, so it has to read as something they wrote. Nothing about the evidence, the website, the business case or what you worked out from them; no 'assuming', no 'if the answer is X then this needs rewriting', no hedging about your own confidence, nothing addressed to a reader. Those words are about the machinery, and the machinery is not part of their document.",
  "Answer the question that was asked. The website and the business case are EVIDENCE about this business, not the answer - never summarise them back.",
  "One idea per answer. If you need 'and' twice, or you are reeling off input formats, product tracks, tiers, output types or audiences as a catalogue, you have written a feature list rather than an answer. Naming who it is for is not a catalogue.",
  "Where the evidence supports several, name the PRIMARY one and drop the rest. A complete list is not a better answer; it is a refusal to choose, and choosing is what each of these questions is for.",
  "Assume ONE product. Two audiences, two use cases, two ways in - a person alone and a couple together, a free tier and a paid one - are one business being used differently, and the framework has a whole stage for splitting users up. Do not manufacture a product split here; it turns a question about what the business is into an admin question about which worksheet to open. Only where they are genuinely separate businesses - no shared core, bought separately, nothing lost by building one without the other - add a final line starting [to fill] naming the other and saying this framework is filled in for one at a time. Even then, decide whether it is worth raising at all. Two products is the rare case, not the careful one.",
  "Widest true statement first. Give the whole picture, then go deeper only if the answer needs it - never describe one branch in full and then the other, which leaves the reader assembling the business themselves.",
  "Say what it is FOR, not everything it can do. Capabilities are what the product is able to do; this framework asks what it is meant to change, for whom, and what the founder is deciding.",
  "Prefer the founder's own plain words over the marketing copy on the page. Marketing copy sells; these answers have to be usable by someone making a decision.",
  "Length is not the test; listing is. Two sentences naming one user, one change and one mechanism are a better answer than one sentence packing in three of each. Brevity is what an interview grades under time pressure - here nothing is timed, and the only thing being graded is whether a decision got made.",
  "Where the evidence does not say, write the question instead, starting with [to fill]. A flagged blank is useful; a plausible sentence the founder did not write is worse than nothing, because they will read it as a finding.",
];

/**
 * The rules alone.
 *
 * Split out for the calls whose output is not prose: deriving a table's
 * columns returns labels, anchors and a one-line reason, and the worked
 * examples below are two paragraph-length answers to two stage-1 questions.
 * The rules transfer to that call; a thousand words of example do not earn
 * their place in it.
 */
export function answerRulesBlock(): string {
  return ["How to answer, whatever the field:", ...ANSWER_RULES.map((r) => `- ${r}`)].join("\n");
}

/** The rules plus every worked example, for a prompt. */
export function answerGuidance(): string {
  const worked = (e: WorkedExample): string[] => [
    `  Question: ${e.question}`,
    ...e.rejected.flatMap((r) => [`  Rejected: "${r.answer}"`, `  Why: ${r.why}`]),
    `  Better: "${e.good}"`,
    `  Why: ${e.whyGood}`,
  ];

  return [
    answerRulesBlock(),
    "",
    "Real answers that were rejected, and what was accepted instead. Every rejected one was TRUE about the",
    "business and wrong anyway - read them for altitude and voice, not for facts:",
    ...WORKED_EXAMPLES.flatMap((e) => ["", ...worked(e)]),
  ].join("\n");
}

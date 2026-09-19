/**
 * The generation prompts for the build framework's tables.
 *
 * These are the operational form of `docs/research/pmf-build/*.md` - one
 * research file per stage, condensed into instructions a model can act on.
 * **Change the research first, then the prompt**, or the reasoning behind a
 * rule goes missing the moment someone edits it.
 *
 * Two jobs per table, in order:
 *
 *   1. COLUMNS - derive the parameters from the stages above (the goal, then
 *      the chosen segment, then the chosen pains). Her doc requires this:
 *      "feel free to add or remove the parameters I proposed to look at based
 *      on what you care about."
 *   2. ROWS - candidate rows the founder would recognise from their own
 *      answers, every cell a question rather than a claim, because the
 *      framework's first rule is that the ideas are theirs.
 *
 * Pure strings and pure functions. No DB, no env, no network.
 */
import { MAX_COLUMNS, MAX_ROWS, MIN_COLUMNS } from "./pmfTable";

export type TableStageKey = "segment" | "problem" | "solutions";

export type TablePromptSpec = {
  stage: TableStageKey;
  /** The field this table is stored under. */
  field: string;
  title: string;
  /** Which earlier answers the columns are derived from. */
  reads: string[];
  /** Her own columns, which survive unless a stated goal contradicts them. */
  defaults: string;
  /** Column candidates and the condition each one earns its place under. */
  candidates: string;
  /** What a row is, for this table. */
  rowShape: string;
  /**
   * The first column: the one that NAMES the row. Without it a table of scores
   * has nothing to score, and the model will happily return six parameters and
   * no way to tell one row from another.
   */
  rowLabel: { label: string; prompt: string };
  /** Traps specific to this table. */
  cautions: string[];
  /** Where the reasoning lives. */
  research: string;
};

/** Rules every generated table obeys. From docs/research/pmf-build/columns.md. */
export const COLUMN_RULES: string[] = [
  `Between ${MIN_COLUMNS} and ${MAX_COLUMNS} columns. Fewer than ${MIN_COLUMNS} and there is nothing to compare on; more than ${MAX_COLUMNS} and the table stops being filled in.`,
  "Her default columns survive unless a stated goal contradicts them. Dropping a column because it is hard to answer is not a reason; dropping pay-strength because the founder said they optimise for impact over revenue is.",
  "Every column carries its scale AND its anchors, written for this business. 'Severity 1-10' without anchors is two people scoring three points apart.",
  "A column must be answerable from what the founder can see this week. Anything needing data they do not have belongs in the assumptions block, not in a column that will sit empty.",
  "Say in one line why each column is here rather than one of the alternatives.",
];

/** Rules every generated ROW obeys. The first rule of the framework, restated for tables. */
export const ROW_RULES: string[] = [
  "A row is a prompt with its cells filled in as QUESTIONS, never a claim about a market you have not seen.",
  "Name candidates the founder would recognise from their own earlier answers. Do not invent a segment, a pain or a solution they have never mentioned.",
  "Where a cell needs a judgement only they can make, write the question for that cell, starting with [to fill].",
  `At most ${MAX_ROWS} rows, and fewer is better. Three well-shaped rows beat ten generic ones.`,
  "A row names ONE thing. A row that lists several formats, tracks, tiers or audiences at once is a feature list wearing a row's clothing, and it cannot be compared against the rows beside it.",
];

export const TABLE_PROMPTS: Record<TableStageKey, TablePromptSpec> = {
  segment: {
    stage: "segment",
    field: "segment_list",
    title: "Target user: every possible user or use case, MECE",
    reads: ["Stage 1: what the product does, the outcome for the user, what the FOUNDER wants out of it, the six-month picture"],
    defaults: "Size of market (S/M/L), pay-strength or willingness to pay (L/M/H), already solved elsewhere (Y/N).",
    candidates: [
      "Size of market (S/M/L) - always.",
      "Pay-strength (L/M/H) - when the goal mentions revenue, sustainability or a price. Drop it when the stated goal is impact-only; that is her own example.",
      "Urgency of the pain (L/M/H) - almost always. It predicts early traction better than size does, and it is the beachhead criterion: the segment that is desperate, not the segment that is biggest.",
      "Already solved elsewhere (Y/N) - always. Ask whether it is solved WELL, or solved badly by someone with distribution.",
      "Reachability (L/M/H) - whenever the founder has no existing audience there. A segment that scores well and cannot be reached still cannot be sold to.",
      "Early-adopter tendency (L/M/H) - consumer or developer products, and new categories, where people who adopt early are their own group rather than a trait of another one.",
      "Can you talk to one this week (Y/N) - when the six-month picture depends on learning fast.",
    ].join("\n"),
    rowShape: "One row per user or use-case GROUP, mutually exclusive and collectively exhaustive: each case falls in exactly one group.",
    rowLabel: { label: "User or use case", prompt: "Who they are, in the founder's own words." },
    cautions: [
      "Do not size a consumer segment you have no data for. S/M/L is a judgement - ask for it, never assert it.",
      "Early adopters of a new category are usually their own row, not a qualifier on someone else's.",
      "Add to the assumptions field the instruction to talk to 15 to 20 people in the top candidate segment before committing to it.",
    ],
    research: "docs/research/pmf-build/segment.md",
  },
  problem: {
    stage: "problem",
    field: "pains",
    title: "Problem: pain points along the current journey, scored",
    reads: ["Stage 1: the goal", "Stage 2: the chosen segment and how it scored", "Stage 3a: the user's current journey, if it is written"],
    defaults: "Where in the journey, number of users who have it (S/M/L), severity (1-10), competition already solving it (Y/N).",
    candidates: [
      "Where in the journey (text) - always. It ties the pain to a step above it rather than floating free.",
      "How many have it (S/M/L) - always.",
      "Severity (1-10, WITH anchors written for this product) - always.",
      "Frequency (daily / weekly / monthly / rarely) - almost always. Severity alone ranks badly: a severe but rare problem can sit below a moderate but near-universal one, and frequency reorders the list more than any other column.",
      "What it costs them today, in time, money or frustration (text) - when the goal is revenue, or when pricing is open. A pain that cannot be stated in one of those three units is not scoreable.",
      "Evidence (text) - when any row is a guess. It keeps a scored table from looking researched when half of it is assumption.",
    ].join("\n"),
    rowShape:
      "One row per pain, anchored to the step of the journey where it happens. The journey is how the person reaches the outcome TODAY, without this product in it - what they use now, in tiny steps.",
    rowLabel: { label: "Pain point", prompt: "The pain in one line, as the user would say it." },
    cautions: [
      "The journey comes first and in the user's own voice. Her warning: watch for a bigger pain hiding somewhere else in the journey than the one you assumed.",
      "Never anchor a pain to a step inside this product's own interface (\"when they open the app\", \"when they hit the free tier limit\"). That is usability feedback on something that may not need to exist, and a pain outside the product is invisible to a journey drawn inside it.",
      "Write severity anchors for THIS product rather than reusing a generic ladder.",
      "High frequency plus high intensity is the pair worth looking for, not the single highest severity score.",
      "Willingness to pay is evidenced, not asked: what do they use today, and what does it cost them.",
    ],
    research: "docs/research/pmf-build/problem.md",
  },
  solutions: {
    stage: "solutions",
    field: "solution_options",
    title: "Solutions: ideas against the chosen pains, scored",
    reads: ["Stage 1: the goal", "Stage 2: the chosen segment", "Stage 3: the pains chosen to solve first"],
    defaults: "Solution idea, how well it solves the pain (L/M/H), how hard to build (L/M/H).",
    candidates: [
      "Solution idea (text) - always.",
      "Which pain it solves (reference to a stage 3 row) - always. A solution not tied to a scored pain is how scope creeps back in.",
      "How well it solves it (L/M/H) - always.",
      "How hard to build (L/M/H) - always.",
      "Confidence (L/M/H) - always. It is the cheapest honesty column there is, and the only one that records how much the row is worth trusting.",
      "Reach (number or S/M/L) - ONLY if stage 2 produced a real size estimate. Otherwise it is a guess dressed as a number.",
      "Time to first version (days / weeks / months) - when the six-month picture is aggressive.",
    ].join("\n"),
    rowShape: "One row per candidate solution, each naming the pain it addresses.",
    rowLabel: { label: "Solution idea", prompt: "The idea in one line." },
    cautions: [
      "This is value against effort, which is the right tool at this size. Do NOT reach for RICE: it needs a reach number and an effort estimate in person-months, and a founder who has not run the interviews has neither, so the score would be built on two guesses.",
      "Do not fill the 'what v1 is NOT' field with anything but a prompt. It is the only part of the stage that limits scope rather than ordering it, and it has to be the founder's own refusal.",
    ],
    research: "docs/research/pmf-build/solutions.md",
  },
};

const bullets = (lines: string[]): string => lines.map((l) => `- ${l}`).join("\n");

/**
 * The prompt that derives a table's COLUMNS from the answers above it.
 * `answers` is the already-filled context, rendered by the caller.
 */
export function columnPrompt(spec: TablePromptSpec, context: { business: string; answers: string }): string {
  return [
    `You are choosing the PARAMETERS for one table in a product framework worksheet: "${spec.title}".`,
    "",
    `The business: ${context.business}`,
    "",
    "What the founder has already answered above this table:",
    context.answers || "(nothing yet)",
    "",
    `This table's columns are derived from: ${spec.reads.join("; ")}.`,
    "",
    `The framework author's own default columns: ${spec.defaults}`,
    "She explicitly invites changing them: \"feel free to add or remove the parameters I proposed to look at based on what you care about. E.g., do you not care about profit? Then don't look at the willingness to pay or pay strength.\"",
    "",
    "Candidate columns, and when each earns its place:",
    spec.candidates,
    "",
    `The FIRST column is always \`${spec.rowLabel.label}\`, kind text: ${spec.rowLabel.prompt} It is what names the row, and every other column scores it.`,
    "",
    "Rules:",
    bullets(COLUMN_RULES),
    "",
    "Watch for:",
    bullets(spec.cautions),
    "",
    'Return ONLY JSON: {"columns":[{"key":"snake_case","label":"…","kind":"text"|"choice"|"scale","options":["S","M","L"],"min":1,"max":10,"anchors":"what the ends mean for THIS product","why":"why this column and not another"}]}',
    "`options` only for kind choice; `min`/`max` only for kind scale. Never use an em dash; use a hyphen.",
  ].join("\n");
}

/** The prompt that drafts ROWS once the columns exist. */
export function rowPrompt(spec: TablePromptSpec, context: { business: string; answers: string; columns: string }): string {
  return [
    `You are drafting candidate rows for "${spec.title}" in a product framework worksheet.`,
    "",
    `The business: ${context.business}`,
    "",
    "What the founder has already answered above this table:",
    context.answers || "(nothing yet)",
    "",
    "The columns of this table, which are fixed for this request:",
    context.columns,
    "",
    `A row is: ${spec.rowShape}`,
    "",
    "The framework's first rule, which this table does not suspend:",
    '"The ideas should be yours. I\'m deliberately not handing you solutions - you won\'t love a product you didn\'t come up with."',
    "",
    "Rules:",
    bullets(ROW_RULES),
    "",
    "How a cell is written, by column kind:",
    bullets([
      "text - a sentence, or a `[to fill]` question where the answer is the founder's to make.",
      "choice - EXACTLY one of that column's listed options, or an empty string. Nothing else is readable, so a question here is lost rather than asked.",
      "scale - a number inside that column's range, or an empty string.",
    ]),
    "",
    "Watch for:",
    bullets(spec.cautions),
    "",
    'Return ONLY JSON: {"rows":[{"cells":{"<column key>":"<value or a [to fill] question>"}}]}',
    "Never use an em dash; use a hyphen.",
  ].join("\n");
}

export const promptFor = (stage: TableStageKey): TablePromptSpec => TABLE_PROMPTS[stage];

/** Which field on the build framework holds a table. */
export const TABLE_FIELDS: Record<string, TableStageKey> = {
  segment_list: "segment",
  pains: "problem",
  solution_options: "solutions",
};

export const tableStageForField = (field: string): TableStageKey | null => TABLE_FIELDS[field] ?? null;

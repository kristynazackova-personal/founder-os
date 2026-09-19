/**
 * The product frameworks the tool can hold, and the shape they share.
 *
 * There are two, and they are for different moments:
 *
 *  - `conversation` - the PMF framework from Kristyna's mentoring sessions
 *    (domain/pmf.ts). For a business that already has customers: find out
 *    whether losing it would hurt them, by talking to the ones you have.
 *
 *  - `build` - her written "Product Framework" doc. For something being built
 *    or scoped: goal, one segment, the journey and its pains, solutions,
 *    metrics, jobs to be done, platform, the LLM prompt, then a gate before
 *    building more.
 *
 * Each framework declares how much the tool is allowed to write, because they
 * disagree about it. The conversation framework wants a filled worksheet. The
 * build framework says in its own words: "The ideas should be yours. I'm
 * deliberately not handing you solutions - you won't love a product you
 * didn't come up with." So `aiRole` is per framework, and for `build` the
 * tool structures and pressure-tests rather than answering.
 *
 * Pure. No DB, no env, no network.
 */
import { PMF_SOURCE, PMF_STEPS, type Quote } from "./pmf";

export const PMF_FRAMEWORK_IDS = ["conversation", "build"] as const;
export type PmfFrameworkId = (typeof PMF_FRAMEWORK_IDS)[number];

export type PmfStage = {
  key: string;
  n: number;
  title: string;
  /** One line: what this stage decides. */
  purpose: string;
  body: string[];
  quotes: Quote[];
  actions: string[];
};

export type PmfFieldDef = {
  key: string;
  stage: string;
  label: string;
  /** What a good answer contains. Shown under the field and sent to the model. */
  prompt: string;
  long?: boolean;
  /**
   * A table field: several rows, each scored against columns the tool derives
   * from the stages above it (domain/pmfTable.ts, domain/pmfPrompts.ts). Her
   * doc gives three stages a table and invites changing their parameters, so
   * the columns are generated per business rather than fixed here.
   */
  table?: boolean;
};

export type PmfFramework = {
  id: PmfFrameworkId;
  /** Short label for the switcher. */
  label: string;
  title: string;
  tagline: string;
  /** Her framing, in her words, before the stages. */
  intro: string[];
  /** The rules she states about using it. */
  rules: string[];
  stages: PmfStage[];
  fields: PmfFieldDef[];
  source: string;
  /**
   * `fill` - the tool may draft answers from what it knows.
   * `pressure_test` - the answers are the founder's; the tool may only
   *   structure the questions and challenge what is already there.
   */
  aiRole: "fill" | "pressure_test";
  /**
   * Start the stages collapsed. A nine-stage framework is otherwise about
   * eleven thousand pixels of page on a phone, which is not a worksheet, it
   * is a scroll. The stage you are on stays open.
   */
  collapseStages: boolean;
};

// ------------------------------------------------- 1. the conversation framework

const CONVERSATION_FIELDS: PmfFieldDef[] = [
  { key: "hurt_sentence", stage: "bar", label: "What breaks the day they stop paying", prompt: "One sentence, concrete. Not a benefit - the thing that stops working for them." },
  { key: "mechanism", stage: "bar", label: "Cost or revenue", prompt: "Which of the two mechanisms this is, and roughly how much. If it is neither, say so plainly." },
  { key: "who_uses", stage: "qualitative", label: "Who actually uses it", prompt: "The role inside the customer, and what they open it to do." },
  { key: "who_decides", stage: "qualitative", label: "Who decided to buy", prompt: "The person who signs off, which is often not the user, and what they are measured on." },
  { key: "interview_plan", stage: "qualitative", label: "Who to talk to first", prompt: "Named customers or segments, in order, with which of the two conversations each one is for.", long: true },
  { key: "candidates", stage: "quantitative", label: "Candidate solutions", prompt: "At most three, each one a thing you could build or sharpen. Fewer is better.", long: true },
  { key: "competitors", stage: "quantitative", label: "Competitors and the gap", prompt: "Who else solves this, and the specific gap you would be filling.", long: true },
  { key: "revenue_estimate", stage: "quantitative", label: "Revenue per candidate", prompt: "A rough number per candidate that you could defend out loud." },
  { key: "burning", stage: "prioritise", label: "Burning", prompt: "What breaks if you do not do it, ordered by how fast and how widely it breaks.", long: true },
  { key: "not_burning", stage: "prioritise", label: "Not burning", prompt: "Everything else, ordered by cost saved or revenue added. Nothing else gets a vote.", long: true },
  { key: "revenue_driver", stage: "kpis", label: "The one revenue driver", prompt: "The single metric that moves revenue for this business." },
  { key: "quarterly_goal", stage: "kpis", label: "Quarterly goal", prompt: "One number above the driver, checked roughly every three months." },
  { key: "launch_metrics", stage: "kpis", label: "Per-launch numbers", prompt: "What to read when a feature ships, and in the dashboard day to day." },
  { key: "measurement_hygiene", stage: "kpis", label: "Measurement hygiene", prompt: "Whether test traffic is separated from real traffic, and what to fix if not." },
];

const CONVERSATION: PmfFramework = {
  id: "conversation",
  label: "The PMF conversation",
  title: "Product market fit: would it hurt them to lose it?",
  tagline: "For a business with customers. Find out what they would miss, by asking the ones you already have.",
  intro: [
    "Product-market fit is not a score here, it is a test: would a client be hurt by losing what you sell. The stages are sequential, and the failure they exist to prevent is doing the research before the conversations.",
  ],
  rules: [
    "Start with what you get for free: the clients you already have.",
    "Users and decision-makers are different conversations.",
    "Open questions only, and never lead the person to an answer.",
  ],
  stages: PMF_STEPS.map((s) => ({ key: s.key, n: s.n, title: s.title, purpose: s.purpose, body: s.body, quotes: s.quotes, actions: s.actions })),
  fields: CONVERSATION_FIELDS,
  source: PMF_SOURCE,
  aiRole: "fill",
  collapseStages: false,
};

// ------------------------------------------------------- 2. the build framework

const BUILD_STAGES: PmfStage[] = [
  {
    key: "goal",
    n: 1,
    title: "The goal (north star)",
    purpose: "Say what this is and what it is for, in one sentence each.",
    body: [
      "One sentence on what the product does, in the shape of the thing itself rather than the category. Then what the user gets out of it, what you want out of it, and what success six months out would actually look like.",
    ],
    quotes: [{ text: "Fill it top to bottom; each stage feeds the next. If a box stalls you, write a guess and keep moving." }],
    actions: ["Write the one-sentence description before anything else.", "Say what YOU want out of it, not only what the user gets. They are different answers."],
  },
  {
    key: "segment",
    n: 2,
    title: "Target user: pick ONE segment",
    purpose: "Narrow hard now, widen later.",
    body: [
      "List every possible user or use case MECE - mutually exclusive, collectively exhaustive, so each case falls in exactly one group. Score each on market size, pay-strength, and whether it is already solved elsewhere.",
      "Then choose one, and write down why. If you optimise for impact over revenue, weight pay-strength less - but do not ignore it, because the thing still has to sustain itself.",
      "Separately, list the assumptions you are making about these users that you have not verified. Do not assume, verify.",
    ],
    quotes: [{ text: "You can't speak to everyone and build everything now. Narrow hard now; widen later." }],
    actions: ["Write the MECE list before choosing, not after.", "Name the assumptions you would be embarrassed to be wrong about."],
  },
  {
    key: "problem",
    n: 3,
    title: "Define the problem: journey then pains",
    purpose: "Get a crisp problem, because without one you design badly.",
    body: [
      "Write the user's CURRENT journey in tiny steps, as it happens today without you. Then mark the pain points along it and score each on how many users have it, severity out of ten, and whether competition already solves it.",
      "Pick the one to three pains you will solve first. Watch for a bigger pain hiding somewhere else in the journey than the one you assumed.",
    ],
    quotes: [{ text: "Without a crisp problem, you'll design badly AND give the LLM bad instructions." }],
    actions: ["Write the journey in the user's voice, step by step.", "Score every pain before picking, so the pick is visible."],
  },
  {
    key: "solutions",
    n: 4,
    title: "Solutions, and what v1 is not",
    purpose: "Choose one to three solutions, and write down the scope you are refusing.",
    body: [
      "Brainstorm solutions for the pains you chose, at a high level, then score each on how well it solves the pain and how hard it is to build. Choose one to three and say why.",
      "Then the guardrail that keeps v1 shippable: three things v1 is explicitly NOT.",
    ],
    quotes: [{ text: "The ideas should be yours. I'm deliberately not handing you solutions - you won't love a product you didn't come up with." }],
    actions: ["Score before choosing.", "Write the three 'not' lines. They are the only thing that keeps v1 small."],
  },
  {
    key: "metrics",
    n: 5,
    title: "Impact goal and metrics",
    purpose: "Set a goal you can actually track, so you know if this worked.",
    body: [
      "The north-star goal is the real impact, not a proxy. Under it, the top metric for it, then retention at week one, month one and ninety days, and whatever early signals you will actually see first - signups, thumbs up, thank-yous.",
    ],
    quotes: [{ text: "This keeps you from building nonsense on the side. Set a goal you can track." }],
    actions: ["Define retention at all three horizons now, while it is cheap.", "Name the early signal you will see before retention data exists."],
  },
  {
    key: "jtbd",
    n: 6,
    title: "Requirements: jobs to be done",
    purpose: "Turn the goal into 'the user must be able to…' lines.",
    body: [
      "For the goal to happen, the user must be able to do certain things. List them. They drive both the design and the back end, and they are what you hand an LLM.",
      "Name the specific user rather than 'the user', because the specific one points you somewhere: \"As an ADHD-impacted adult, I want to be reminded to pay attention regularly, so that I don't lose focus.\"",
    ],
    quotes: [{ text: "Usually, you say instead of \"user\" the specific user, so it is more clear and drives you (and eventually the LLM) in the right direction." }],
    actions: ["Write each line as 'As a <specific user>, I want to <do>, so that <outcome>'.", "Note what each one implies for the build. 'Stay engaged through the whole video' implies gamification."],
  },
  {
    key: "platform",
    n: 7,
    title: "Platform and design guidelines",
    purpose: "Decide where it lives, and what you care about in how it feels.",
    body: [
      "Which platform first, and pick one. Web, extension or mobile - researched on how many people would use each against how long each takes to build. And whether one of them is an acquisition wedge that funnels into the real home.",
      "You do not need to design pixels, but hand over the things you do care about: delight and gamification, the core interaction, the boring-but-required parts like auth and hierarchy, and the accessibility must-haves for your specific user.",
    ],
    quotes: [{ text: "You don't need to design pixels (vibe-code with the LLM's default UI), but give it the things you care about." }],
    actions: ["Pick one platform to be first, with the reason.", "Write the must-haves for your specific user: one primary action per screen, visible progress, low-friction start, forgiving resume."],
  },
  {
    key: "engine",
    n: 8,
    title: "The LLM prompt: your product's engine",
    purpose: "Write the prompt that does the work, then test it on something real.",
    body: [
      "If the intelligence is the product, the prompt is the product. Fill the slots - the role the AI plays, the audience and their needs, what triggers it, what it produces, the tone - then assemble it and test it on a real input.",
      "Keep a test log: which input, whether the output genuinely helped, and the fix to the prompt. A prompt that was never tested on a real input is a guess.",
    ],
    quotes: [{ text: "Fill the variables, assemble, then test on a real transcript." }],
    actions: ["Write the role, audience, trigger, output and tone as separate slots.", "Include the rule that it must use only what is in the input and invent nothing.", "Log every test and the fix it produced."],
  },
  {
    key: "validate",
    n: 9,
    title: "Validate before building more",
    purpose: "A gate, not a suggestion: all yes or go back.",
    body: [
      "Cheap research first - surveys in the groups your segment is already in, relevant threads, anyone you can reach in person. Ship early: competition validates demand, people copy more slowly than you fear, and you can always build it better.",
      "Then the gate. Did real users in your segment confirm the top pain. Did the output genuinely make the thing easier. Is v1 scoped to one segment, one to three pains, one platform. Are the metrics, especially retention, defined and trackable.",
    ],
    quotes: [{ text: "All Yes → build the smallest version. Any No → go back to that stage." }],
    actions: ["Do the cheap research before the expensive build.", "Answer all four gate questions honestly. One 'no' sends you back to that stage."],
  },
];

const BUILD_FIELDS: PmfFieldDef[] = [
  { key: "one_sentence", stage: "goal", label: "What does this product do", prompt: "The mission: who it is for, the problem it exists to solve, and what the product is. Name the problem, not the feature list - two or three sentences, in your own words rather than the words on your homepage." },
  { key: "user_outcome", stage: "goal", label: "What outcome do you want for the user", prompt: "The vision: what ultimately changes for them, and the problem that change answers. Pitched high is right here, but if you could paste it onto a competitor's site it is too vague - and it is not the mechanics of a few weeks of use." },
  { key: "your_outcome", stage: "goal", label: "What do YOU want out of it", prompt: "Revenue, usefulness, thank-yous, a job, a portfolio piece. Be honest, it changes every later decision." },
  { key: "six_months", stage: "goal", label: "Success in six months looks like", prompt: "One concrete picture you could turn out to be wrong about, not a range." },
  { key: "segment_list", stage: "segment", label: "Every possible user or use case (MECE)", prompt: "One row per group, mutually exclusive and collectively exhaustive - split by the situation they are in, not by demographics. The columns are chosen from your stage 1 answers.", table: true },
  { key: "chosen_segment", stage: "segment", label: "Chosen segment, and why", prompt: "One group, and why it beat the others you just listed. Most urgent and most reachable usually beats biggest." },
  { key: "assumptions", stage: "segment", label: "Open assumptions to test", prompt: "What you are assuming about these users that you have not verified, each phrased so it could turn out false. One per line.", long: true },
  { key: "journey", stage: "problem", label: "The user's current journey, in tiny steps", prompt: "What they do today without you, step by step, in their voice. If a step names your product, it is not their current journey.", long: true },
  { key: "pains", stage: "problem", label: "Pain points, scored", prompt: "One row per pain, anchored to a step of the journey. The columns are chosen from your goal and your chosen segment.", table: true },
  { key: "chosen_pains", stage: "problem", label: "The 1 to 3 pains you will solve first", prompt: "Which ones, and what made them win. Frequency and intensity together, not the single highest score." },
  { key: "solution_options", stage: "solutions", label: "Solution ideas, scored", prompt: "One row per candidate, each naming the pain it solves. The columns are chosen from your goal, segment and chosen pains.", table: true },
  { key: "chosen_solutions", stage: "solutions", label: "Chosen 1 to 3 solutions, and why", prompt: "The ones you will build, and the reason. A first version exists to test whether the pain is real, not to show what you can build." },
  { key: "not_v1", stage: "solutions", label: "What v1 is NOT", prompt: "Three things you are explicitly refusing to build yet - things you actually wanted to. A refusal that costs nothing is not one.", long: true },
  { key: "north_star_goal", stage: "metrics", label: "North-star goal (the real impact)", prompt: "The change in the user's life you would be proud of, not a number that stands in for it." },
  { key: "top_metric", stage: "metrics", label: "Top metric for it", prompt: "The one number closest to that impact that you could count this month." },
  { key: "retention_targets", stage: "metrics", label: "Retention: week 1, month 1, 90 days", prompt: "What share of users you expect back at each horizon, and the number at each that would worry you." },
  { key: "early_signals", stage: "metrics", label: "Other early signals", prompt: "What you will see before retention data exists. If it would look the same whether or not the product worked, it is not a signal." },
  { key: "jobs", stage: "jtbd", label: "The user must be able to…", prompt: "One per line: 'As a <specific user>, I want to <do>, so that <outcome>'. A job they have with or without you, not a feature.", long: true },
  { key: "jobs_implications", stage: "jtbd", label: "What each job implies for the build", prompt: "What each line obliges you to build - storage, a schedule, a permission, an edge case. Not a restatement of the job.", long: true },
  { key: "platform_first", stage: "platform", label: "Which platform first, and why", prompt: "One platform, and why: reach against how long it takes you to build. Two platforms in v1 means both are late." },
  { key: "wedge", stage: "platform", label: "Acquisition wedge vs main home", prompt: "Whether a lighter surface exists to earn trust and funnel into the richer one. 'No wedge, one surface' is a real answer." },
  { key: "design_guidelines", stage: "platform", label: "Design guidelines to hand over", prompt: "The core interaction, the auth and hierarchy decisions, and the two or three must-haves particular to YOUR user. Anything true of every product tells the builder nothing.", long: true },
  { key: "prompt_slots", stage: "engine", label: "Prompt slots", prompt: "Role the AI plays, audience and their needs, what triggers it, what it produces, tone. Each a line, not a paragraph.", long: true },
  { key: "prompt_draft", stage: "engine", label: "The assembled prompt", prompt: "Role, context, task, rules, input. Include 'use only what is in the input and invent nothing'.", long: true },
  { key: "prompt_tests", stage: "engine", label: "Test log", prompt: "One per line: the real input you tested, whether the output genuinely helped, the fix it produced.", long: true },
  { key: "research_plan", stage: "validate", label: "Cheap research you will actually do", prompt: "Named groups, threads and people you can reach this week. 'Run a survey' is a way of not talking to anyone." },
  { key: "gate", stage: "validate", label: "The decision gate", prompt: "Four answers, each yes or no: top pain confirmed by real users; output genuinely helped; v1 scoped to one segment, 1-3 pains and one platform; metrics defined and trackable. Any single no is a no.", long: true },
];

const BUILD: PmfFramework = {
  id: "build",
  label: "The product framework",
  title: "Product framework: build what people will use",
  tagline: "For something being built or scoped. Goal, one segment, the journey and its pains, solutions, metrics, jobs, platform, the engine, then a gate.",
  intro: [
    "This isn't a rigid formula - it's the direction in which I think through every product and every feature I build, at work or while building my business. It works, and it will help you build what matters to you and other people, and it will help you avoid losing time on something no one will use.",
    "Fill it top to bottom; each stage feeds the next. If a box stalls you, write a guess and keep moving.",
    "This framework shouldn't be rigid. Look at the concept, and feel free to add or remove the parameters I proposed based on what you care about. Do you not care about profit? Then don't look at willingness to pay, and just look at how many people are in that market.",
  ],
  rules: [
    "The ideas should be yours. I'm deliberately not handing you solutions - you won't love a product you didn't come up with. This doc is here to pull your best thinking out.",
    "Use your AI as you go. Paste any stage into an LLM to connect the dots or pressure-test an answer - just make the decisions yourself.",
  ],
  stages: BUILD_STAGES,
  fields: BUILD_FIELDS,
  source: "Her written Product Framework doc, June 2026. Quotes are verbatim.",
  aiRole: "pressure_test",
  collapseStages: true,
};

// ------------------------------------------------------------------ registry

export const PMF_FRAMEWORKS: Record<PmfFrameworkId, PmfFramework> = { conversation: CONVERSATION, build: BUILD };

export const DEFAULT_FRAMEWORK: PmfFrameworkId = "conversation";

export const asFrameworkId = (v: unknown): PmfFrameworkId =>
  (PMF_FRAMEWORK_IDS as readonly string[]).includes(String(v)) ? (v as PmfFrameworkId) : DEFAULT_FRAMEWORK;

export const frameworkOf = (id: unknown): PmfFramework => PMF_FRAMEWORKS[asFrameworkId(id)];

export const fieldsOfStage = (f: PmfFramework, stage: string): PmfFieldDef[] => f.fields.filter((x) => x.stage === stage);

export const stageOfField = (f: PmfFramework, key: string): PmfStage | undefined => {
  const field = f.fields.find((x) => x.key === key);
  return field ? f.stages.find((s) => s.key === field.stage) : undefined;
};

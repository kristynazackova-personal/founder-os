/**
 * The product-market-fit framework, as Kristyna teaches it.
 *
 * Ported from her external-memory repo (my-personality:
 * raw/mentoring/matium-guillen/2026-09-05.md) - a recorded mentoring session
 * where she takes a founder with three clients through the whole thing. Her
 * words are quoted, not paraphrased: the phrasing is the framework.
 *
 * Pure data and pure functions. No DB, no env, no network.
 *
 * The shape of it:
 *   1. The bar    - would it hurt them to lose it?
 *   2. Qualitative - learn from the clients you already have, without leading them.
 *   3. Quantitative - market and competitive research, revenue per feature.
 *   4. Prioritise  - is the house going to burn?
 *   5. KPIs        - one revenue driver, then the small goals that chain to it.
 */

export type Quote = { text: string; note?: string };

export type PmfStepKey = "bar" | "qualitative" | "quantitative" | "prioritise" | "kpis";

export type PmfStep = {
  key: PmfStepKey;
  /** Ordinal shown in the UI. */
  n: number;
  title: string;
  /** One line: what this step decides. */
  purpose: string;
  body: string[];
  quotes: Quote[];
  /** Concrete things to do, in her order. */
  actions: string[];
};

export const PMF_STEPS: PmfStep[] = [
  {
    key: "bar",
    n: 1,
    title: "The bar: would it hurt them to lose it?",
    purpose: "Decide whether what you sell is essential or merely nice.",
    body: [
      "Product-market fit is not a score. It is a test of whether a client would be hurt by losing what you sell. If they would not be hurt, they can solve the problem some other way - internally or with someone else - and the product is not good enough yet.",
      "There are only two ways to hurt them by leaving: you were cutting a lot of their cost, or you were bringing them a lot of revenue. Both sides of the coin are yours to work out - which of your features does that, and which market cares.",
    ],
    quotes: [
      {
        text: "You just need to make sure that you're offering something that if that client tries it or learns about it and feels like: if I don't get this, it's gonna hurt me. That's what you want to offer. If it's not gonna hurt them, it's not a good enough product, because that means that they can solve that problem in a different way internally or externally.",
      },
      {
        text: "Either that you're cutting their cost a lot, or that you're bringing them very high revenue.",
        note: "The only two mechanisms. Everything below is finding out which one you are, and for whom.",
      },
    ],
    actions: [
      "Write down, in one sentence, what breaks for a client the day they stop paying you.",
      "Name whether that sentence is about their cost or their revenue. If it is neither, you do not have the bar yet.",
    ],
  },
  {
    key: "qualitative",
    n: 2,
    title: "Qualitative first: learn from the clients you already have",
    purpose: "Understand who uses it, why, and what their company is measured on.",
    body: [
      "Start with the clients you already have, because they cost nothing to learn from. Talk to two kinds of person separately: the people actually using the product, and the people who decided to buy it. They answer different questions and they are often not the same person.",
      "With a user, the goal is their day rather than your product: what they opened, why they opened it, what they clicked, what frustrates them inside the app and outside it. Watch them do it - ask them to share their screen - rather than taking their description of it.",
      "With a decision-maker, the goal is the company: why they bought, what their KPIs are, where they think you could help. Then make sure what you sell supports those KPIs, so that removing you costs them something they are measured on.",
      "The technique matters as much as the questions. Open questions only, never yes-or-no, and never lead them to the answer you want. Read how the person answers and adjust - two people in the same job role can have completely different understandings of the technology and of what you are asking.",
    ],
    quotes: [
      {
        text: "First, always start with what you get for free. So with your current clients, I would prioritize talking to the people that are actually using the product and people that are making decisions.",
        note: "Her argument against buying feedback - with ads or a free trial - before you have exhausted the feedback you already own.",
      },
      {
        text: "We need to really learn from them without leading them to any kind of answers.",
      },
      {
        text: "You want to kind of slide into that and make sure that you support their KPIs, and then you provide something that is gonna hurt them if you take it away.",
      },
      {
        text: "Actually watch them. Ask them to share their screen and watch them how they're working with it and tell you what they're thinking.",
      },
      {
        text: "Even if they hold the same position, everyone has a different understanding of tech, everyone has different communication skills, everyone has different understanding of what exactly you're asking for. So you also need to get a little bit on the same wave and watch them how they're answering and change your questions.",
      },
    ],
    actions: [
      "List every client you already have and who inside them uses the product.",
      "Book an hour with a user and a separate conversation with whoever decided to buy.",
      "Ask for a screen share and watch them work before you ask them anything about features.",
      "Write the answers down as they said them, not as a summary of what you hoped to hear.",
    ],
  },
  {
    key: "quantitative",
    n: 3,
    title: "Then quantitative: market, competitors, money per feature",
    purpose: "Turn what you heard into a few candidate solutions with numbers attached.",
    body: [
      "Only once the qualitative work says how you help does the research make sense. Pick the few solutions worth focusing on, then do the market and competitive research: who else is in this, and which gaps you can fill.",
      "The output is an estimate of how much money each of those features can make. That estimate is what makes the next step - prioritisation - possible at all.",
    ],
    quotes: [
      {
        text: "Once we have this qualitative data and we understand how you can help in the market, then we're gonna go and do the quantitative analysis. We're gonna figure out a few solutions that you might focus on, and then we're gonna do all of the market research, competitive research, and say: these are the competitors, these are the things where you can fill some gaps. And after that, we should be able to understand how much money with each of these features you can make.",
      },
    ],
    actions: [
      "Reduce what you heard to at most three candidate solutions.",
      "For each one, name the competitors and the gap you would be filling.",
      "Attach a revenue estimate to each. A rough number you can defend beats no number.",
    ],
  },
  {
    key: "prioritise",
    n: 4,
    title: "Prioritise: is the house going to burn?",
    purpose: "Rank any two features without a scoring spreadsheet.",
    body: [
      "Every feature goes through the same question in the same order. First: will the house burn if we do not do this? If two features would both break something, the one that breaks faster - or breaks more - goes first.",
      "If nothing breaks either way, the question becomes money: which one cuts more cost or brings more revenue. That is the whole ladder. There is a lot of work behind each answer, but the ordering rule is not complicated.",
    ],
    quotes: [
      {
        text: "First of all: is the house gonna burn if we don't do this, or is it not? If there are two features where things are gonna break if we don't build them, which one is gonna break faster, or which one is gonna break more things? And if they're not gonna break anything - which one is gonna reduce us more cost or bring us more revenue? And that's really it.",
      },
    ],
    actions: [
      "Sort your current list into burning and not burning.",
      "Inside burning, order by how fast and how widely it breaks.",
      "Inside the rest, order by cost saved or revenue added. Nothing else gets a vote.",
    ],
  },
  {
    key: "kpis",
    n: 5,
    title: "KPIs: one revenue driver, then the small goals under it",
    purpose: "Stop recalculating revenue per feature and measure the thing that drives it.",
    body: [
      "The KPIs large companies talk about - retention, signup rate - are a simplification, and the simplification has a purpose: with many people to align, leadership needs each team to know whether they are a cost question or a revenue question.",
      "For a small team the same logic applies in miniature. Find the one thing that drives revenue for you, then a higher-level goal you look at roughly quarterly, and small goals you can check when you launch a feature or in a dashboard daily. Over time you learn the chain from a small feature to revenue growth.",
      "None of it means anything if the measurement is dirty. Test traffic and real client traffic in the same analytics project makes every number above unusable, so split them before you read any of it.",
    ],
    quotes: [
      {
        text: "You don't want to calculate the revenue for every single feature. You want to figure out what is that thing that's driving revenue for you.",
      },
      {
        text: "Maybe you're gonna figure out a higher level goal, which you're looking at maybe every three months. And then smaller goals, which you can look at every time you launch a feature or maybe just check in your dashboard every day. And you'll learn the system that is driving from these small features at the end to your revenue growth.",
      },
    ],
    actions: [
      "Name your one revenue driver. Write it somewhere you will see it.",
      "Set one quarterly goal above it and the per-launch numbers under it.",
      "Split test traffic from production traffic in your analytics before you trust a single figure.",
    ],
  },
];

/** Her interview questions, as she dictated them, kept separate by who you are asking. */
export type QuestionSet = { audience: "user" | "decision_maker"; label: string; intro: string; questions: string[] };

export const PMF_QUESTIONS: QuestionSet[] = [
  {
    audience: "user",
    label: "For someone who uses it",
    intro: "About an hour. Their day first, your product second, and a screen share before any of it.",
    questions: [
      "Walk me through your day to day.",
      "Why did you decide to open this app?",
      "Walk me through step by step - what did you click on?",
      "What are some things that are really frustrating you?",
      "What are some things you think are really great, that you come here for?",
      "Outside of this app: thinking about your day to day, what frustrates you most at work?",
      "Where do you see the roadblocks day to day - is it project management, is it development?",
      "Where do you think AI can help you the most with your job?",
    ],
  },
  {
    audience: "decision_maker",
    label: "For whoever decided to buy",
    intro: "Company level, not feature level. You are looking for the pain you can put a number against.",
    questions: [
      "You decided to buy this. Why did you decide on that?",
      "What are your KPIs?",
      "Where do you think our company can help you?",
      "What is your biggest pain point?",
    ],
  },
];

/** The technique rules. She sends these alongside the questions, and they carry the weight. */
export const PMF_TECHNIQUE: string[] = [
  "Open questions only. Never yes-or-no.",
  "Never lead the person to an answer.",
  "Watch them work on a screen share instead of taking their description of it.",
  "Adjust as you go - read how they answer and get on the same wavelength before pressing for detail.",
  "Talk to users and decision-makers separately. They are answering different questions.",
];

/** What she tells founders NOT to do yet, and why. */
export const PMF_NOT_YET: { rule: string; because: string }[] = [
  {
    rule: "No free trial yet",
    because:
      "Putting the product in front of strangers costs time and money and returns feedback you could have had for nothing. Exhaust the clients you already have first.",
  },
  {
    rule: "No market-size decision yet",
    because: "Smaller or larger companies, what volume, which countries - that comes after the features are clear, not before.",
  },
  {
    rule: "No revenue calculation per feature",
    because: "That is what the single revenue driver is for. Calculating it every time is how the measurement stops happening.",
  },
];

// ---------------------------------------------------------------- where an app is

export type PmfStateInput = {
  /** Paying customers, from the latest assessment. */
  payingUsers: number | null;
  /** Whether any analytics or snippet data exists at all. */
  hasAnalytics: boolean;
  /** Whether checkout is live, i.e. there is something to be paid for. */
  checkoutLive: boolean;
};

export type PmfState = { step: PmfStepKey; reason: string };

/**
 * Which step this app is actually on. Deliberately blunt: the framework is
 * sequential, and the common failure is running step 3 before step 2.
 */
export function pmfStateFor(input: PmfStateInput): PmfState {
  const paying = input.payingUsers ?? 0;
  if (paying === 0) {
    return {
      step: "bar",
      reason: input.checkoutLive
        ? "Nobody has paid yet, so nobody can tell you what they would miss. The bar comes first."
        : "There is nothing to lose yet, so start by writing down what would hurt a client if you took it away.",
    };
  }
  if (paying <= 10) {
    return {
      step: "qualitative",
      reason: `${paying} paying customer${paying === 1 ? "" : "s"} is not a sample, it is a list of people to talk to. This is the cheapest learning you will ever get.`,
    };
  }
  if (!input.hasAnalytics) {
    return {
      step: "kpis",
      reason: "There are enough customers to see patterns, but no measurement to see them with. Fix that before the research.",
    };
  }
  if (paying <= 50) {
    return {
      step: "quantitative",
      reason: `${paying} paying customers and measurement in place: the qualitative work should be feeding candidate solutions you can put numbers against.`,
    };
  }
  return {
    step: "prioritise",
    reason: "At this size the bottleneck is usually the order of the list, not the list.",
  };
}

export const stepOf = (key: PmfStepKey): PmfStep => PMF_STEPS.find((s) => s.key === key) ?? PMF_STEPS[0];

/** Source line, so the framework in the product can always be traced back. */
export const PMF_SOURCE = "Recorded mentoring session, 5 September 2026. Quotes are verbatim.";

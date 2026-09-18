/**
 * B2C analytics - the pure core. No DB, no env, no network (this module runs
 * in the browser too), unit-checked in tests/b2c.test.ts.
 *
 * This is the consumer-funnel view of an app: acquisition → activation →
 * retention → revenue, by signup cohort. It sits BESIDE the diagnosis and
 * attribution pages, which answer different questions (what stage am I at,
 * which channel paid) and are untouched by it.
 *
 * The presentation rules come from docs/METRICS_AND_FUNNELS.md and are the
 * whole point of the module: at these denominators a bare percentage lies.
 *   - a rate needs a denominator of MIN_RATE_DENOMINATOR, else the count pair
 *     is the value ("3 of 11");
 *   - the count is always printed next to the rate;
 *   - something not computable reads "—", never 0;
 *   - a cohort's retention cell appears only once its window has elapsed.
 */

// ---------------------------------------------------------------- constants

/** Below this denominator a rate is not shown at all - the count pair is. */
export const MIN_RATE_DENOMINATOR = 30;
/** Activation: a first-value event within this many hours of signup. */
export const ACTIVATION_HOURS = 24;
/** North star: a SECOND activation (they came back for more) within this many days of signup. */
export const NORTH_STAR_DAYS = 7;
/** A subscription closed inside this many days of starting is an early cancel. */
export const EARLY_CANCEL_DAYS = 9;
/** Retention checkpoints, in days after signup. */
export const RETENTION_DAYS = [1, 7, 30] as const;
/** Weeks of cohort history the triangle shows. */
export const TRIANGLE_WEEKS = 9;

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

// ---------------------------------------------------------------- weeks

export type Week = { start: string; end: string; label: string; startMs: number; endMs: number };

const iso = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** Monday 00:00 UTC of the ISO week containing `d`. */
export function isoWeekStart(d: Date): number {
  const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const dow = (new Date(day).getUTCDay() + 6) % 7; // Monday = 0
  return day - dow * DAY_MS;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function label(ms: number): string {
  const d = new Date(ms);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/**
 * The last `count` COMPLETE ISO weeks, oldest first. The week `now` falls in
 * is excluded: a partial week rendered beside complete ones always reads as a
 * collapse.
 */
export function completeWeeks(count: number, now: Date): Week[] {
  const thisWeek = isoWeekStart(now);
  const out: Week[] = [];
  for (let i = count; i >= 1; i--) {
    const startMs = thisWeek - i * 7 * DAY_MS;
    const endMs = startMs + 7 * DAY_MS;
    out.push({ start: iso(startMs), end: iso(endMs - 1), label: label(startMs), startMs, endMs });
  }
  return out;
}

// ---------------------------------------------------------------- formatting

/** A rate, or null when the denominator is too small to state one. */
export function rate(num: number, den: number): number | null {
  if (den < MIN_RATE_DENOMINATOR || den <= 0) return null;
  return num / den;
}

export function pct(x: number | null, digits = 0): string {
  return x === null ? "—" : `${(x * 100).toFixed(digits)}%`;
}

/**
 * The headline for a ratio: the rate when the denominator allows one, the
 * count pair when it does not, "—" when there is nothing to divide.
 */
export function ratioValue(num: number, den: number): string {
  if (den <= 0) return "—";
  const r = rate(num, den);
  return r === null ? `${num} of ${den}` : pct(r);
}

/** The n line: always numerator, denominator, and the split that explains them. */
export function nLine(num: number, den: number, split?: string): string {
  const head = den > 0 ? `${num} of ${den}` : "no data yet";
  return split ? `${head} · ${split}` : head;
}

export type Verdict = "good" | "warn" | "crit" | "none";

export type Delta = { dir: "up" | "down" | "flat"; text: string };

/**
 * A delta against the prior complete period. `upIsGood` decides the colour,
 * so a rising failure rate reads red.
 */
export function deltaOf(current: number | null, prior: number | null, opts: { unit?: "pts" | "count"; upIsGood?: boolean } = {}): Delta | undefined {
  if (current === null || prior === null) return undefined;
  const { unit = "count", upIsGood = true } = opts;
  const diff = unit === "pts" ? Math.round((current - prior) * 1000) / 10 : current - prior;
  if (diff === 0) return { dir: "flat", text: unit === "pts" ? "0 pts" : "no change" };
  const rising = diff > 0;
  const sign = rising ? "+" : "−";
  const mag = Math.abs(diff);
  return {
    dir: rising === upIsGood ? "up" : "down",
    text: unit === "pts" ? `${sign}${mag} pts` : `${sign}${mag} vs prior`,
  };
}

export type Tile = {
  key: string;
  label: string;
  value: string;
  small?: string;
  n: string;
  target?: string;
  verdict: Verdict;
  verdictLabel: string;
  /** Source badges, e.g. ["Snippet"], ["Stripe", "Apple"]. */
  sources: string[];
  delta?: Delta;
  series?: (number | null)[];
  caveat?: string;
  /** Anchor in docs/B2C_ANALYTICS.md. */
  docAnchor?: string;
};

/** A tile for something no connected source can answer. Never renders as 0. */
export function notMeasurable(key: string, label: string, why: string, fix: string, sources: string[] = []): Tile {
  return { key, label, value: "—", n: why, verdict: "none", verdictLabel: "not measurable", sources, caveat: fix };
}

/** Judge a value against a band, low-inclusive. Returns "none" when there is no value. */
export function judgeBand(value: number | null, band: { min: number; max?: number }): Verdict {
  if (value === null) return "none";
  if (value < band.min) return "warn";
  if (band.max !== undefined && value > band.max) return "warn";
  return "good";
}

// ---------------------------------------------------------------- visitors

export type VisitorEvent = { event: string; at: number };

/**
 * One anonymous visitor, as the snippet saw them. `events` is every event they
 * fired, oldest first - the cohort maths needs the timestamps, not counts.
 */
export type Visitor = {
  anonId: string;
  channel: string;
  /** "web" when the snippet ran in a browser, "app" when the app reported an install. */
  platform: "web" | "app";
  events: VisitorEvent[];
};

const FIRST_VALUE = new Set(["activation", "purchase"]);

export type VisitorFacts = {
  anonId: string;
  channel: string;
  platform: "web" | "app";
  firstSeenAt: number;
  signupAt: number | null;
  /** First activation or purchase - "first value". */
  firstValueAt: number | null;
  /** The SECOND one, which is what the north star counts. */
  secondValueAt: number | null;
  checkoutViewAt: number | null;
  purchaseAt: number | null;
  installAt: number | null;
  lastSeenAt: number;
  /** Distinct UTC days on which this visitor did anything. */
  activeDays: Set<string>;
};

/** Collapse a visitor's event list into the handful of facts every page needs. */
export function visitorFacts(v: Visitor): VisitorFacts {
  const sorted = [...v.events].sort((a, b) => a.at - b.at);
  const values = sorted.filter((e) => FIRST_VALUE.has(e.event));
  const first = (name: string) => sorted.find((e) => e.event === name)?.at ?? null;
  const activeDays = new Set<string>();
  for (const e of sorted) activeDays.add(iso(e.at));
  return {
    anonId: v.anonId,
    channel: v.channel,
    platform: v.platform,
    firstSeenAt: sorted[0]?.at ?? 0,
    signupAt: first("signup"),
    firstValueAt: values[0]?.at ?? null,
    secondValueAt: values[1]?.at ?? null,
    checkoutViewAt: first("checkout_view"),
    purchaseAt: first("purchase"),
    installAt: first("install"),
    lastSeenAt: sorted[sorted.length - 1]?.at ?? 0,
    activeDays,
  };
}

// ---------------------------------------------------------------- cohorts

export type Cohort = {
  week: Week;
  signups: number;
  signupsWeb: number;
  signupsApp: number;
  attributed: number;
  activated: number;
  northStar: number;
  /** Eligible = enough time has passed since signup for the window to have elapsed. */
  northStarEligible: number;
  retention: { day: number; hit: number; eligible: number }[];
  purchased: number;
};

const dayKeysBetween = (fromMs: number, toMs: number): string[] => {
  const out: string[] = [];
  for (let t = fromMs; t < toMs; t += DAY_MS) out.push(iso(t));
  return out;
};

/**
 * Cohorts by signup week. A retention checkpoint counts a visitor only when
 * the whole checkpoint window has already passed for them - so a cohort that
 * signed up yesterday contributes to nothing but its own size.
 */
export function buildCohorts(facts: VisitorFacts[], weeks: Week[], now: Date): Cohort[] {
  const nowMs = now.getTime();
  return weeks.map((week) => {
    const members = facts.filter((f) => f.signupAt !== null && f.signupAt >= week.startMs && f.signupAt < week.endMs);
    const retention = RETENTION_DAYS.map((day) => {
      let hit = 0;
      let eligible = 0;
      for (const f of members) {
        const signup = f.signupAt as number;
        const windowEnd = signup + day * DAY_MS;
        // The day-N window is the 24 h that begins N days after signup.
        if (windowEnd + DAY_MS > nowMs) continue;
        eligible++;
        const keys = dayKeysBetween(windowEnd, windowEnd + DAY_MS);
        if (keys.some((k) => f.activeDays.has(k))) hit++;
      }
      return { day, hit, eligible };
    });
    let northStar = 0;
    let northStarEligible = 0;
    for (const f of members) {
      const signup = f.signupAt as number;
      if (signup + NORTH_STAR_DAYS * DAY_MS > nowMs) continue;
      northStarEligible++;
      if (f.secondValueAt !== null && f.secondValueAt - signup <= NORTH_STAR_DAYS * DAY_MS) northStar++;
    }
    return {
      week,
      signups: members.length,
      signupsWeb: members.filter((f) => f.platform === "web").length,
      signupsApp: members.filter((f) => f.platform === "app").length,
      attributed: members.filter((f) => f.channel !== "direct" && f.channel !== "other").length,
      activated: members.filter((f) => f.firstValueAt !== null && f.firstValueAt - (f.signupAt as number) <= ACTIVATION_HOURS * HOUR_MS).length,
      northStar,
      northStarEligible,
      retention,
      purchased: members.filter((f) => f.purchaseAt !== null).length,
    };
  });
}

export const sumCohorts = (cohorts: Cohort[], pick: (c: Cohort) => number): number => cohorts.reduce((a, c) => a + pick(c), 0);

export function retentionOf(cohorts: Cohort[], day: number): { hit: number; eligible: number } {
  let hit = 0;
  let eligible = 0;
  for (const c of cohorts) {
    const r = c.retention.find((x) => x.day === day);
    if (r) {
      hit += r.hit;
      eligible += r.eligible;
    }
  }
  return { hit, eligible };
}

export type TriangleRow = { label: string; n: number; cells: (number | null)[] };

/**
 * Share of each signup cohort active in week N after signup. A cell is null
 * until its week has fully elapsed - never 0, which would read as churn.
 */
export function cohortTriangle(facts: VisitorFacts[], weeks: Week[], now: Date, maxWeeks = TRIANGLE_WEEKS): TriangleRow[] {
  const nowMs = now.getTime();
  return weeks.map((week) => {
    const members = facts.filter((f) => f.signupAt !== null && f.signupAt >= week.startMs && f.signupAt < week.endMs);
    const cells: (number | null)[] = [];
    for (let w = 0; w < maxWeeks; w++) {
      const from = week.startMs + w * 7 * DAY_MS;
      const to = from + 7 * DAY_MS;
      if (to > nowMs || members.length === 0) {
        cells.push(null);
        continue;
      }
      const keys = dayKeysBetween(from, to);
      const active = members.filter((f) => keys.some((k) => f.activeDays.has(k))).length;
      cells.push(active / members.length);
    }
    return { label: week.label, n: members.length, cells };
  });
}

// ---------------------------------------------------------------- channels

export type ChannelRow = {
  channel: string;
  web: number;
  app: number;
  signups: number;
  activated: number;
  purchased: number;
};

/** Per-channel signups and what those signups went on to do. Volume never sorts above outcome. */
export function channelBreakdown(facts: VisitorFacts[]): ChannelRow[] {
  const by = new Map<string, ChannelRow>();
  for (const f of facts) {
    if (f.signupAt === null) continue;
    const row = by.get(f.channel) ?? { channel: f.channel, web: 0, app: 0, signups: 0, activated: 0, purchased: 0 };
    row.signups++;
    if (f.platform === "web") row.web++;
    else row.app++;
    if (f.firstValueAt !== null && f.firstValueAt - f.signupAt <= ACTIVATION_HOURS * HOUR_MS) row.activated++;
    if (f.purchaseAt !== null) row.purchased++;
    by.set(f.channel, row);
  }
  return [...by.values()].sort((a, b) => b.purchased - a.purchased || b.signups - a.signups);
}

// ---------------------------------------------------------------- funnel

export type FunnelStep = { key: string; label: string; web: number | null; app: number | null; caveat?: string };

/** Each step as a share of the step above it, per platform, for the funnel bars. */
export function funnelShares(steps: FunnelStep[]): { step: FunnelStep; webShare: number | null; appShare: number | null; prevPct: string }[] {
  const webTop = steps[0]?.web ?? 0;
  const appTop = steps[0]?.app ?? 0;
  return steps.map((step, i) => {
    const prev = steps[i - 1];
    const prevTotal = prev ? (prev.web ?? 0) + (prev.app ?? 0) : 0;
    const total = (step.web ?? 0) + (step.app ?? 0);
    return {
      step,
      webShare: webTop > 0 && step.web !== null ? step.web / webTop : null,
      appShare: appTop > 0 && step.app !== null ? step.app / appTop : null,
      prevPct: i === 0 || prevTotal === 0 || step.web === null ? "" : `${Math.round((total / prevTotal) * 100)}%`,
    };
  });
}

/** The snippet funnel, in order, from a set of visitor facts. */
export function snippetFunnel(facts: VisitorFacts[]): FunnelStep[] {
  const count = (platform: "web" | "app", pick: (f: VisitorFacts) => boolean) => facts.filter((f) => f.platform === platform && pick(f)).length;
  const step = (key: string, label: string, pick: (f: VisitorFacts) => boolean, caveat?: string): FunnelStep => ({
    key,
    label,
    web: count("web", pick),
    app: count("app", pick),
    caveat,
  });
  return [
    step("reach", "Visit / install", () => true),
    step("signup", "Signup", (f) => f.signupAt !== null),
    step("activation", "Activation", (f) => f.firstValueAt !== null),
    step("checkout_view", "Checkout viewed", (f) => f.checkoutViewAt !== null, "snippet event - undercounts until every build calls it"),
    step("purchase", "Purchase", (f) => f.purchaseAt !== null),
    step("repeat", "Second activation", (f) => f.secondValueAt !== null),
  ];
}

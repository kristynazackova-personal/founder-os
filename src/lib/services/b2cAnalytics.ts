/**
 * B2C analytics - orchestration. Loads an app's consumer funnel from the
 * snippet's own events plus whatever revenue rails are connected, and
 * assembles one payload per page of /app/<id>/b2c.
 *
 * Additive by construction: it reads the same tables the diagnosis and
 * attribution pages read and writes nothing. Those pages keep working
 * untouched if this one errors.
 *
 * Every page is fail-soft - a source that throws lands in `sourceErrors` and
 * its tiles read "—" rather than failing the request. The maths lives in
 * domain/b2c.ts so it can be exercised without Postgres.
 */
import { and, eq, gte } from "drizzle-orm";
import { getDb, schema } from "../db";
import type { App } from "../db/schema";
import { CHANNEL_LABEL } from "../domain/attribution";
import {
  ACTIVATION_HOURS, EARLY_CANCEL_DAYS, MIN_RATE_DENOMINATOR, NORTH_STAR_DAYS,
  buildCohorts, channelBreakdown, cohortTriangle, completeWeeks, deltaOf, judgeBand, nLine, notMeasurable,
  pct, rate, ratioValue, retentionOf, snippetFunnel, sumCohorts, visitorFacts,
  type ChannelRow, type Cohort, type FunnelStep, type Tile, type TriangleRow, type Visitor, type VisitorFacts, type Week,
} from "../domain/b2c";
import { mergeRevenueData, type NormalizedSubscription } from "../domain/metrics";
import { gateFor, judgeAgainstGate, type GateMetric, type GateSet } from "../domain/gates";
import { MEASUREMENT_NOTES, notesFor, type MeasurementNote } from "../domain/notes";
import { gatesOf } from "./gates";
import { monthlyEquivalentCents } from "../domain/money";
import { wrappedRevenueData } from "./checkout";
import { fetchExternalRevenue } from "./sources";

const DAY_MS = 86_400_000;
/** Sparklines want more weeks than the window; this many are always loaded. */
export const SERIES_WEEKS = 8;

export type B2cOpts = { weeks: number; now?: Date };

export type B2cWindow = {
  weeks: Week[];
  /** The selected window (its last `weeks.length` entries are what tiles read). */
  from: string;
  to: string;
  generatedAt: string;
  snippetInstalled: boolean;
};

export type B2cBase = {
  window: B2cWindow;
  tiles: Tile[];
  sourceErrors: Record<string, string>;
  /** What the reader has to know to read these numbers correctly. */
  notes: MeasurementNote[];
  gates: GateSet;
};

/** Load every snippet event for the app since `since`, grouped per visitor. */
async function loadVisitors(appId: string, since: Date): Promise<Visitor[]> {
  const db = await getDb();
  const rows = await db
    .select({
      anonId: schema.attributionEvents.anonId,
      event: schema.attributionEvents.event,
      channel: schema.attributionEvents.channel,
      utmSource: schema.attributionEvents.utmSource,
      occurredAt: schema.attributionEvents.occurredAt,
    })
    .from(schema.attributionEvents)
    .where(and(eq(schema.attributionEvents.appId, appId), gte(schema.attributionEvents.occurredAt, since)));

  const by = new Map<string, Visitor>();
  for (const r of rows) {
    const v = by.get(r.anonId) ?? { anonId: r.anonId, channel: r.channel, platform: "web" as const, events: [] };
    v.events.push({ event: r.event, at: r.occurredAt.getTime() });
    // An app reports its own installs and stamps the store as the source;
    // a browser never sends `install`. That is the only platform signal the
    // snippet carries, so it is the one we use.
    if (r.event === "install" || r.channel === "app_store") v.platform = "app";
    by.set(r.anonId, v);
  }
  return [...by.values()];
}

type Loaded = {
  facts: VisitorFacts[];
  weeks: Week[];
  windowWeeks: Week[];
  cohorts: Cohort[];
  priorCohorts: Cohort[];
  seriesCohorts: Cohort[];
  now: Date;
  errors: Record<string, string>;
  app: App;
  /** The thresholds this app is judged against (domain/gates.ts). */
  gates: GateSet;
};

/**
 * The shared load every page starts from: the snippet's visitors over enough
 * history for sparklines, folded into cohorts for the window, the window
 * before it (for deltas) and each week separately (for the series).
 */
async function load(app: App, opts: B2cOpts): Promise<Loaded> {
  const now = opts.now ?? new Date();
  const weeks = Math.min(Math.max(Math.trunc(opts.weeks) || 4, 1), 26);
  const historyWeeks = completeWeeks(Math.max(weeks * 2, SERIES_WEEKS), now);
  const windowWeeks = historyWeeks.slice(-weeks);
  const priorWeeks = historyWeeks.slice(-weeks * 2, -weeks);
  const errors: Record<string, string> = {};
  let facts: VisitorFacts[] = [];
  try {
    // Retention needs 30 days of activity AFTER the oldest cohort signed up.
    const since = new Date(historyWeeks[0].startMs);
    facts = (await loadVisitors(app.id, since)).map(visitorFacts);
  } catch (err) {
    errors.snippet = err instanceof Error ? err.message : String(err);
  }
  const seriesCohorts = buildCohorts(facts, historyWeeks.slice(-SERIES_WEEKS), now);
  return {
    facts,
    weeks: historyWeeks,
    windowWeeks,
    cohorts: buildCohorts(facts, windowWeeks, now),
    priorCohorts: buildCohorts(facts, priorWeeks, now),
    seriesCohorts,
    now,
    errors,
    app,
    gates: gatesOf(app),
  };
}

const windowOf = (l: Loaded): B2cWindow => ({
  weeks: l.windowWeeks,
  from: l.windowWeeks[0]?.start ?? "",
  to: l.windowWeeks[l.windowWeeks.length - 1]?.end ?? "",
  generatedAt: l.now.toISOString(),
  snippetInstalled: Boolean(l.app.snippetInstalledAt),
});

/** Visitors whose FIRST touch falls in the window - the acquisition denominator. */
const arrivedIn = (facts: VisitorFacts[], weeks: Week[]): VisitorFacts[] => {
  const from = weeks[0]?.startMs ?? 0;
  const to = weeks[weeks.length - 1]?.endMs ?? 0;
  return facts.filter((f) => f.firstSeenAt >= from && f.firstSeenAt < to);
};

const series = (cohorts: Cohort[], pick: (c: Cohort) => number | null): (number | null)[] => cohorts.map(pick);

/**
 * Judge a ratio against this app's gate for that metric. Falls back to "no
 * gate" rather than inventing one, and never passes or fails on a handful of
 * people (the same denominator rule the rate itself obeys).
 */
function judged(l: Loaded, metric: GateMetric, num: number, den: number): Pick<Tile, "target" | "verdict" | "verdictLabel"> {
  const j = judgeAgainstGate(rate(num, den), gateFor(l.gates, metric), den, MIN_RATE_DENOMINATOR);
  return { target: j.target || undefined, verdict: j.verdict, verdictLabel: j.label };
}

const NO_SNIPPET_TILE = (key: string, label: string): Tile =>
  notMeasurable(key, label, "the snippet has never reported an event", "Install the snippet on the Attribution tab - one line in <head>, plus a signup and activation call.", ["Snippet"]);

// ---------------------------------------------------------------- overview

export type OverviewPage = B2cBase & {
  byWeek: { label: string; rows: { key: string; label: string; values: string[] }[] };
  changes: { verdict: "good" | "warn" | "crit" | "none"; text: string }[];
};

function coreTiles(l: Loaded): Tile[] {
  const { cohorts, priorCohorts, seriesCohorts } = l;
  const signups = sumCohorts(cohorts, (c) => c.signups);
  if (!l.app.snippetInstalledAt && signups === 0) {
    return [
      NO_SNIPPET_TILE("north_star", "North star · second activation ≤ 7 d"),
      NO_SNIPPET_TILE("activated", `Activated ≤ ${ACTIVATION_HOURS} h`),
      NO_SNIPPET_TILE("signups", "Signups"),
      NO_SNIPPET_TILE("retention", "D1 / D7"),
    ];
  }
  const priorSignups = sumCohorts(priorCohorts, (c) => c.signups);
  const ns = sumCohorts(cohorts, (c) => c.northStar);
  const nsEligible = sumCohorts(cohorts, (c) => c.northStarEligible);
  const act = sumCohorts(cohorts, (c) => c.activated);
  const d1 = retentionOf(cohorts, 1);
  const d7 = retentionOf(cohorts, 7);
  const priorNs = rate(sumCohorts(priorCohorts, (c) => c.northStar), sumCohorts(priorCohorts, (c) => c.northStarEligible));
  const priorAct = rate(sumCohorts(priorCohorts, (c) => c.activated), priorSignups);

  return [
    {
      key: "north_star",
      label: `North star · second activation ≤ ${NORTH_STAR_DAYS} d`,
      value: ratioValue(ns, nsEligible),
      n: nLine(ns, nsEligible, "cohorts whose 7 days have elapsed"),
      ...judged(l, "north_star", ns, nsEligible),
      sources: ["Snippet"],
      delta: deltaOf(rate(ns, nsEligible), priorNs, { unit: "pts" }),
      series: series(seriesCohorts, (c) => rate(c.northStar, c.northStarEligible)),
      docAnchor: "north-star",
    },
    {
      key: "activated",
      label: `Activated ≤ ${ACTIVATION_HOURS} h`,
      value: ratioValue(act, signups),
      n: nLine(act, signups, "activation or purchase within a day of signup"),
      ...judged(l, "activation", act, signups),
      sources: ["Snippet"],
      delta: deltaOf(rate(act, signups), priorAct, { unit: "pts" }),
      series: series(seriesCohorts, (c) => rate(c.activated, c.signups)),
      docAnchor: "activation",
    },
    {
      key: "signups",
      label: "Signups",
      value: String(signups),
      n: nLine(signups, signups, `web ${sumCohorts(cohorts, (c) => c.signupsWeb)} · app ${sumCohorts(cohorts, (c) => c.signupsApp)}`),
      verdict: "none",
      verdictLabel: "count",
      sources: ["Snippet"],
      delta: deltaOf(signups, priorSignups),
      series: series(seriesCohorts, (c) => c.signups),
      docAnchor: "signups",
    },
    {
      key: "retention",
      label: "D1 / D7",
      value: ratioValue(d1.hit, d1.eligible),
      small: d7.eligible >= MIN_RATE_DENOMINATOR ? `/ ${pct(rate(d7.hit, d7.eligible))}` : `/ ${d7.hit} of ${d7.eligible}`,
      n: nLine(d1.hit, d1.eligible, `D7 ${d7.hit} of ${d7.eligible}`),
      ...judged(l, "d7", d7.hit, d7.eligible),
      sources: ["Snippet"],
      series: series(seriesCohorts, (c) => rate(c.retention.find((r) => r.day === 7)?.hit ?? 0, c.retention.find((r) => r.day === 7)?.eligible ?? 0)),
      docAnchor: "retention",
    },
  ];
}

export async function loadOverviewPage(app: App, opts: B2cOpts): Promise<OverviewPage> {
  const l = await load(app, opts);
  const rev = await revenueFacts(app, l);
  const purchases = sumCohorts(l.cohorts, (c) => c.purchased);
  const signups = sumCohorts(l.cohorts, (c) => c.signups);

  const tiles: Tile[] = [
    ...coreTiles(l),
    {
      key: "paying",
      label: "Paying customers",
      value: rev.error ? "—" : String(rev.paying),
      n: rev.error ? "no revenue source could be read" : nLine(rev.paying, rev.paying, rev.split || "across every connected rail"),
      verdict: "none",
      verdictLabel: rev.error ? "not measurable" : "count",
      sources: rev.sources.length ? rev.sources : ["Stripe"],
      caveat: rev.error ?? undefined,
      docAnchor: "paying",
    },
    {
      key: "signup_to_paid",
      label: "Signup → paid",
      value: ratioValue(purchases, signups),
      n: nLine(purchases, signups, "snippet purchases against signups in the window"),
      ...judged(l, "signup_to_paid", purchases, signups),
      sources: ["Snippet"],
      series: series(l.seriesCohorts, (c) => rate(c.purchased, c.signups)),
      docAnchor: "signup-to-paid",
    },
    {
      key: "trials",
      label: "Trials started",
      value: rev.error ? "—" : String(rev.trialStarts),
      n: rev.error ? "no revenue source could be read" : nLine(rev.trialStarts, rev.trialStarts, `${rev.trialing} currently on trial`),
      verdict: "none",
      verdictLabel: rev.error ? "not measurable" : "count",
      sources: rev.sources.length ? rev.sources : ["Stripe"],
      docAnchor: "trials",
    },
    {
      key: "early_cancels",
      label: "Early cancels",
      value: rev.error ? "—" : String(rev.earlyCancels),
      n: rev.error ? "no revenue source could be read" : nLine(rev.earlyCancels, rev.trialStarts, `closed within ${EARLY_CANCEL_DAYS} days of starting`),
      verdict: rev.earlyCancels > 0 ? "warn" : "none",
      verdictLabel: rev.earlyCancels > 0 ? "look at these" : "none",
      sources: rev.sources.length ? rev.sources : ["Stripe"],
      docAnchor: "early-cancels",
    },
  ];

  const rows = [
    { key: "signups", label: "Signups · web / app", values: l.seriesCohorts.map((c) => `${c.signupsWeb} / ${c.signupsApp}`) },
    { key: "activated", label: `Activated ≤ ${ACTIVATION_HOURS} h`, values: l.seriesCohorts.map((c) => ratioValue(c.activated, c.signups)) },
    { key: "north_star", label: "North star", values: l.seriesCohorts.map((c) => ratioValue(c.northStar, c.northStarEligible)) },
    { key: "d1", label: "D1", values: l.seriesCohorts.map((c) => cellRetention(c, 1)) },
    { key: "d7", label: "D7", values: l.seriesCohorts.map((c) => cellRetention(c, 7)) },
    { key: "purchased", label: "Purchased", values: l.seriesCohorts.map((c) => String(c.purchased)) },
  ];

  return {
    window: windowOf(l),
    tiles,
    byWeek: { label: `${SERIES_WEEKS} complete weeks`, rows },
    changes: overviewChanges(l, rev),
    notes: notesFor("overview"),
    gates: l.gates,
    sourceErrors: { ...l.errors, ...(rev.error ? { revenue: rev.error } : {}) },
  };
}

const cellRetention = (c: Cohort, day: number): string => {
  const r = c.retention.find((x) => x.day === day);
  if (!r || r.eligible === 0) return "·";
  return ratioValue(r.hit, r.eligible);
};

function overviewChanges(l: Loaded, rev: RevenueFacts): OverviewPage["changes"] {
  const out: OverviewPage["changes"] = [];
  if (rev.earlyCancels > 0) {
    out.push({ verdict: "crit", text: `${rev.earlyCancels} subscription${rev.earlyCancels === 1 ? "" : "s"} closed within ${EARLY_CANCEL_DAYS} days of starting - the fastest signal you have that the first week disappoints.` });
  }
  const signups = sumCohorts(l.cohorts, (c) => c.signups);
  const prior = sumCohorts(l.priorCohorts, (c) => c.signups);
  if (signups > prior) out.push({ verdict: "good", text: `Signups ${signups}, up from ${prior} in the window before.` });
  else if (signups < prior) out.push({ verdict: "warn", text: `Signups ${signups}, down from ${prior} in the window before.` });
  const unattributed = sumCohorts(l.cohorts, (c) => c.signups - c.attributed);
  if (unattributed > 0 && signups > 0) {
    out.push({ verdict: "warn", text: `${unattributed} of ${signups} signups carry no usable source, so every channel number below is a floor.` });
  }
  const d7 = retentionOf(l.cohorts, 7);
  if (d7.eligible > 0 && d7.eligible < MIN_RATE_DENOMINATOR) {
    out.push({ verdict: "none", text: `Only ${d7.eligible} signups are old enough to have a D7 answer - the rate is withheld until ${MIN_RATE_DENOMINATOR}.` });
  }
  return out;
}

// ---------------------------------------------------------------- revenue facts

type RevenueFacts = {
  paying: number;
  trialing: number;
  trialStarts: number;
  trialConversions: number;
  earlyCancels: number;
  mrrCents: number;
  byRail: { rail: string; active: number; trialing: number }[];
  subs: NormalizedSubscription[];
  sources: string[];
  split: string;
  error: string | null;
};

const EMPTY_REVENUE: RevenueFacts = { paying: 0, trialing: 0, trialStarts: 0, trialConversions: 0, earlyCancels: 0, mrrCents: 0, byRail: [], subs: [], sources: [], split: "", error: null };

/** Subscriptions from every connected rail plus our own wrapped checkout. */
async function revenueFacts(app: App, l: Loaded): Promise<RevenueFacts> {
  try {
    const [ext, wrapped] = await Promise.all([fetchExternalRevenue(app), wrappedRevenueData(app.id)]);
    const data = mergeRevenueData([ext.data, wrapped.data]);
    const from = l.windowWeeks[0]?.startMs ?? 0;
    const to = l.windowWeeks[l.windowWeeks.length - 1]?.endMs ?? 0;
    const inWindow = (d: Date | null | undefined) => Boolean(d && d.getTime() >= from && d.getTime() < to);
    const active = data.subscriptions.filter((s) => s.status === "active" || s.status === "past_due");
    const trialing = data.subscriptions.filter((s) => s.status === "trialing");
    const trialStarts = data.subscriptions.filter((s) => inWindow(s.trialStartedAt ?? null));
    const earlyCancels = data.subscriptions.filter(
      (s) => s.canceledAt && inWindow(s.canceledAt) && s.canceledAt.getTime() - s.startedAt.getTime() <= EARLY_CANCEL_DAYS * DAY_MS,
    );
    const railOf = (s: NormalizedSubscription) => (s.id.startsWith("wrapped") ? "wrapped" : "external");
    const rails = new Map<string, { rail: string; active: number; trialing: number }>();
    for (const s of data.subscriptions) {
      const key = railOf(s);
      const row = rails.get(key) ?? { rail: key, active: 0, trialing: 0 };
      if (s.status === "active" || s.status === "past_due") row.active++;
      if (s.status === "trialing") row.trialing++;
      rails.set(key, row);
    }
    const sources = [...ext.sourcesUsed.map(railLabel), ...(wrapped.hasAny ? ["Wrapped"] : [])];
    return {
      paying: active.length,
      trialing: trialing.length,
      trialStarts: trialStarts.length,
      trialConversions: trialStarts.filter((s) => s.firstPaidAt).length,
      earlyCancels: earlyCancels.length,
      mrrCents: active.reduce((a, s) => a + monthlyEquivalentCents(s.amountCents, s.interval, s.intervalCount), 0),
      byRail: [...rails.values()],
      subs: data.subscriptions,
      sources: sources.length ? sources : [],
      split: active.length ? `${trialing.length} on trial · ${sources.join(" · ") || "one rail"}` : "",
      error: ext.errors.length ? ext.errors.map((e) => `${e.type}: ${e.message}`).join("; ") : null,
    };
  } catch (err) {
    return { ...EMPTY_REVENUE, error: err instanceof Error ? err.message : String(err) };
  }
}

const RAIL_LABELS: Record<string, string> = { stripe: "Stripe", appstore: "Apple", lemonsqueezy: "Lemon Squeezy", paddle: "Paddle" };
const railLabel = (t: string): string => RAIL_LABELS[t] ?? t;

// ---------------------------------------------------------------- acquisition

export type AcquisitionPage = B2cBase & {
  signupsPerWeek: { label: string; web: number; app: number }[];
  channels: (ChannelRow & { label: string })[];
  funnel: FunnelStep[];
};

export async function loadAcquisitionPage(app: App, opts: B2cOpts): Promise<AcquisitionPage> {
  const l = await load(app, opts);
  const arrivals = arrivedIn(l.facts, l.windowWeeks);
  const signups = sumCohorts(l.cohorts, (c) => c.signups);
  const priorSignups = sumCohorts(l.priorCohorts, (c) => c.signups);
  const reached = arrivals.length;
  const attributed = sumCohorts(l.cohorts, (c) => c.attributed);
  const installs = arrivals.filter((f) => f.installAt !== null).length;
  const appSignups = sumCohorts(l.cohorts, (c) => c.signupsApp);

  const tiles: Tile[] = l.app.snippetInstalledAt || signups > 0
    ? [
        {
          key: "signups", label: "Signups", value: String(signups),
          n: nLine(signups, signups, `web ${sumCohorts(l.cohorts, (c) => c.signupsWeb)} · app ${appSignups}`),
          verdict: "none", verdictLabel: "count", sources: ["Snippet"],
          delta: deltaOf(signups, priorSignups), series: series(l.seriesCohorts, (c) => c.signups),
        },
        {
          key: "visit_to_signup", label: "Visit → signup", value: ratioValue(signups, reached),
          n: nLine(signups, reached, "distinct visitors whose first touch is in the window"),
          target: "Landing-page band 2–6% · a marketing page reads higher than a home page",
          verdict: judgeBand(rate(signups, reached), { min: 0.02 }),
          verdictLabel: reached < MIN_RATE_DENOMINATOR ? "n too small to judge" : "vs band",
          sources: ["Snippet"],
        },
        {
          key: "install_to_signup", label: "Install → signup (app)", value: ratioValue(appSignups, installs),
          n: nLine(appSignups, installs, "installs the app itself reported"),
          verdict: "none", verdictLabel: installs === 0 ? "no installs reported" : "no reliable market bar",
          sources: ["Snippet"],
          caveat: installs === 0 ? "The app is not calling the install event - see the app snippet on the Attribution tab." : undefined,
        },
        {
          key: "coverage", label: "Attribution coverage", value: ratioValue(attributed, signups),
          n: nLine(attributed, signups, "signups carrying a source we can name"),
          verdict: judgeBand(rate(attributed, signups), { min: 0.7 }),
          verdictLabel: signups < MIN_RATE_DENOMINATOR ? "n too small to judge" : "share with a known source",
          sources: ["Snippet"],
          caveat: "iOS App campaigns cannot be attributed per campaign client-side, so store installs share one bucket.",
        },
      ]
    : [NO_SNIPPET_TILE("signups", "Signups"), NO_SNIPPET_TILE("visit_to_signup", "Visit → signup"), NO_SNIPPET_TILE("install_to_signup", "Install → signup (app)"), NO_SNIPPET_TILE("coverage", "Attribution coverage")];

  return {
    window: windowOf(l),
    tiles,
    signupsPerWeek: l.seriesCohorts.map((c) => ({ label: c.week.label, web: c.signupsWeb, app: c.signupsApp })),
    channels: channelBreakdown(l.facts.filter((f) => f.signupAt !== null && f.signupAt >= (l.windowWeeks[0]?.startMs ?? 0)))
      .map((c) => ({ ...c, label: CHANNEL_LABEL[c.channel as keyof typeof CHANNEL_LABEL] ?? c.channel })),
    funnel: snippetFunnel(arrivals),
    notes: notesFor("acquisition"),
    gates: l.gates,
    sourceErrors: l.errors,
  };
}

// ---------------------------------------------------------------- activation

export type ActivationPage = B2cBase & {
  triangle: TriangleRow[];
  activeUsersPerWeek: { label: string; users: number }[];
  timeToValue: { medianMinutes: number | null; p75Minutes: number | null; measured: number };
};

const quantile = (sorted: number[], q: number): number | null => {
  if (sorted.length === 0) return null;
  const i = Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)));
  return sorted[i];
};

export async function loadActivationPage(app: App, opts: B2cOpts): Promise<ActivationPage> {
  const l = await load(app, opts);
  const signups = sumCohorts(l.cohorts, (c) => c.signups);
  const act = sumCohorts(l.cohorts, (c) => c.activated);
  const d1 = retentionOf(l.cohorts, 1);
  const d7 = retentionOf(l.cohorts, 7);
  const d30 = retentionOf(l.cohorts, 30);
  const ns = sumCohorts(l.cohorts, (c) => c.northStar);
  const nsEligible = sumCohorts(l.cohorts, (c) => c.northStarEligible);

  const gaps = l.facts
    .filter((f) => f.signupAt !== null && f.firstValueAt !== null && f.signupAt >= (l.windowWeeks[0]?.startMs ?? 0))
    .map((f) => ((f.firstValueAt as number) - (f.signupAt as number)) / 60_000)
    .filter((m) => m >= 0)
    .sort((a, b) => a - b);

  const weekly = l.weeks.slice(-SERIES_WEEKS).map((w) => {
    const keys: string[] = [];
    for (let t = w.startMs; t < w.endMs; t += DAY_MS) keys.push(new Date(t).toISOString().slice(0, 10));
    return { label: w.label, users: l.facts.filter((f) => keys.some((k) => f.activeDays.has(k))).length };
  });

  const tiles: Tile[] = signups === 0 && !l.app.snippetInstalledAt
    ? [NO_SNIPPET_TILE("activated", `Activated ≤ ${ACTIVATION_HOURS} h`), NO_SNIPPET_TILE("ttv", "Time to first value"), NO_SNIPPET_TILE("north_star", "North star"), NO_SNIPPET_TILE("retention", "D1 · D7 · D30")]
    : [
        {
          key: "activated", label: `Activated ≤ ${ACTIVATION_HOURS} h`, value: ratioValue(act, signups),
          n: nLine(act, signups, "reached the activation event within a day"),
          ...judged(l, "activation", act, signups), sources: ["Snippet"],
          series: series(l.seriesCohorts, (c) => rate(c.activated, c.signups)),
        },
        {
          key: "ttv", label: "Time to first value",
          value: gaps.length === 0 ? "—" : formatMinutes(quantile(gaps, 0.5)),
          n: gaps.length === 0 ? "nobody has activated yet" : nLine(gaps.length, signups, `p75 ${formatMinutes(quantile(gaps, 0.75))}`),
          verdict: "none", verdictLabel: gaps.length === 0 ? "not measurable" : "median", sources: ["Snippet"],
        },
        {
          key: "north_star", label: `North star · second activation ≤ ${NORTH_STAR_DAYS} d`, value: ratioValue(ns, nsEligible),
          n: nLine(ns, nsEligible, "only cohorts whose window has elapsed"),
          ...judged(l, "north_star", ns, nsEligible), sources: ["Snippet"],
          series: series(l.seriesCohorts, (c) => rate(c.northStar, c.northStarEligible)),
        },
        {
          key: "retention", label: "D1 · D7 · D30",
          value: ratioValue(d1.hit, d1.eligible),
          small: `/ ${ratioValue(d7.hit, d7.eligible)} / ${ratioValue(d30.hit, d30.eligible)}`,
          n: `D1 ${d1.hit} of ${d1.eligible} · D7 ${d7.hit} of ${d7.eligible} · D30 ${d30.hit} of ${d30.eligible}`,
          ...judged(l, "d7", d7.hit, d7.eligible),
          sources: ["Snippet"],
        },
      ];

  return {
    window: windowOf(l),
    tiles,
    triangle: cohortTriangle(l.facts, l.weeks.slice(-SERIES_WEEKS), l.now),
    activeUsersPerWeek: weekly,
    timeToValue: { medianMinutes: quantile(gaps, 0.5), p75Minutes: quantile(gaps, 0.75), measured: gaps.length },
    notes: notesFor("activation"),
    gates: l.gates,
    sourceErrors: l.errors,
  };
}

function formatMinutes(m: number | null): string {
  if (m === null) return "—";
  if (m < 90) return `${Math.round(m)} min`;
  const h = m / 60;
  return h < 48 ? `${h.toFixed(1)} h` : `${(h / 24).toFixed(1)} d`;
}

// ---------------------------------------------------------------- revenue page

export type RevenuePage = B2cBase & {
  funnel: FunnelStep[];
  byRail: { rail: string; active: number; trialing: number }[];
  cohortPaid: { label: string; signups: number; purchased: number }[];
};

export async function loadRevenuePage(app: App, opts: B2cOpts): Promise<RevenuePage> {
  const l = await load(app, opts);
  const rev = await revenueFacts(app, l);
  const arrivals = arrivedIn(l.facts, l.windowWeeks);
  const checkoutViews = arrivals.filter((f) => f.checkoutViewAt !== null).length;
  const purchases = sumCohorts(l.cohorts, (c) => c.purchased);

  const tiles: Tile[] = [
    {
      key: "paying", label: "Paying customers", value: rev.error ? "—" : String(rev.paying),
      n: rev.error ? "no revenue source could be read" : nLine(rev.paying, rev.paying, `${rev.trialing} on trial, never counted as paying`),
      verdict: "none", verdictLabel: rev.error ? "not measurable" : "count",
      sources: rev.sources.length ? rev.sources : ["Stripe"], caveat: rev.error ?? undefined,
    },
    {
      key: "mrr", label: "MRR", value: rev.error ? "—" : `$${(rev.mrrCents / 100).toFixed(2)}`,
      n: rev.error ? "no revenue source could be read" : nLine(rev.paying, rev.paying, "normalised to a month from each plan's interval"),
      verdict: "none", verdictLabel: rev.error ? "not measurable" : "count",
      sources: rev.sources.length ? rev.sources : ["Stripe"],
    },
    {
      key: "checkout_to_paid", label: "Checkout → paid", value: ratioValue(purchases, checkoutViews),
      n: nLine(purchases, checkoutViews, "snippet checkout views in the window"),
      verdict: "none", verdictLabel: checkoutViews === 0 ? "no checkout views reported" : "count pair",
      sources: ["Snippet"],
      caveat: checkoutViews === 0 ? "Nothing is calling the checkout_view event yet, so this step is invisible." : undefined,
    },
    {
      key: "trial_to_paid", label: "Trial → paid",
      value: rev.trialStarts === 0 ? "—" : ratioValue(rev.trialConversions, rev.trialStarts),
      n: rev.trialStarts === 0 ? "no trial starts in the window" : nLine(rev.trialConversions, rev.trialStarts, "trials that reached a paid period"),
      ...(rev.trialStarts === 0
        ? { verdict: "none" as const, verdictLabel: "not measurable" }
        : judged(l, "trial_to_paid", rev.trialConversions, rev.trialStarts)),
      sources: rev.sources.length ? rev.sources : ["Stripe"],
      caveat: "Only rails that report trial and first-paid dates can answer this - Apple's reports do, some do not.",
    },
  ];

  const funnel: FunnelStep[] = [
    { key: "signup", label: "Signup", web: l.cohorts.reduce((a, c) => a + c.signupsWeb, 0), app: l.cohorts.reduce((a, c) => a + c.signupsApp, 0) },
    { key: "checkout_view", label: "Checkout viewed", web: arrivals.filter((f) => f.platform === "web" && f.checkoutViewAt !== null).length, app: arrivals.filter((f) => f.platform === "app" && f.checkoutViewAt !== null).length, caveat: "snippet event" },
    { key: "purchase", label: "Purchase", web: arrivals.filter((f) => f.platform === "web" && f.purchaseAt !== null).length, app: arrivals.filter((f) => f.platform === "app" && f.purchaseAt !== null).length },
    { key: "renewal", label: "First renewal", web: null, app: null, caveat: "no connected rail reports renewals per user yet" },
  ];

  return {
    window: windowOf(l),
    tiles,
    funnel,
    byRail: rev.byRail,
    cohortPaid: l.seriesCohorts.map((c) => ({ label: c.week.label, signups: c.signups, purchased: c.purchased })),
    notes: notesFor("revenue"),
    gates: l.gates,
    sourceErrors: { ...l.errors, ...(rev.error ? { revenue: rev.error } : {}) },
  };
}

// ---------------------------------------------------------------- coverage

export type CoverageRow = { metric: string; state: "live" | "partial" | "missing"; why: string; fix: string };

export type CoveragePage = B2cBase & { rows: CoverageRow[] };

/**
 * What this dashboard cannot answer for THIS app, and which connection would
 * fix each gap. The honest counterpart to every "—" on the other pages.
 */
export async function loadCoveragePage(app: App, opts: B2cOpts): Promise<CoveragePage> {
  const l = await load(app, opts);
  const rev = await revenueFacts(app, l);
  const arrivals = arrivedIn(l.facts, l.windowWeeks);
  const has = (pick: (f: VisitorFacts) => boolean) => l.facts.some(pick);
  const snippet = Boolean(l.app.snippetInstalledAt);

  const rows: CoverageRow[] = [
    {
      metric: "Signups, activation, retention cohorts",
      state: snippet ? "live" : "missing",
      why: snippet ? "the snippet reports signup and activation per anonymous id" : "the snippet has never reported an event",
      fix: snippet ? "—" : "Install the snippet and call window.fos('signup') and window.fos('activation').",
    },
    {
      metric: "Platform split (web vs app)",
      state: has((f) => f.platform === "app") ? "live" : "partial",
      why: has((f) => f.platform === "app") ? "the app reports installs with a store source" : "nothing has reported an install, so every visitor counts as web",
      fix: has((f) => f.platform === "app") ? "—" : "Send the install event from the app with utmSource set to the store.",
    },
    {
      metric: "Checkout → paid",
      state: has((f) => f.checkoutViewAt !== null) ? "live" : "missing",
      why: has((f) => f.checkoutViewAt !== null) ? "checkout views arrive from the snippet or our hosted pay page" : "nothing calls checkout_view, so the step before payment is invisible",
      fix: has((f) => f.checkoutViewAt !== null) ? "—" : "Call window.fos('checkout_view') when the paywall or pricing screen opens.",
    },
    {
      metric: "Paying customers and MRR",
      state: rev.error ? "missing" : rev.paying > 0 || rev.sources.length > 0 ? "live" : "missing",
      why: rev.error ? rev.error : rev.sources.length ? `read from ${rev.sources.join(", ")}` : "no revenue rail is connected",
      fix: rev.sources.length && !rev.error ? "—" : "Connect Stripe, the App Store, Lemon Squeezy or Paddle under Settings → Connect your Platforms.",
    },
    {
      metric: "Trial → paid, first renewal",
      state: rev.subs.some((s) => s.trialStartedAt) ? (rev.subs.some((s) => s.firstPaidAt) ? "live" : "partial") : "missing",
      why: rev.subs.some((s) => s.trialStartedAt)
        ? "trial dates arrive, and first-paid arrives only from rails that report it"
        : "no connected rail reports trial dates",
      fix: "Apple's subscriber reports carry both; Stripe carries trial start. Nothing here is inferred from a status alone.",
    },
    {
      metric: "Ad spend per campaign",
      state: "partial",
      why: "GA4 reports cost only when its Google Ads link delivers it; iOS App campaigns usually do not",
      fix: "Connect Google Ads directly, or type the spend in on the Attribution tab - both feed the campaign table there.",
    },
    {
      metric: "Push and lifecycle email (Loops)",
      state: "missing",
      why: "no push or email provider is connected, so Founder OS cannot see a single send",
      fix: "The Loops tab is laid out and locked. Connect a push or email provider under Settings → Connect your Platforms and it fills in.",
    },
    {
      metric: "In-app onboarding steps",
      state: "missing",
      why: "the snippet reports signup and activation, not each screen of your wizard",
      fix: "Call window.fos('activation') at the step that matters most; per-screen funnels would need an event per screen.",
    },
  ];

  return {
    window: windowOf(l),
    tiles: [
      {
        key: "measurable", label: "Metrics with a live source",
        value: `${rows.filter((r) => r.state === "live").length} of ${rows.length}`,
        n: `${rows.filter((r) => r.state === "partial").length} partial · ${rows.filter((r) => r.state === "missing").length} with no source`,
        verdict: "none", verdictLabel: "coverage", sources: ["Snippet"],
      },
      {
        key: "visitors", label: "Visitors seen in the window", value: String(arrivals.length),
        n: nLine(arrivals.length, arrivals.length, `${l.facts.length} across all loaded history`),
        verdict: "none", verdictLabel: "count", sources: ["Snippet"],
      },
    ],
    rows,
    notes: MEASUREMENT_NOTES,
    gates: l.gates,
    sourceErrors: { ...l.errors, ...(rev.error ? { revenue: rev.error } : {}) },
  };
}


// ---------------------------------------------------------------- loops

export type LoopsRow = { trigger: string; sent: string; opened: string; returned: string };

export type LoopsPage = B2cBase & {
  /** Locked until a push or email provider is connected. The layout is real; the numbers are not filled in. */
  locked: boolean;
  rows: LoopsRow[];
  nextStepRows: LoopsRow[];
};

/**
 * The day-two engine: push and lifecycle email. Founder OS cannot see either
 * until a provider is connected, so the page is LOCKED rather than removed -
 * it shows the shape of the answer, every figure reading "—", and says which
 * connection fills it. Nothing here is ever estimated.
 */
export async function loadLoopsPage(app: App, opts: B2cOpts): Promise<LoopsPage> {
  const l = await load(app, opts);
  const blank = (trigger: string): LoopsRow => ({ trigger, sent: "—", opened: "—", returned: "—" });

  return {
    window: windowOf(l),
    locked: true,
    tiles: [
      notMeasurable("push_opened", "Push opened", "no push provider is connected", "Connect one under Settings → Connect your Platforms.", ["Push"]),
      notMeasurable("push_returned", "Push → returned ≤ 48 h", "no push provider is connected", "This is the figure that matters: an open that produces nothing is not a win.", ["Push"]),
      notMeasurable("email_returned", "Email → returned ≤ 48 h", "no email provider is connected", "Connect SendGrid, Resend, Postmark or Customer.io.", ["Email"]),
      notMeasurable("reachable", "Reachable audience", "no push or email provider is connected", "Opted-in devices and addresses, once a provider can be read.", ["Push", "Email"]),
    ],
    rows: [blank("Daily reminder"), blank("Re-engagement"), blank("Trial reminder"), blank("Win-back"), blank("Weekly digest")],
    nextStepRows: [blank("In-app card"), blank("Push"), blank("Email")],
    notes: notesFor("loops"),
    gates: l.gates,
    sourceErrors: l.errors,
  };
}

export const B2C_PAGES = {
  overview: loadOverviewPage,
  acquisition: loadAcquisitionPage,
  activation: loadActivationPage,
  revenue: loadRevenuePage,
  loops: loadLoopsPage,
  coverage: loadCoveragePage,
} as const;

export type B2cPageKey = keyof typeof B2C_PAGES;

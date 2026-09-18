import { describe, expect, it } from "vitest";
import {
  ACTIVATION_HOURS, MIN_RATE_DENOMINATOR, NORTH_STAR_DAYS,
  buildCohorts, channelBreakdown, cohortTriangle, completeWeeks, deltaOf, funnelShares, isoWeekStart,
  judgeBand, nLine, notMeasurable, rate, ratioValue, retentionOf, snippetFunnel, visitorFacts,
  type Visitor,
} from "@/lib/domain/b2c";

const DAY = 86_400_000;
const HOUR = 3_600_000;
/** A Wednesday, so the "current week" is genuinely partial. */
const NOW = new Date("2026-09-16T12:00:00Z");

describe("weeks", () => {
  it("starts an ISO week on Monday UTC", () => {
    expect(new Date(isoWeekStart(new Date("2026-09-16T23:30:00Z"))).toISOString()).toBe("2026-09-14T00:00:00.000Z");
    expect(new Date(isoWeekStart(new Date("2026-09-14T00:00:00Z"))).toISOString()).toBe("2026-09-14T00:00:00.000Z");
    // Sunday belongs to the week that began the previous Monday.
    expect(new Date(isoWeekStart(new Date("2026-09-13T10:00:00Z"))).toISOString()).toBe("2026-09-07T00:00:00.000Z");
  });

  it("excludes the running week so a partial week never sits beside complete ones", () => {
    const weeks = completeWeeks(4, NOW);
    expect(weeks.map((w) => w.start)).toEqual(["2026-08-17", "2026-08-24", "2026-08-31", "2026-09-07"]);
    expect(weeks.every((w) => w.endMs <= isoWeekStart(NOW))).toBe(true);
  });
});

describe("presentation rules", () => {
  it("withholds a rate under the minimum denominator and gives the count pair instead", () => {
    expect(rate(3, 11)).toBeNull();
    expect(ratioValue(3, 11)).toBe("3 of 11");
    expect(rate(9, MIN_RATE_DENOMINATOR)).toBeCloseTo(0.3);
    expect(ratioValue(9, 30)).toBe("30%");
  });

  it("reads '—' when there is nothing to divide, never 0%", () => {
    expect(ratioValue(0, 0)).toBe("—");
    expect(nLine(0, 0)).toBe("no data yet");
  });

  it("keeps the count beside the rate", () => {
    expect(nLine(9, 34, "cohort elapsed")).toBe("9 of 34 · cohort elapsed");
  });

  it("colours a delta by direction times whether up is good", () => {
    expect(deltaOf(0.26, 0.22, { unit: "pts" })).toEqual({ dir: "up", text: "+4 pts" });
    // A rising failure rate is bad news, so it reads red.
    expect(deltaOf(0.041, 0.036, { unit: "pts", upIsGood: false })?.dir).toBe("down");
    expect(deltaOf(41, 29)).toEqual({ dir: "up", text: "+12 vs prior" });
    expect(deltaOf(5, null)).toBeUndefined();
  });

  it("never judges a band it has no value for", () => {
    expect(judgeBand(null, { min: 0.08 })).toBe("none");
    expect(judgeBand(0.07, { min: 0.08 })).toBe("warn");
    expect(judgeBand(0.09, { min: 0.08 })).toBe("good");
  });

  it("marks a metric with no source as not measurable, not zero", () => {
    const tile = notMeasurable("push", "Push opened", "no source", "connect one");
    expect(tile.value).toBe("—");
    expect(tile.verdict).toBe("none");
  });
});

// ------------------------------------------------------------------ cohorts

const visitor = (anonId: string, channel: string, platform: "web" | "app", events: [string, number][]): Visitor => ({
  anonId,
  channel,
  platform,
  events: events.map(([event, at]) => ({ event, at })),
});

const SIGNUP = new Date("2026-09-08T09:00:00Z").getTime(); // inside the Sep 7 week

describe("cohorts", () => {
  it("counts activation only inside the 24 h window", () => {
    const inTime = visitorFacts(visitor("a", "reddit", "web", [["signup", SIGNUP], ["activation", SIGNUP + 2 * HOUR]]));
    const tooLate = visitorFacts(visitor("b", "reddit", "web", [["signup", SIGNUP], ["activation", SIGNUP + (ACTIVATION_HOURS + 5) * HOUR]]));
    const [cohort] = buildCohorts([inTime, tooLate], completeWeeks(1, NOW), NOW);
    expect(cohort.signups).toBe(2);
    expect(cohort.activated).toBe(1);
  });

  it("counts the north star on the SECOND activation, within its window", () => {
    const came_back = visitorFacts(visitor("a", "reddit", "web", [["signup", SIGNUP], ["activation", SIGNUP + HOUR], ["activation", SIGNUP + 3 * DAY]]));
    const once_only = visitorFacts(visitor("b", "reddit", "web", [["signup", SIGNUP], ["activation", SIGNUP + HOUR]]));
    const too_late = visitorFacts(visitor("c", "reddit", "web", [["signup", SIGNUP], ["activation", SIGNUP + HOUR], ["activation", SIGNUP + (NORTH_STAR_DAYS + 2) * DAY]]));
    const [cohort] = buildCohorts([came_back, once_only, too_late], completeWeeks(1, NOW), NOW);
    expect(cohort.northStar).toBe(1);
    expect(cohort.northStarEligible).toBe(3);
  });

  it("holds a cohort out of a checkpoint until its window has elapsed", () => {
    // Signed up two days before "now": the D1 window has passed, D7 has not.
    const fresh = visitorFacts(visitor("a", "direct", "web", [["signup", NOW.getTime() - 2 * DAY], ["activation", NOW.getTime() - 2 * DAY + HOUR]]));
    const cohorts = buildCohorts([fresh], completeWeeks(2, NOW), NOW);
    const d7 = retentionOf(cohorts, 7);
    expect(d7.eligible).toBe(0);
    expect(d7.hit).toBe(0);
  });

  it("counts a retention hit only from activity inside the day-N window", () => {
    const signup = new Date("2026-08-19T10:00:00Z").getTime();
    const returned = visitorFacts(visitor("a", "direct", "web", [["signup", signup], ["activation", signup + 25 * HOUR]]));
    const vanished = visitorFacts(visitor("b", "direct", "web", [["signup", signup]]));
    const cohorts = buildCohorts([returned, vanished], completeWeeks(4, NOW), NOW);
    const d1 = retentionOf(cohorts, 1);
    expect(d1.eligible).toBe(2);
    expect(d1.hit).toBe(1);
  });

  it("splits a cohort by platform and counts a named source as attributed", () => {
    const facts = [
      visitorFacts(visitor("a", "reddit", "web", [["signup", SIGNUP]])),
      visitorFacts(visitor("b", "app_store", "app", [["install", SIGNUP - HOUR], ["signup", SIGNUP]])),
      visitorFacts(visitor("c", "direct", "web", [["signup", SIGNUP]])),
    ];
    const [cohort] = buildCohorts(facts, completeWeeks(1, NOW), NOW);
    expect([cohort.signupsWeb, cohort.signupsApp]).toEqual([2, 1]);
    expect(cohort.attributed).toBe(2); // direct is not a source you can act on
  });
});

describe("cohort triangle", () => {
  it("leaves a cell null until its week has elapsed, rather than showing 0%", () => {
    const signup = new Date("2026-09-08T09:00:00Z").getTime();
    const facts = [visitorFacts(visitor("a", "direct", "web", [["signup", signup]]))];
    const [row] = cohortTriangle(facts, completeWeeks(1, NOW), NOW, 4);
    expect(row.n).toBe(1);
    expect(row.cells[0]).toBe(1); // W0: they were there when they signed up
    expect(row.cells[1]).toBeNull(); // W1 has not finished yet
    expect(row.cells.slice(2).every((c) => c === null)).toBe(true);
  });
});

describe("channels", () => {
  it("sorts by paying customers, not by volume", () => {
    const facts = [
      ...Array.from({ length: 20 }, (_, i) => visitorFacts(visitor(`loud${i}`, "x", "web", [["signup", SIGNUP]]))),
      visitorFacts(visitor("quiet", "reddit", "web", [["signup", SIGNUP], ["activation", SIGNUP + HOUR], ["purchase", SIGNUP + 2 * HOUR]])),
    ];
    const rows = channelBreakdown(facts);
    expect(rows[0].channel).toBe("reddit");
    expect(rows[0].purchased).toBe(1);
    expect(rows[1].signups).toBe(20);
  });

  it("ignores visitors who never signed up", () => {
    expect(channelBreakdown([visitorFacts(visitor("a", "reddit", "web", [["pageview", SIGNUP]]))])).toEqual([]);
  });
});

describe("funnel", () => {
  it("shares each step against the top and the step above", () => {
    const facts = [
      visitorFacts(visitor("a", "reddit", "web", [["pageview", SIGNUP - HOUR], ["signup", SIGNUP], ["activation", SIGNUP + HOUR]])),
      visitorFacts(visitor("b", "reddit", "web", [["pageview", SIGNUP - HOUR], ["signup", SIGNUP]])),
      visitorFacts(visitor("c", "reddit", "web", [["pageview", SIGNUP - HOUR]])),
    ];
    const steps = snippetFunnel(facts);
    expect(steps.map((s) => s.web)).toEqual([3, 2, 1, 0, 0, 0]);
    const shares = funnelShares(steps);
    expect(shares[1].webShare).toBeCloseTo(2 / 3);
    expect(shares[1].prevPct).toBe("67%");
  });

  it("keeps a step no source reports as null rather than 0", () => {
    const shares = funnelShares([
      { key: "signup", label: "Signup", web: 10, app: 4 },
      { key: "renewal", label: "First renewal", web: null, app: null },
    ]);
    expect(shares[1].webShare).toBeNull();
    expect(shares[1].prevPct).toBe("");
  });
});

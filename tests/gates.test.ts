import { describe, expect, it } from "vitest";
import {
  GATE_METRICS, INDUSTRIES, NATURES,
  categoryGates, gateFor, judgeAgainstGate, mergeGates, parseGateSet, parseResearchedGates,
  type Gate,
} from "@/lib/domain/gates";
import { MEASUREMENT_NOTES, NOTE_SURFACES, notesFor } from "@/lib/domain/notes";

const NOW = new Date("2026-09-18T00:00:00Z");

describe("categoryGates", () => {
  it("gives every industry and nature a usable set, so a new app is never ungated", () => {
    for (const industry of INDUSTRIES) {
      for (const nature of NATURES) {
        const set = categoryGates({ industry, nature }, NOW);
        expect(set.gates.length).toBeGreaterThan(0);
        for (const g of set.gates) {
          expect(GATE_METRICS).toContain(g.metric);
          expect(g.target).toBeGreaterThanOrEqual(0);
          expect(g.target).toBeLessThanOrEqual(1);
          // A gate with no provenance is worse than no gate.
          expect(g.source.length).toBeGreaterThan(8);
        }
      }
    }
  });

  it("uses the category's own retention band where one is published", () => {
    const fitness = gateFor(categoryGates({ industry: "health_fitness", nature: "app_subscription" }, NOW), "d7");
    const generic = gateFor(categoryGates({ industry: "productivity", nature: "app_subscription" }, NOW), "d7");
    expect(fitness?.target).toBeCloseTo(0.08);
    expect(generic?.target).toBeCloseTo(0.13); // all-category median
    expect(fitness?.source).toContain("Health & fitness");
  });

  it("moves the conversion gate with how the thing is sold, not with the industry", () => {
    const trial = gateFor(categoryGates({ industry: "health_fitness", nature: "app_subscription" }, NOW), "signup_to_paid");
    const freemium = gateFor(categoryGates({ industry: "health_fitness", nature: "freemium" }, NOW), "signup_to_paid");
    expect(trial?.target).not.toBe(freemium?.target);
  });

  it("gives B2B its own churn number rather than the consumer one", () => {
    const b2b = gateFor(categoryGates({ industry: "b2b_saas", nature: "web_subscription" }, NOW), "churn_30d");
    const consumer = gateFor(categoryGates({ industry: "productivity", nature: "web_subscription" }, NOW), "churn_30d");
    expect(b2b?.target).toBeCloseTo(0.035);
    expect(b2b?.target).not.toBe(consumer?.target);
  });

  it("sets no churn gate on a one-off purchase, because there is nothing to churn from", () => {
    expect(gateFor(categoryGates({ industry: "other", nature: "one_off" }, NOW), "churn_30d")).toBeUndefined();
  });

  it("says when a band is a proxy rather than the category's own data", () => {
    const set = categoryGates({ industry: "mental_health", nature: "app_subscription" }, NOW);
    expect(set.notes.join(" ")).toContain("closest honest proxy");
  });
});

describe("parseResearchedGates", () => {
  it("keeps a gate with a number and a source", () => {
    const [g] = parseResearchedGates([{ metric: "d7", target: 0.11, low: 0.08, high: 0.15, source: "Category report, 2026" }]);
    expect(g.target).toBeCloseTo(0.11);
    expect(g.origin).toBe("researched");
    expect(g.band).toEqual({ low: 0.08, high: 0.15 });
  });

  it("accepts a percentage as well as a fraction", () => {
    expect(parseResearchedGates([{ metric: "d1", target: "24%", source: "Published elsewhere, 2026" }])[0].target).toBeCloseTo(0.24);
    expect(parseResearchedGates([{ metric: "d1", target: 24, source: "Published elsewhere, 2026" }])[0].target).toBeCloseTo(0.24);
  });

  it("throws away anything it cannot attribute or bound", () => {
    expect(parseResearchedGates([{ metric: "d7", target: 0.1 }])).toEqual([]); // no source
    expect(parseResearchedGates([{ metric: "d7", target: 0.1, source: "short" }])).toEqual([]); // source too thin to be one
    expect(parseResearchedGates([{ metric: "made_up", target: 0.1, source: "Somewhere real, 2026" }])).toEqual([]);
    expect(parseResearchedGates([{ metric: "d7", source: "Somewhere real, 2026" }])).toEqual([]); // no number
    expect(parseResearchedGates([{ metric: "d7", target: -1, source: "Somewhere real, 2026" }])).toEqual([]);
    expect(parseResearchedGates([{ metric: "d7", target: 400, source: "Somewhere real, 2026" }])).toEqual([]);
    expect(parseResearchedGates("not an array")).toEqual([]);
  });

  it("keeps the first of a duplicated metric", () => {
    const out = parseResearchedGates([
      { metric: "d7", target: 0.1, source: "First source, 2026" },
      { metric: "d7", target: 0.2, source: "Second source, 2026" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].target).toBeCloseTo(0.1);
  });

  it("drops a band it cannot order, keeping the target", () => {
    const [g] = parseResearchedGates([{ metric: "d7", target: 0.1, low: 0.5, high: 0.2, source: "Published somewhere, 2026" }]);
    expect(g.band).toBeNull();
  });
});

describe("mergeGates", () => {
  const base = categoryGates({ industry: "health_fitness", nature: "app_subscription" }, NOW);

  it("lets a researched gate win its metric and keeps the category gate everywhere else", () => {
    const researched: Gate[] = [{ metric: "d7", target: 0.12, band: null, source: "Two comparable apps, 2026", origin: "researched" }];
    const merged = mergeGates(base, researched, { competitors: ["Rival A"], now: NOW });
    expect(gateFor(merged, "d7")?.target).toBeCloseTo(0.12);
    expect(gateFor(merged, "d7")?.origin).toBe("researched");
    expect(gateFor(merged, "d1")?.origin).toBe("category");
    expect(merged.origin).toBe("mixed");
    expect(merged.competitors).toEqual(["Rival A"]);
  });

  it("returns the base untouched when research found nothing", () => {
    expect(mergeGates(base, [])).toBe(base);
  });
});

describe("judgeAgainstGate", () => {
  const gate = gateFor(categoryGates({ industry: "health_fitness", nature: "app_subscription" }, NOW), "d7")!;

  it("passes and fails against the target, naming the source", () => {
    const pass = judgeAgainstGate(0.09, gate, 120, 30);
    expect(pass.verdict).toBe("good");
    expect(pass.label).toBe("on gate");
    expect(pass.target).toContain("Health & fitness");
    expect(judgeAgainstGate(0.05, gate, 120, 30).verdict).toBe("warn");
  });

  it("refuses to judge on a handful of people, and still shows the gate", () => {
    const j = judgeAgainstGate(0.5, gate, 6, 30);
    expect(j.verdict).toBe("none");
    expect(j.label).toContain("n too small");
    expect(j.target).toContain("Gate:");
  });

  it("treats a missing value as an absence, not a failure", () => {
    expect(judgeAgainstGate(null, gate, 200, 30).verdict).toBe("none");
  });

  it("says so when the metric has no gate", () => {
    expect(judgeAgainstGate(0.2, undefined, 200, 30).label).toContain("no gate");
  });

  it("reads churn the other way round, since lower is better", () => {
    const churn = gateFor(categoryGates({ industry: "b2b_saas", nature: "web_subscription" }, NOW), "churn_30d")!;
    expect(judgeAgainstGate(0.02, churn, 120, 30).verdict).toBe("good");
    expect(judgeAgainstGate(0.09, churn, 120, 30).verdict).toBe("warn");
    expect(judgeAgainstGate(0.02, churn, 120, 30).target).toContain("≤");
  });
});

describe("parseGateSet", () => {
  it("round-trips a stored set", () => {
    const set = categoryGates({ industry: "finance", nature: "app_subscription" }, NOW);
    const back = parseGateSet(JSON.parse(JSON.stringify(set)));
    expect(back?.gates.length).toBe(set.gates.length);
    expect(back?.profile).toEqual(set.profile);
  });

  it("reads junk as absent rather than throwing", () => {
    expect(parseGateSet(null)).toBeNull();
    expect(parseGateSet({ profile: { industry: "x", nature: "y" } })).toBeNull();
    const salvaged = parseGateSet({ profile: { industry: "nope", nature: "nope" }, gates: [{ metric: "bogus", target: 1 }, { metric: "d7", target: 0.1 }] });
    expect(salvaged?.profile.industry).toBe("other");
    expect(salvaged?.gates.map((g) => g.metric)).toEqual(["d7"]);
  });
});

describe("measurement notes", () => {
  it("gives every note a home, so none can exist without being shown", () => {
    for (const n of MEASUREMENT_NOTES) {
      expect(n.surfaces.length).toBeGreaterThan(0);
      for (const s of n.surfaces) expect(NOTE_SURFACES).toContain(s);
    }
  });

  it("puts each note on the page whose number it qualifies, and on coverage", () => {
    expect(notesFor("acquisition").map((n) => n.key)).toContain("platform_from_install");
    expect(notesFor("activation").map((n) => n.key)).toContain("cohort_identity");
    expect(notesFor("revenue").map((n) => n.key)).toContain("checkout_view_coverage");
    expect(notesFor("loops").map((n) => n.key)).toContain("loops_locked");
    expect(notesFor("coverage")).toHaveLength(MEASUREMENT_NOTES.length);
    // Overview carries none: a note belongs beside the number it qualifies.
    expect(notesFor("overview")).toEqual([]);
  });
});

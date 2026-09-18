import { describe, expect, it } from "vitest";
import {
  PMF_NOT_YET, PMF_QUESTIONS, PMF_STEPS, PMF_TECHNIQUE,
  pmfStateFor, stepOf, type PmfStepKey,
} from "@/lib/domain/pmf";

describe("the framework as ported", () => {
  it("keeps the five steps in her order", () => {
    expect(PMF_STEPS.map((s) => s.key)).toEqual<PmfStepKey[]>(["bar", "qualitative", "quantitative", "prioritise", "kpis"]);
    expect(PMF_STEPS.map((s) => s.n)).toEqual([1, 2, 3, 4, 5]);
  });

  it("gives every step a purpose, a body, at least one quote and something to do", () => {
    for (const s of PMF_STEPS) {
      expect(s.purpose.length).toBeGreaterThan(10);
      expect(s.body.length).toBeGreaterThan(0);
      expect(s.quotes.length).toBeGreaterThan(0);
      expect(s.actions.length).toBeGreaterThan(0);
      for (const q of s.quotes) expect(q.text.length).toBeGreaterThan(20);
    }
  });

  it("keeps her rule against em dashes across every ported string", () => {
    const all = [
      ...PMF_STEPS.flatMap((s) => [s.title, s.purpose, ...s.body, ...s.actions, ...s.quotes.map((q) => `${q.text} ${q.note ?? ""}`)]),
      ...PMF_QUESTIONS.flatMap((q) => [q.label, q.intro, ...q.questions]),
      ...PMF_TECHNIQUE,
      ...PMF_NOT_YET.flatMap((n) => [n.rule, n.because]),
    ];
    for (const s of all) expect(s).not.toContain("—");
  });

  it("asks users and decision-makers separately, as she insists", () => {
    expect(PMF_QUESTIONS.map((q) => q.audience).sort()).toEqual(["decision_maker", "user"]);
    const user = PMF_QUESTIONS.find((q) => q.audience === "user")!;
    expect(user.questions).toContain("Walk me through your day to day.");
    expect(user.questions).toContain("Why did you decide to open this app?");
    const buyer = PMF_QUESTIONS.find((q) => q.audience === "decision_maker")!;
    expect(buyer.questions).toContain("What are your KPIs?");
  });

  it("carries the technique rules the questions depend on", () => {
    const joined = PMF_TECHNIQUE.join(" ").toLowerCase();
    expect(joined).toContain("open questions");
    expect(joined).toContain("never lead");
    expect(joined).toContain("screen share");
  });
});

describe("pmfStateFor", () => {
  it("starts at the bar when nobody has paid", () => {
    expect(pmfStateFor({ payingUsers: 0, hasAnalytics: true, checkoutLive: true }).step).toBe("bar");
    expect(pmfStateFor({ payingUsers: null, hasAnalytics: false, checkoutLive: false }).step).toBe("bar");
  });

  it("sends a founder with a handful of customers to the conversations, not the research", () => {
    const s = pmfStateFor({ payingUsers: 4, hasAnalytics: true, checkoutLive: true });
    expect(s.step).toBe("qualitative");
    expect(s.reason).toContain("4 paying customer");
  });

  it("fixes measurement before research once there are enough customers to see patterns", () => {
    expect(pmfStateFor({ payingUsers: 40, hasAnalytics: false, checkoutLive: true }).step).toBe("kpis");
  });

  it("moves to the research only with customers and measurement in place", () => {
    expect(pmfStateFor({ payingUsers: 40, hasAnalytics: true, checkoutLive: true }).step).toBe("quantitative");
  });

  it("treats ordering as the bottleneck at scale", () => {
    expect(pmfStateFor({ payingUsers: 200, hasAnalytics: true, checkoutLive: true }).step).toBe("prioritise");
  });

  it("always resolves to a real step", () => {
    for (const paying of [0, 1, 10, 11, 50, 51, 5000]) {
      for (const hasAnalytics of [true, false]) {
        const s = pmfStateFor({ payingUsers: paying, hasAnalytics, checkoutLive: true });
        expect(stepOf(s.step).key).toBe(s.step);
        expect(s.reason.length).toBeGreaterThan(10);
      }
    }
  });
});

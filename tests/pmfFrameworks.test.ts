import { describe, expect, it } from "vitest";
import {
  DEFAULT_FRAMEWORK, PMF_FRAMEWORKS, PMF_FRAMEWORK_IDS,
  asFrameworkId, fieldsOfStage, frameworkOf, stageOfField,
} from "@/lib/domain/pmfFrameworks";
import { isPlaceholder, parseModelValues, scaffoldDoc } from "@/lib/domain/pmfDoc";
import { readTable } from "@/lib/domain/pmfTable";
import { PMF_STEPS } from "@/lib/domain/pmf";

const NOW = new Date("2026-09-18T10:00:00Z");
const INPUT = { appName: "Selvenn", url: "https://selvenn.com", industryLabel: "Mental health & wellbeing", natureLabel: "Mobile app subscription (with a trial)", payingUsers: 4 };

describe("the registry", () => {
  it("holds both frameworks and resolves an id safely", () => {
    expect(PMF_FRAMEWORK_IDS).toEqual(["conversation", "build"]);
    expect(asFrameworkId("build")).toBe("build");
    expect(asFrameworkId("nonsense")).toBe(DEFAULT_FRAMEWORK);
    expect(asFrameworkId(undefined)).toBe(DEFAULT_FRAMEWORK);
    expect(frameworkOf("build").id).toBe("build");
  });

  it("gives every framework stages, fields, a source and rules", () => {
    for (const f of Object.values(PMF_FRAMEWORKS)) {
      expect(f.stages.length).toBeGreaterThan(0);
      expect(f.fields.length).toBeGreaterThan(0);
      expect(f.rules.length).toBeGreaterThan(0);
      expect(f.source.length).toBeGreaterThan(10);
      expect(f.stages.map((s) => s.n)).toEqual(f.stages.map((_, i) => i + 1));
    }
  });

  it("puts every field on a stage that exists, and every stage has a field", () => {
    for (const f of Object.values(PMF_FRAMEWORKS)) {
      const stages = new Set(f.stages.map((s) => s.key));
      for (const field of f.fields) expect(stages.has(field.stage), `${f.id}:${field.key}`).toBe(true);
      for (const s of f.stages) expect(fieldsOfStage(f, s.key).length, `${f.id}:${s.key}`).toBeGreaterThan(0);
      expect(new Set(f.fields.map((x) => x.key)).size).toBe(f.fields.length);
    }
  });

  it("keeps the conversation framework identical to the ported source of truth", () => {
    // domain/pmf.ts stays the record of what she said; the registry wraps it.
    expect(PMF_FRAMEWORKS.conversation.stages.map((s) => s.key)).toEqual(PMF_STEPS.map((s) => s.key));
    expect(PMF_FRAMEWORKS.conversation.stages[0].quotes[0].text).toBe(PMF_STEPS[0].quotes[0].text);
  });

  it("carries the build framework's nine stages in the doc's order", () => {
    expect(PMF_FRAMEWORKS.build.stages.map((s) => s.key)).toEqual([
      "goal", "segment", "problem", "solutions", "metrics", "jtbd", "platform", "engine", "validate",
    ]);
  });

  it("finds the stage a field belongs to", () => {
    expect(stageOfField(PMF_FRAMEWORKS.build, "journey")?.key).toBe("problem");
    expect(stageOfField(PMF_FRAMEWORKS.build, "not_a_field")).toBeUndefined();
  });

  it("uses no em dashes in any framework's copy", () => {
    for (const f of Object.values(PMF_FRAMEWORKS)) {
      const all = [f.title, f.tagline, ...f.intro, ...f.rules, ...f.fields.flatMap((x) => [x.label, x.prompt]),
        ...f.stages.flatMap((s) => [s.title, s.purpose, ...s.body, ...s.actions, ...s.quotes.map((q) => q.text)])];
      for (const t of all) expect(t, `${f.id}`).not.toContain("—");
    }
  });
});

describe("the build framework's first rule", () => {
  it("declares that the tool may not answer for the founder", () => {
    expect(PMF_FRAMEWORKS.build.aiRole).toBe("pressure_test");
    expect(PMF_FRAMEWORKS.conversation.aiRole).toBe("fill");
    expect(PMF_FRAMEWORKS.build.rules[0]).toContain("The ideas should be yours");
  });

  it("scaffolds every text field as a question, never an answer", () => {
    const doc = scaffoldDoc(PMF_FRAMEWORKS.build, INPUT, NOW);
    expect(doc.framework).toBe("build");
    for (const field of PMF_FRAMEWORKS.build.fields.filter((f) => !f.table)) {
      expect(isPlaceholder(doc.values[field.key]), field.key).toBe(true);
      expect(doc.values[field.key]).toContain("Selvenn");
    }
  });

  it("scaffolds a table field as genuinely empty, because its columns come from answers that do not exist yet", () => {
    const doc = scaffoldDoc(PMF_FRAMEWORKS.build, INPUT, NOW);
    for (const field of PMF_FRAMEWORKS.build.fields.filter((f) => f.table)) {
      const table = readTable(doc.values[field.key]);
      expect(table.columns, field.key).toEqual([]);
      expect(table.rows, field.key).toEqual([]);
    }
  });
});

describe("parseModelValues is per framework", () => {
  it("accepts a field of the framework it was given", () => {
    expect(parseModelValues(PMF_FRAMEWORKS.build, { values: { journey: "They open YouTube." } })).toEqual({ journey: "They open YouTube." });
  });

  it("drops a field belonging to the OTHER framework", () => {
    // hurt_sentence is a conversation field; it must not land in a build doc.
    expect(parseModelValues(PMF_FRAMEWORKS.build, { values: { hurt_sentence: "x" } })).toEqual({});
    expect(parseModelValues(PMF_FRAMEWORKS.conversation, { values: { journey: "x" } })).toEqual({});
  });
});

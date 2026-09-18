import { describe, expect, it } from "vitest";
import {
  answeredCount, completion, incompleteStages, isPlaceholder,
  MAX_TEXT_VALUE,
  nextVersion, parseModelValues, parseStoredValues, scaffoldDoc, type PmfDoc,
} from "@/lib/domain/pmfDoc";
import { MAX_COLUMNS, MAX_ROWS, readTable, serializeTable, tableAnswered, type PmfTable } from "@/lib/domain/pmfTable";
import { PMF_FRAMEWORKS, fieldsOfStage } from "@/lib/domain/pmfFrameworks";
import { extractJson } from "@/lib/services/ai";

const NOW = new Date("2026-09-18T10:00:00Z");
const F = PMF_FRAMEWORKS.conversation;
const PMF_FIELDS = F.fields;
const PMF_STEPS = F.stages;
const INPUT = { appName: "Selvenn", url: "https://selvenn.com", industryLabel: "Mental health & wellbeing", natureLabel: "Mobile app subscription (with a trial)", payingUsers: 4 };

describe("fields", () => {
  it("covers every step of the framework and nothing else", () => {
    const steps = new Set(PMF_FIELDS.map((f) => f.stage));
    for (const s of PMF_STEPS) expect(steps.has(s.key)).toBe(true);
    for (const s of PMF_STEPS) expect(fieldsOfStage(F, s.key).length).toBeGreaterThan(0);
    expect(new Set(PMF_FIELDS.map((f) => f.key)).size).toBe(PMF_FIELDS.length);
  });

  it("uses no em dashes, the way the rest of the ported framework does not", () => {
    for (const f of PMF_FIELDS) {
      expect(f.label).not.toContain("—");
      expect(f.prompt).not.toContain("—");
    }
  });
});

describe("scaffoldDoc", () => {
  const doc = scaffoldDoc(F, INPUT, NOW);

  it("is version 1 and says it is only a draft", () => {
    expect(doc.version).toBe(1);
    expect(doc.source).toBe("scaffold");
    expect(doc.comment).toBeNull();
  });

  it("answers every field with a question aimed at this business, never a guess", () => {
    for (const f of PMF_FIELDS) {
      const v = doc.values[f.key];
      expect(v, f.key).toBeTruthy();
      expect(isPlaceholder(v), f.key).toBe(true);
    }
    expect(doc.values.hurt_sentence).toContain("Selvenn");
    expect(doc.values.interview_plan).toContain("4 paying customers");
    expect(doc.framework).toBe("conversation");
  });

  it("speaks of first customers when nobody has paid", () => {
    const empty = scaffoldDoc(F, { ...INPUT, payingUsers: 0 }, NOW);
    expect(empty.values.interview_plan).toContain("your first customers");
  });
});

describe("completion", () => {
  const real: PmfDoc = { framework: "conversation", version: 2, source: "edited", comment: null, createdAt: NOW.toISOString(), values: { hurt_sentence: "They lose the evening check-in.", mechanism: "Revenue, roughly $10 a week." } };

  it("counts answered fields, placeholders included, and reports the open step", () => {
    expect(answeredCount(F, real)).toBe(2);
    expect(completion(F, real)).toBeCloseTo(2 / PMF_FIELDS.length);
    expect(incompleteStages(F, real)[0]).toBe("qualitative");
    expect(incompleteStages(F, null)).toEqual(PMF_STEPS.map((s) => s.key));
  });

  it("treats whitespace as unanswered", () => {
    expect(answeredCount(F, { values: { hurt_sentence: "   " } })).toBe(0);
  });
});

describe("parseModelValues", () => {
  it("keeps known fields and drops everything else", () => {
    const out = parseModelValues(F, { values: { hurt_sentence: " They lose it. ", invented_field: "nope", mechanism: 42 } });
    expect(out).toEqual({ hurt_sentence: "They lose it." });
  });

  it("accepts a bare object as well as one wrapped in values", () => {
    expect(parseModelValues(F, { mechanism: "Cost." })).toEqual({ mechanism: "Cost." });
  });

  it("drops empty strings rather than storing a blank answer", () => {
    expect(parseModelValues(F, { values: { mechanism: "   " } })).toEqual({});
  });

  it("survives junk", () => {
    expect(parseModelValues(F, null)).toEqual({});
    expect(parseModelValues(F, "text")).toEqual({});
    expect(parseModelValues(F, { values: "text" })).toEqual({});
  });

  it("bounds a field so one runaway answer cannot fill the column", () => {
    const long = "x".repeat(5_000);
    expect(parseModelValues(F, { values: { mechanism: long } }).mechanism?.length).toBe(2_000);
  });
});

describe("nextVersion", () => {
  const v1: PmfDoc = { framework: "conversation", version: 1, source: "scaffold", comment: null, createdAt: NOW.toISOString(), values: { hurt_sentence: "[to fill] a", mechanism: "[to fill] b" } };

  it("increments and carries forward what the new values do not cover", () => {
    const v2 = nextVersion("conversation", v1, { hurt_sentence: "They lose the coach." }, { source: "edited", now: NOW });
    expect(v2.version).toBe(2);
    expect(v2.values.hurt_sentence).toBe("They lose the coach.");
    expect(v2.values.mechanism).toBe("[to fill] b"); // untouched, not dropped
    expect(v2.source).toBe("edited");
  });

  it("keeps the comment with the version it produced", () => {
    const v2 = nextVersion("conversation", v1, { mechanism: "Revenue." }, { source: "rewritten", comment: "Only in-house teams now.", now: NOW });
    expect(v2.comment).toBe("Only in-house teams now.");
    expect(v2.source).toBe("rewritten");
  });

  it("starts at 1 when there is nothing before it", () => {
    expect(nextVersion("conversation", null, {}, { source: "scaffold", now: NOW }).version).toBe(1);
  });

  it("never mutates the version it came from", () => {
    const before = JSON.stringify(v1);
    nextVersion("conversation", v1, { hurt_sentence: "changed" }, { source: "edited", now: NOW });
    expect(JSON.stringify(v1)).toBe(before);
  });
});

describe("storage round trip", () => {
  it("reads a stored jsonb map back, dropping anything unrecognised", () => {
    expect(parseStoredValues(F, { mechanism: "Cost.", bogus: "x" })).toEqual({ mechanism: "Cost." });
    expect(parseStoredValues(F, null)).toEqual({});
  });
});

describe("extractJson", () => {
  it("finds the object in a fenced or chatty reply", () => {
    expect(extractJson('Sure!\n```json\n{"values":{"mechanism":"Cost."}}\n```')).toEqual({ values: { mechanism: "Cost." } });
    expect(extractJson("no json here")).toBeNull();
    expect(extractJson('{"broken": ')).toBeNull();
  });
});

describe("a table field survives the round trip through storage", () => {
  const BUILD = PMF_FRAMEWORKS.build;
  const TABLE_FIELD = BUILD.fields.find((f) => f.table)!;

  // A full table is far longer than a prose answer. Truncating it does not
  // shorten it, it corrupts the JSON and the table reads back empty - which is
  // exactly what happened before the cap became field-aware.
  const big: PmfTable = {
    columns: Array.from({ length: MAX_COLUMNS }, (_, i) => ({
      key: `c${i}`,
      label: `Column ${i}`,
      kind: "text" as const,
      anchors: "a".repeat(300),
      why: "w".repeat(200),
    })),
    rows: Array.from({ length: MAX_ROWS }, (_, r) => ({
      id: `r${r}`,
      cells: Object.fromEntries(Array.from({ length: MAX_COLUMNS }, (_, i) => [`c${i}`, "x".repeat(600)])),
    })),
  };

  it("stores the whole table, not the first 2,000 characters", () => {
    const serialized = serializeTable(big);
    expect(serialized.length).toBeGreaterThan(2_000);
    const stored = parseStoredValues(BUILD, { [TABLE_FIELD.key]: serialized });
    expect(stored[TABLE_FIELD.key]).toBe(serialized);
    const back = readTable(stored[TABLE_FIELD.key]);
    expect(back.columns).toHaveLength(MAX_COLUMNS);
    expect(back.rows).toHaveLength(MAX_ROWS);
    expect(tableAnswered(back)).toBe(true);
  });

  it("still bounds a prose field at 2,000 characters", () => {
    const prose = BUILD.fields.find((f) => !f.table)!;
    const stored = parseStoredValues(BUILD, { [prose.key]: "y".repeat(5_000) });
    expect(stored[prose.key]).toHaveLength(MAX_TEXT_VALUE);
  });
});

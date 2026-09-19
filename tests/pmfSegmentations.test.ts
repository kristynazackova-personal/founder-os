import { describe, expect, it } from "vitest";
import {
  MAX_ROWS_PER_SEGMENTATION,
  MAX_SEGMENTATIONS,
  MIN_SEGMENTATIONS,
  SEGMENTATION_FIELD,
  SELF_DESCRIPTION_COLUMN,
  parseSegmentations,
  segmentationsPrompt,
} from "@/lib/domain/pmfSegmentations";
import { TABLE_PROMPTS } from "@/lib/domain/pmfPrompts";
import { PMF_FRAMEWORKS } from "@/lib/domain/pmfFrameworks";
import { ANSWER_RULES } from "@/lib/domain/pmfAnswers";

const SPEC = TABLE_PROMPTS.segment;
const prompt = segmentationsPrompt(SPEC, { business: "Selvenn", answers: "Goal: see what is happening" });

describe("what the prompt asks for", () => {
  it("asks for whole alternatives, not one set of rows", () => {
    expect(prompt).toContain("COMPLETE alternative");
    expect(prompt).toContain(String(MIN_SEGMENTATIONS));
    expect(prompt).toContain(String(MAX_SEGMENTATIONS));
  });

  // A row per diagnosis is the trap the founder walked into out loud, and it
  // is two problems at once: a clinical claim, and a label that does not
  // predict a purchase.
  it("refuses a clinical label as a row, and gives the label its own field", () => {
    expect(prompt).toMatch(/A row is a SITUATION, never a label/);
    expect(prompt).toContain("Depression");
    expect(prompt).toMatch(/ADHD/);
    expect(prompt).toMatch(/selfDescription/);
    expect(prompt).toMatch(/search box/);
  });

  // Someone with a diagnosis can be in any of the situational rows, so a
  // table holding both is not mutually exclusive even though each row reads
  // fine alone. This is why axes are offered whole.
  it("forbids mixing axes inside one segmentation", () => {
    expect(prompt).toMatch(/Never mix axes/);
    expect(prompt).toMatch(/overlap/);
  });

  it("requires every axis to name what it costs", () => {
    expect(prompt).toMatch(/`hides` is required/);
    expect(prompt).toMatch(/no downside has not been thought about/);
  });

  it("carries the answer rules, like every other generator", () => {
    for (const rule of ANSWER_RULES) expect(prompt).toContain(rule);
  });

  it("is the segment table's question, and that table exists", () => {
    const field = PMF_FRAMEWORKS.build.fields.find((f) => f.key === SEGMENTATION_FIELD);
    expect(field?.table).toBe(true);
    expect(SPEC.field).toBe(SEGMENTATION_FIELD);
  });
});

describe("reading the model's answer", () => {
  const ok = {
    segmentations: [
      {
        axis: "By what they have already tried",
        why: "It predicts what they will pay",
        hides: "Frames you as the cheap substitute",
        rows: [
          { situation: "Cannot afford a therapist and has stopped looking", selfDescription: "therapy is too expensive" },
          { situation: "In therapy now and adrift between sessions", selfDescription: "I forget what we talked about" },
        ],
      },
    ],
  };

  it("reads a well-formed answer", () => {
    const [o] = parseSegmentations(ok);
    expect(o?.axis).toBe("By what they have already tried");
    expect(o?.rows).toHaveLength(2);
    expect(o?.rows[1]?.selfDescription).toBe("I forget what we talked about");
  });

  it("returns nothing rather than guessing", () => {
    expect(parseSegmentations(null)).toEqual([]);
    expect(parseSegmentations({})).toEqual([]);
    expect(parseSegmentations({ segmentations: "two of them" })).toEqual([]);
  });

  // An axis with no rows cannot be compared against one that has them, and
  // choosing it would empty the table.
  it("drops an axis with no rows, and a row with no situation", () => {
    expect(parseSegmentations({ segmentations: [{ axis: "By vibe", rows: [] }] })).toEqual([]);
    const [o] = parseSegmentations({
      segmentations: [{ axis: "A", rows: [{ situation: "" }, { situation: "Real one" }] }],
    });
    expect(o?.rows).toEqual([{ situation: "Real one", selfDescription: "" }]);
  });

  it("caps both the alternatives and their rows", () => {
    const many = {
      segmentations: Array.from({ length: 9 }, (_, i) => ({
        axis: `axis ${i}`,
        rows: Array.from({ length: 20 }, (_, j) => ({ situation: `row ${j}` })),
      })),
    };
    const out = parseSegmentations(many);
    expect(out).toHaveLength(MAX_SEGMENTATIONS);
    for (const o of out) expect(o.rows.length).toBeLessThanOrEqual(MAX_ROWS_PER_SEGMENTATION);
  });

  it("survives a missing why and hides without dropping the axis", () => {
    const [o] = parseSegmentations({ segmentations: [{ axis: "A", rows: [{ situation: "s" }] }] });
    expect(o?.why).toBe("");
    expect(o?.hides).toBe("");
  });
});

describe("the column a chosen segmentation needs", () => {
  // The label does the acquisition job; it needs somewhere to live that is
  // not the row, or it gets merged back into the situation it was split from.
  it("names the self-description column", () => {
    expect(SELF_DESCRIPTION_COLUMN.key).toBe("self_description");
    expect(SELF_DESCRIPTION_COLUMN.prompt).toMatch(/search box/);
  });
});

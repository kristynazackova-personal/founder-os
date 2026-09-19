import { describe, expect, it } from "vitest";
import { JOB_SECONDS, jobWait, type PmfJobKind } from "@/lib/domain/pmfJobKinds";
import { COLUMN_RULES, TABLE_PROMPTS, columnPrompt } from "@/lib/domain/pmfPrompts";
import { MODEL_FOR, TIMEOUT_FOR } from "@/lib/services/ai";

describe("telling the founder how long a generation takes", () => {
  it("covers every kind of generation", () => {
    const kinds: PmfJobKind[] = ["doc", "rewrite", "prefill", "table", "rows", "segmentations"];
    expect(Object.keys(JOB_SECONDS).sort()).toEqual([...kinds].sort());
  });

  // A range someone can plan around beats a number that is wrong by 40%.
  it("rounds to something honest rather than precise", () => {
    expect(jobWait("prefill")).toBe("about a minute");
    expect(jobWait("segmentations")).toBe("about 3 minutes");
    for (const kind of Object.keys(JOB_SECONDS) as PmfJobKind[]) {
      expect(jobWait(kind)).toMatch(/^about /);
    }
  });
});

describe("how long we wait for the model", () => {
  // 60 seconds for everything timed out the segmentations call, which is the
  // one that asks for several complete alternatives with their reasoning.
  it("gives every purpose a deadline, and the long ones longer", () => {
    expect(Object.keys(TIMEOUT_FOR).sort()).toEqual(Object.keys(MODEL_FOR).sort());
    for (const ms of Object.values(TIMEOUT_FOR)) expect(ms).toBeGreaterThan(60_000);
    expect(TIMEOUT_FOR.segmentations).toBeGreaterThan(TIMEOUT_FOR.table_rows);
  });
});

describe("what a column may be called", () => {
  // The observed one was "Pay-strength at $5.99/week". Today's price is one
  // product's current setting, and writing it into the question presumes the
  // business model the table exists to help choose - a professional reselling
  // this to their own clients pays differently and still belongs in the table.
  it("keeps prices and plan names out of column names", () => {
    const rule = COLUMN_RULES.join(" ");
    expect(rule).toMatch(/column NAME carries no price/);
    expect(rule).toMatch(/presumes the business model/);
    expect(rule).toMatch(/anchors/);
    expect(columnPrompt(TABLE_PROMPTS.segment, { business: "X", answers: "" })).toMatch(/carries no price/);
  });
});

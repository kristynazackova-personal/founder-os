import { describe, expect, it } from "vitest";
import {
  MAX_COLUMNS, MAX_ROWS, blankRow, cellValue, parseTable, readTable, rowsFromForm, serializeTable, tableAnswered,
  renderTableForPrompt, withRowLabelColumn, type PmfColumn, type PmfTable,
} from "@/lib/domain/pmfTable";
import { COLUMN_RULES, ROW_RULES, TABLE_PROMPTS, columnPrompt, rowPrompt, tableStageForField } from "@/lib/domain/pmfPrompts";
import { PMF_FRAMEWORKS } from "@/lib/domain/pmfFrameworks";

const COLS = [
  { key: "group", label: "User group", kind: "text" },
  { key: "size", label: "Size", kind: "choice", options: ["S", "M", "L"] },
  { key: "severity", label: "Severity", kind: "scale", min: 1, max: 10, anchors: "1 = rare, 10 = most people" },
];

describe("parseTable", () => {
  it("keeps well-formed columns and rows", () => {
    const t = parseTable({ columns: COLS, rows: [{ id: "r1", cells: { group: "Students", size: "M" } }] });
    expect(t.columns.map((c) => c.key)).toEqual(["group", "size", "severity"]);
    expect(t.rows[0].cells).toEqual({ group: "Students", size: "M" });
    expect(t.columns[2].anchors).toContain("1 = rare");
  });

  it("drops a cell whose column does not exist, rather than keeping an unreadable row", () => {
    const t = parseTable({ columns: COLS, rows: [{ id: "r1", cells: { group: "Students", ghost: "x" } }] });
    expect(t.rows[0].cells).toEqual({ group: "Students" });
  });

  it("demotes a choice column with no options to text, so the cell is still editable", () => {
    const t = parseTable({ columns: [{ label: "Fit", kind: "choice" }], rows: [] });
    expect(t.columns[0].kind).toBe("text");
  });

  it("makes a key from the label when one is missing, and never collides", () => {
    const t = parseTable({ columns: [{ label: "Pay strength" }, { label: "Pay strength" }], rows: [] });
    expect(t.columns).toHaveLength(1);
    expect(t.columns[0].key).toBe("pay_strength");
  });

  it("caps columns and rows so one bad answer cannot produce an unusable form", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ label: `C${i}`, kind: "text" }));
    const rows = Array.from({ length: 40 }, (_, i) => ({ id: `r${i}`, cells: { c0: "x" } }));
    const t = parseTable({ columns: many, rows });
    expect(t.columns.length).toBe(MAX_COLUMNS);
    expect(t.rows.length).toBe(MAX_ROWS);
  });

  it("survives junk", () => {
    expect(parseTable(null).columns).toEqual([]);
    expect(parseTable("text").rows).toEqual([]);
    expect(parseTable({ columns: "no", rows: 3 })).toEqual({ columns: [], rows: [] });
  });
});

describe("answeredness", () => {
  it("counts a table as answered only once a row has content", () => {
    expect(tableAnswered({ columns: COLS as never, rows: [] })).toBe(false);
    expect(tableAnswered({ columns: COLS as never, rows: [{ id: "r1", cells: {} }] })).toBe(false);
    expect(tableAnswered({ columns: COLS as never, rows: [{ id: "r1", cells: { group: "Students" } }] })).toBe(true);
  });

  it("round-trips through storage", () => {
    const t = parseTable({ columns: COLS, rows: [{ id: "r1", cells: { group: "Students" } }] });
    expect(readTable(serializeTable(t))).toEqual(t);
    expect(readTable("not json").columns).toEqual([]);
    expect(readTable(undefined).rows).toEqual([]);
  });
});

describe("rowsFromForm", () => {
  const cols = parseTable({ columns: COLS, rows: [] }).columns;

  it("rebuilds rows from <column>__<row id> fields, in order", () => {
    const rows = rowsFromForm(cols, [
      ["group__a", "Students"],
      ["size__a", "M"],
      ["group__b", "Teachers"],
      ["__columns", "{}"],
    ]);
    expect(rows).toEqual([
      { id: "a", cells: { group: "Students", size: "M" } },
      { id: "b", cells: { group: "Teachers" } },
    ]);
  });

  it("drops an empty row instead of saving a blank line", () => {
    expect(rowsFromForm(cols, [["group__a", "   "], ["size__a", ""]])).toEqual([]);
  });

  it("ignores a field naming a column that is not in the stored set", () => {
    // This is the guard: the form cannot introduce a column the founder never saw.
    expect(rowsFromForm(cols, [["ghost__a", "x"], ["group__a", "Students"]])[0].cells).toEqual({ group: "Students" });
  });

  it("gives each new row a distinct id", () => {
    const t = { columns: cols, rows: [] };
    expect(blankRow(t).id).not.toBe(blankRow({ ...t, rows: [blankRow(t)] }).id);
  });
});

describe("the generation prompts", () => {
  it("has one spec per tabular field of the build framework", () => {
    const tableFields = PMF_FRAMEWORKS.build.fields.filter((f) => f.table).map((f) => f.key);
    expect(tableFields.sort()).toEqual(["pains", "segment_list", "solution_options"]);
    for (const key of tableFields) expect(tableStageForField(key)).toBeTruthy();
    for (const spec of Object.values(TABLE_PROMPTS)) {
      expect(tableFields).toContain(spec.field);
      expect(spec.research).toMatch(/^docs\/research\/pmf-build\/.+\.md$/);
      expect(spec.reads.length).toBeGreaterThan(0);
      expect(spec.cautions.length).toBeGreaterThan(0);
    }
  });

  it("tells the column prompt to derive parameters from the answers above, and quotes her licence to change them", () => {
    const p = columnPrompt(TABLE_PROMPTS.segment, { business: "Selvenn", answers: "Goal: impact over revenue" });
    expect(p).toContain("Goal: impact over revenue");
    expect(p).toContain("feel free to add or remove the parameters");
    expect(p).toContain("pay-strength");
    for (const rule of COLUMN_RULES) expect(p).toContain(rule);
    expect(p).toContain('"columns"');
  });

  it("holds the row prompt to the framework's first rule", () => {
    const p = rowPrompt(TABLE_PROMPTS.problem, { business: "Selvenn", answers: "", columns: "- severity (Severity, scale: 1 to 10)" });
    expect(p).toContain("The ideas should be yours");
    for (const rule of ROW_RULES) expect(p).toContain(rule);
    expect(p).toContain("[to fill]");
    expect(p).toContain('"rows"');
  });

  it("keeps the research findings that change the answer", () => {
    // Frequency reorders a pain list more than any other column.
    expect(TABLE_PROMPTS.problem.candidates).toContain("Frequency");
    // RICE needs numbers a pre-interview founder does not have.
    expect(TABLE_PROMPTS.solutions.cautions.join(" ")).toContain("RICE");
    // Reachability is the column founders leave out.
    expect(TABLE_PROMPTS.segment.candidates).toContain("Reachability");
  });

  it("uses no em dashes, like every other ported string", () => {
    const all = Object.values(TABLE_PROMPTS).flatMap((s) => [s.title, s.defaults, s.candidates, s.rowShape, ...s.cautions]);
    for (const t of [...all, ...COLUMN_RULES, ...ROW_RULES]) expect(t).not.toContain("—");
  });
});

describe("a cell is read against its own column", () => {
  const choice: PmfColumn = { key: "size", label: "Size", kind: "choice", options: ["S", "M", "L"] };
  const scale: PmfColumn = { key: "sev", label: "Severity", kind: "scale", min: 1, max: 10 };
  const text: PmfColumn = { key: "who", label: "Who", kind: "text" };

  it("keeps a listed option, case-insensitively", () => {
    expect(cellValue(choice, " l ")).toBe("L");
  });

  // The select has no such option, so keeping it would show "-" on the page
  // while the stored document said something else.
  it("drops a choice value that is not an option, questions included", () => {
    expect(cellValue(choice, "[to fill] how big is this group?")).toBe("");
  });

  it("keeps a number in range and drops one outside it", () => {
    expect(cellValue(scale, "7")).toBe("7");
    expect(cellValue(scale, "11")).toBe("");
    expect(cellValue(scale, "high")).toBe("");
  });

  it("lets a text cell carry the question", () => {
    expect(cellValue(text, "[to fill] who exactly?")).toBe("[to fill] who exactly?");
  });

  it("applies the same rules to a table from the model", () => {
    const t = parseTable({
      columns: [choice, text],
      rows: [{ cells: { size: "XL", who: "Students revising for finals" } }],
    });
    expect(t.rows[0].cells).toEqual({ who: "Students revising for finals" });
  });
});

describe("the row-label column", () => {
  const scoring: PmfColumn[] = [
    { key: "size", label: "Size", kind: "choice", options: ["S", "M", "L"] },
    { key: "urgency", label: "Urgency", kind: "choice", options: ["L", "M", "H"] },
  ];

  it("is added in front when the model returned only parameters", () => {
    const out = withRowLabelColumn(scoring, "User or use case", "Who they are.");
    expect(out[0]).toMatchObject({ key: "user_or_use_case", label: "User or use case", kind: "text" });
    expect(out).toHaveLength(3);
  });

  it("leaves a table that already leads with a text column alone", () => {
    const already: PmfColumn[] = [{ key: "pain", label: "Pain point", kind: "text" }, ...scoring];
    expect(withRowLabelColumn(already, "Pain point", "…")).toBe(already);
  });

  it("drops the weakest parameter rather than the name when the set is full", () => {
    const full: PmfColumn[] = Array.from({ length: MAX_COLUMNS }, (_, i) => ({
      key: `c${i}`,
      label: `C${i}`,
      kind: "choice" as const,
      options: ["Y", "N"],
    }));
    const out = withRowLabelColumn(full, "Solution idea", "The idea in one line.");
    expect(out).toHaveLength(MAX_COLUMNS);
    expect(out[0].key).toBe("solution_idea");
    expect(out.some((c) => c.key === `c${MAX_COLUMNS - 1}`)).toBe(false);
  });
});

describe("every table prompt names its row-label column", () => {
  it("states it in the column prompt", () => {
    for (const spec of Object.values(TABLE_PROMPTS)) {
      expect(spec.rowLabel.label.length).toBeGreaterThan(0);
      expect(columnPrompt(spec, { business: "X", answers: "" })).toContain(spec.rowLabel.label);
    }
  });
});

describe("an earlier table reaches a later stage's prompt", () => {
  const t: PmfTable = {
    columns: [
      { key: "who", label: "User or use case", kind: "text" },
      { key: "size", label: "Size", kind: "choice", options: ["S", "M", "L"] },
    ],
    rows: [
      { id: "r1", cells: { who: "University students cramming for finals", size: "L" } },
      { id: "r2", cells: {} },
    ],
  };

  it("renders the filled rows with their column labels", () => {
    const out = renderTableForPrompt(t, "Target user");
    expect(out).toContain("Target user");
    expect(out).toContain("User or use case: University students cramming for finals");
    expect(out).toContain("Size: L");
  });

  // A row the founder never touched says nothing, so it is not context.
  it("drops empty rows, and renders nothing when the table is untouched", () => {
    expect(renderTableForPrompt(t, "Target user").split("\n")).toHaveLength(2);
    expect(renderTableForPrompt({ columns: t.columns, rows: [{ id: "r1", cells: {} }] }, "X")).toBe("");
  });
});

describe("the problem table keeps the journey outside the product", () => {
  it("says so in both the row shape and the cautions", () => {
    const spec = TABLE_PROMPTS.problem;
    expect(spec.rowShape).toContain("without this product in it");
    expect(spec.cautions.join(" ")).toContain("inside this product's own interface");
  });
});

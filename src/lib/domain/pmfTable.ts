/**
 * Tables inside a framework document: rows the founder adds, and columns the
 * tool derives per business.
 *
 * Her doc gives three stages a table - target users, pains, solutions - with
 * suggested columns and an explicit invitation to change them:
 *
 *   "Feel free to add or remove the parameters I proposed to look at based on
 *   what you care about. E.g., do you not care about profit? Then don't look
 *   at the willingness to pay or pay strength."
 *
 * So the column set is an OUTPUT of the framework rather than part of its
 * definition, derived from the stages above (docs/research/pmf-build/columns.md).
 * A table field's stored value is JSON: its columns and its rows together, so
 * a row can never be read against the wrong column set.
 *
 * Pure. No DB, no env, no network.
 */

export const COLUMN_KINDS = ["text", "choice", "scale"] as const;
export type ColumnKind = (typeof COLUMN_KINDS)[number];

export type PmfColumn = {
  /** Stable key, used as the cell's key in a row. */
  key: string;
  label: string;
  kind: ColumnKind;
  /** For `choice`: the allowed values, in order. e.g. ["S", "M", "L"]. */
  options?: string[];
  /** For `scale`: inclusive bounds. */
  min?: number;
  max?: number;
  /**
   * What the ends of the scale or the options MEAN for this business. A
   * severity of 1-10 without anchors is two people scoring three apart.
   */
  anchors?: string;
  /** Why this column is here rather than one of the others. */
  why?: string;
};

export type PmfRow = {
  id: string;
  /** Column key -> cell value, always as text so a half-filled row is legal. */
  cells: Record<string, string>;
};

export type PmfTable = { columns: PmfColumn[]; rows: PmfRow[] };

export const EMPTY_TABLE: PmfTable = { columns: [], rows: [] };

/** Three is the floor for comparison, six the ceiling before nobody fills it in. */
export const MIN_COLUMNS = 3;
export const MAX_COLUMNS = 6;
export const MAX_ROWS = 20;

const slug = (s: string, fallback: string): string => {
  const out = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return out || fallback;
};

/**
 * Validate a table from the model or from storage. Anything that would make a
 * row unreadable is dropped rather than repaired: a cell whose column does not
 * exist, a column with no key, a choice column with no options.
 */
export function parseTable(input: unknown): PmfTable {
  if (!input || typeof input !== "object") return EMPTY_TABLE;
  const raw = input as { columns?: unknown; rows?: unknown };

  const columns: PmfColumn[] = [];
  const seen = new Set<string>();
  if (Array.isArray(raw.columns)) {
    for (const c of raw.columns.slice(0, MAX_COLUMNS)) {
      if (!c || typeof c !== "object") continue;
      const o = c as Record<string, unknown>;
      const label = typeof o.label === "string" ? o.label.trim().slice(0, 60) : "";
      if (!label) continue;
      const key = slug(typeof o.key === "string" ? o.key : label, `col_${columns.length + 1}`);
      if (seen.has(key)) continue;
      const kind: ColumnKind = (COLUMN_KINDS as readonly string[]).includes(String(o.kind)) ? (o.kind as ColumnKind) : "text";
      const options = Array.isArray(o.options)
        ? o.options.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim().slice(0, 24)).slice(0, 8)
        : undefined;
      // A choice column with nothing to choose from is a text column.
      const resolved: ColumnKind = kind === "choice" && (!options || options.length === 0) ? "text" : kind;
      columns.push({
        key,
        label,
        kind: resolved,
        ...(resolved === "choice" ? { options } : {}),
        ...(resolved === "scale"
          ? { min: Number.isFinite(Number(o.min)) ? Number(o.min) : 1, max: Number.isFinite(Number(o.max)) ? Number(o.max) : 10 }
          : {}),
        ...(typeof o.anchors === "string" && o.anchors.trim() ? { anchors: o.anchors.trim().slice(0, 300) } : {}),
        ...(typeof o.why === "string" && o.why.trim() ? { why: o.why.trim().slice(0, 200) } : {}),
      });
      seen.add(key);
    }
  }

  const byKey = new Map(columns.map((c) => [c.key, c]));
  const rows: PmfRow[] = [];
  if (Array.isArray(raw.rows)) {
    for (const r of raw.rows.slice(0, MAX_ROWS)) {
      if (!r || typeof r !== "object") continue;
      const o = r as { id?: unknown; cells?: unknown };
      const cells: Record<string, string> = {};
      if (o.cells && typeof o.cells === "object") {
        for (const [k, v] of Object.entries(o.cells as Record<string, unknown>)) {
          const column = byKey.get(slug(k, ""));
          if (!column || typeof v !== "string") continue;
          const text = cellValue(column, v);
          if (text) cells[column.key] = text;
        }
      }
      rows.push({ id: typeof o.id === "string" && o.id.trim() ? o.id.trim().slice(0, 40) : `r${rows.length + 1}`, cells });
    }
  }
  return { columns, rows };
}

/**
 * A cell read against its own column.
 *
 * A choice cell that is not one of the options, or a scale cell that is not a
 * number in range, is DROPPED rather than kept: the control cannot show it, so
 * keeping it would mean the page displays "-" while the document says
 * something else. Text cells take anything, which is where a `[to fill]`
 * question belongs.
 */
export function cellValue(column: PmfColumn, raw: string): string {
  const text = raw.trim().slice(0, 600);
  if (!text) return "";
  if (column.kind === "choice") {
    const match = column.options?.find((o) => o.toLowerCase() === text.toLowerCase());
    return match ?? "";
  }
  if (column.kind === "scale") {
    const n = Number(text);
    if (!Number.isFinite(n)) return "";
    const min = column.min ?? 1;
    const max = column.max ?? 10;
    return n < min || n > max ? "" : String(n);
  }
  return text;
}

/**
 * Guarantee the column that NAMES the row, as the first one.
 *
 * A table of six scoring parameters and no label is a scorecard with nothing
 * on it. The prompt asks for this column; this is the backstop for a model
 * that returns six parameters and forgets what it is scoring. Adding it can
 * push the set over `MAX_COLUMNS`, in which case the last parameter goes -
 * losing a parameter costs less than losing the row's identity.
 */
export function withRowLabelColumn(columns: PmfColumn[], label: string, why: string): PmfColumn[] {
  // A leading free-text column already names the row, whatever it is called.
  if (columns[0]?.kind === "text") return columns;
  const key = slug(label, "row_label");
  const rest = columns.filter((c) => c.key !== key);
  return [{ key, label, kind: "text" as const, why }, ...rest].slice(0, MAX_COLUMNS);
}

/**
 * An already-filled table, rendered for the prompt of a LATER stage.
 *
 * The chain the framework describes is segment -> pains -> solutions, so the
 * pains table has to see which segments the founder actually wrote and how
 * they scored, and the solutions table has to see the pains. Passing only the
 * prose fields, as this used to, left each table deriving its columns from
 * stage 1 alone.
 *
 * Empty rows are dropped: a row the founder has not touched says nothing.
 */
export function renderTableForPrompt(t: PmfTable, label: string): string {
  const filled = t.rows.filter((r) => Object.values(r.cells).some((v) => v.trim().length > 0));
  if (filled.length === 0) return "";
  const lines = filled.map((r, i) => {
    const cells = t.columns
      .map((c) => (r.cells[c.key] ? `${c.label}: ${r.cells[c.key]}` : null))
      .filter(Boolean)
      .join(" | ");
    return `${i + 1}. ${cells}`;
  });
  return [`${label} (what they have filled in so far):`, ...lines].join("\n");
}

export const serializeTable = (t: PmfTable): string => JSON.stringify(t);

/** A table is answered once a row has something in it - columns alone are a form, not an answer. */
export const tableAnswered = (t: PmfTable): boolean => t.rows.some((r) => Object.values(r.cells).some((v) => v.trim().length > 0));

export const isTableValue = (v: string | undefined): boolean => Boolean(v && v.trim().startsWith("{"));

/** Read a stored field value as a table, whatever shape it is in. */
export function readTable(value: string | undefined): PmfTable {
  if (!value || !isTableValue(value)) return EMPTY_TABLE;
  try {
    return parseTable(JSON.parse(value));
  } catch {
    return EMPTY_TABLE;
  }
}

/** A blank row, for the "add a row" button. */
export const blankRow = (t: PmfTable): PmfRow => ({ id: `r${Date.now().toString(36)}${t.rows.length}`, cells: {} });

/** Turn form fields named `<column key>__<row id>` back into rows, preserving order. */
export function rowsFromForm(columns: PmfColumn[], entries: Iterable<[string, FormDataEntryValue]>): PmfRow[] {
  const byRow = new Map<string, Record<string, string>>();
  const order: string[] = [];
  for (const [name, value] of entries) {
    const at = name.indexOf("__");
    if (at <= 0 || typeof value !== "string") continue;
    const key = name.slice(0, at);
    const rowId = name.slice(at + 2);
    const column = columns.find((c) => c.key === key);
    if (!column) continue;
    if (!byRow.has(rowId)) {
      byRow.set(rowId, {});
      order.push(rowId);
    }
    const text = cellValue(column, value);
    if (text) byRow.get(rowId)![key] = text;
  }
  return order
    .map((id) => ({ id, cells: byRow.get(id) ?? {} }))
    .filter((r) => Object.keys(r.cells).length > 0)
    .slice(0, MAX_ROWS);
}

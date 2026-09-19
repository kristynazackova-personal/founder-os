"use client";

/**
 * A framework table: rows the founder edits, against columns the tool derived
 * from the stages above.
 *
 * The columns are NOT editable here and are not submitted by the form - they
 * come from the stored table (`__columns`), so a row can never be saved
 * against a column set the founder was not looking at. Re-deriving them is a
 * deliberate act: the "Generate with AI" button, and "Re-derive columns"
 * once a table exists - both run the same action.
 *
 * Saving appends a version, like every other edit in this framework.
 */
import { useActionState, useState } from "react";
import { generateTableAction, saveTableAction, type PmfFormState } from "@/app/actions/pmf";
import { blankRow, serializeTable, type PmfColumn, type PmfRow, type PmfTable } from "@/lib/domain/pmfTable";
import type { PmfFrameworkId } from "@/lib/domain/pmfFrameworks";

function Status({ state }: { state: PmfFormState }) {
  if (!state) return null;
  if (state.error) return <p className="text-sm text-red-700">{state.error}</p>;
  if (state.ok) return <p className="text-sm text-emerald-700">{state.ok}</p>;
  return null;
}

function Cell({ column, row, value }: { column: PmfColumn; row: PmfRow; value: string }) {
  const name = `${column.key}__${row.id}`;
  if (column.kind === "choice" && column.options?.length) {
    return (
      <select name={name} defaultValue={value} className="select min-h-10 py-1 text-sm" aria-label={column.label}>
        <option value="">-</option>
        {column.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  if (column.kind === "scale") {
    return (
      <input
        type="number"
        name={name}
        defaultValue={value}
        min={column.min ?? 1}
        max={column.max ?? 10}
        className="input min-h-10 py-1 text-sm"
        aria-label={column.label}
      />
    );
  }
  return <input name={name} defaultValue={value} className="input min-h-10 py-1 text-sm" aria-label={column.label} />;
}

export function FrameworkTable({
  appId,
  framework,
  field,
  table,
  prompt,
}: {
  appId: string;
  framework: PmfFrameworkId;
  field: string;
  table: PmfTable;
  prompt: string;
}) {
  const [rows, setRows] = useState<PmfRow[]>(table.rows.length ? table.rows : [blankRow(table)]);
  const [saveState, saveAction, saving] = useActionState<PmfFormState, FormData>(
    saveTableAction.bind(null, appId, framework, field),
    undefined,
  );
  const [genState, genAction, generating] = useActionState<PmfFormState>(
    generateTableAction.bind(null, appId, framework, field),
    undefined,
  );

  if (table.columns.length === 0) {
    return (
      <div className="mt-5 rounded-xl border border-dashed border-stone-300 bg-stone-50 p-5">
        <div className="text-sm font-semibold">No columns yet</div>
        <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
          {prompt} The parameters are chosen from what you answered in the stages above this one, so fill those in first
          and then let it pick.
        </p>
        <form action={genAction} className="mt-3 flex flex-wrap items-center gap-3">
          <button type="submit" className="btn btn-primary btn-sm" disabled={generating}>
            {generating ? "Generating…" : "Generate with AI"}
          </button>
          <Status state={genState} />
        </form>
      </div>
    );
  }

  return (
    <div className="mt-5 flex flex-col gap-3 rounded-xl border border-stone-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">Your table</div>
          <p className="mt-0.5 text-xs text-[var(--muted)]">{prompt}</p>
        </div>
        <form action={genAction}>
          <button type="submit" className="btn btn-secondary btn-sm" disabled={generating}>
            {generating ? "Re-deriving…" : "Re-derive columns"}
          </button>
        </form>
      </div>
      <Status state={genState} />

      <form action={saveAction} className="flex flex-col gap-3">
        {/* The columns travel with the form so the server saves against the set that was on screen. */}
        <input type="hidden" name="__columns" value={serializeTable({ columns: table.columns, rows: [] })} />
        <div className="scroll-x">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {table.columns.map((c) => (
                  <th
                    key={c.key}
                    className="border-b border-stone-200 px-2 py-1.5 text-left text-[11px] font-semibold tracking-wide text-[var(--muted)] uppercase"
                  >
                    <span className="block whitespace-nowrap">{c.label}</span>
                    <span className="block text-[10px] font-normal normal-case">
                      {c.kind === "choice" && c.options ? c.options.join(" / ") : c.kind === "scale" ? `${c.min} to ${c.max}` : "text"}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  {table.columns.map((c) => (
                    <td key={c.key} className="border-b border-stone-100 px-1 py-1.5 align-top">
                      <Cell column={c} row={r} value={r.cells[c.key] ?? ""} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setRows((prev) => [...prev, blankRow({ columns: table.columns, rows: prev })])}
          >
            Add a row
          </button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
            {saving ? "Saving…" : "Save as a new version"}
          </button>
          <Status state={saveState} />
        </div>
      </form>

      <details className="text-xs text-[var(--muted)]">
        <summary className="cursor-pointer">Why these columns</summary>
        <ul className="mt-2 flex flex-col gap-1.5">
          {table.columns.map((c) => (
            <li key={c.key}>
              <b>{c.label}</b>
              {c.anchors ? ` - ${c.anchors}` : ""}
              {c.why ? <span className="block">{c.why}</span> : null}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

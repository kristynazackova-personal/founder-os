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
import {
  chooseSegmentationAction,
  generateRowsAction,
  generateTableAction,
  proposeSegmentationsAction,
  saveTableAction,
  type JobState,
  type PmfFormState,
} from "@/app/actions/pmf";
import { useJob } from "./useJob";
import { JobBanner } from "./JobBanner";
import { jobWait } from "@/lib/domain/pmfJobKinds";
import { parseSegmentations } from "@/lib/domain/pmfSegmentations";
import {
  blankRow,
  serializeTable,
  type PmfColumn,
  type PmfRow,
  type PmfTable,
} from "@/lib/domain/pmfTable";
import type { PmfFrameworkId } from "@/lib/domain/pmfFrameworks";
import {
  SEGMENTATION_FIELD,
  type SegmentationOption,
} from "@/lib/domain/pmfSegmentations";

function Status({ state }: { state: PmfFormState }) {
  if (!state) return null;
  if (state.error) return <p className="text-sm text-red-700">{state.error}</p>;
  if (state.ok) return <p className="text-sm text-emerald-700">{state.ok}</p>;
  return null;
}

function Cell({
  column,
  row,
  value,
}: {
  column: PmfColumn;
  row: PmfRow;
  value: string;
}) {
  const name = `${column.key}__${row.id}`;
  if (column.kind === "choice" && column.options?.length) {
    return (
      <select
        name={name}
        defaultValue={value}
        className="select min-h-10 py-1 text-sm"
        aria-label={column.label}
      >
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
  // A text cell holds a whole segment description or a `[to fill]` question,
  // and a single-line input shows the first three words of it. The founder is
  // being asked to COMPARE these against each other, which they cannot do
  // through a truncation, so it wraps and grows with its content.
  return (
    <textarea
      name={name}
      defaultValue={value}
      rows={2}
      ref={autoHeight}
      onInput={(e) => autoHeight(e.currentTarget)}
      className="textarea min-h-10 resize-y py-1 text-sm leading-snug"
      aria-label={column.label}
    />
  );
}

/** Grow a textarea to its content. Runs on mount via the ref, and on input. */
function autoHeight(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

/**
 * Whole alternative ways to split the market, side by side.
 *
 * A MECE list is only MECE with respect to an axis, and the generator used to
 * pick one silently. Showing the alternatives with what each one HIDES is the
 * point: the founder is choosing a company, not a set of rows, and the axis is
 * where that choice actually lives. So this is the FIRST thing in the section,
 * above the columns - deriving parameters before the axis is settled is work
 * the next choice throws away.
 *
 * Choosing replaces the rows rather than adding to them, because rows drawn
 * from two axes overlap even when each one reads fine on its own.
 */
function SegmentationCompare({
  appId,
  framework,
  field,
}: {
  appId: string;
  framework: PmfFrameworkId;
  field: string;
}) {
  const [state, propose, proposing] = useActionState<JobState>(
    proposeSegmentationsAction.bind(null, appId, framework, field),
    undefined,
  );
  const job = useJob(appId, state);
  const [pickState, pick, picking] = useActionState<PmfFormState, FormData>(
    chooseSegmentationAction.bind(null, appId, framework, field),
    undefined,
  );

  // The alternatives are the one generation whose output is not a document
  // version, so they arrive on the job row and are read back out here.
  const options = job?.status === "done" ? parseSegmentations(job.result) : [];

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-stone-200 bg-white p-4">
      <div>
        <div className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
          Step 1 - how to split
        </div>
        <p className="mt-0.5 text-xs leading-relaxed text-[var(--muted)]">
          A list of users is only exhaustive with respect to one way of dividing
          them. Compare the ways first: the axis decides what the rows and the
          columns can be.
        </p>
      </div>
      <form action={propose}>
        <button
          type="submit"
          className="btn btn-secondary btn-sm"
          disabled={proposing}
        >
          {proposing
            ? "Starting…"
            : `Compare ways to split (${jobWait("segmentations")})`}
        </button>
      </form>
      <JobBanner state={state} job={job} />
      <Status state={pickState} />

      {options.length > 0 ? (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-[var(--muted)]">
            Each of these is a complete alternative, not a menu to mix. Rows
            from two different axes overlap even when every row looks right on
            its own.
          </p>
          {options.map((o: SegmentationOption) => (
            <div
              key={o.axis}
              className="rounded-xl border border-stone-200 bg-stone-50 p-4"
            >
              <div className="text-sm font-semibold">{o.axis}</div>
              {o.why ? (
                <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                  {o.why}
                </p>
              ) : null}
              {o.hides ? (
                <p className="mt-1.5 text-xs leading-relaxed">
                  <b>What it hides:</b> {o.hides}
                </p>
              ) : null}
              <ul className="mt-2.5 flex flex-col gap-1.5">
                {o.rows.map((r) => (
                  <li key={r.situation} className="text-xs leading-relaxed">
                    {r.situation}
                    {r.selfDescription ? (
                      <span className="block text-[var(--muted)]">
                        They say: {r.selfDescription}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
              <form action={pick} className="mt-3">
                {/* Wrapped as the model's own shape so the server re-reads it with the same parser. */}
                <input
                  type="hidden"
                  name="__segmentation"
                  value={JSON.stringify({ segmentations: [o] })}
                />
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={picking}
                >
                  Use this one
                </button>
              </form>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
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
  const [rows, setRows] = useState<PmfRow[]>(
    table.rows.length ? table.rows : [blankRow(table)],
  );
  const [saveState, saveAction, saving] = useActionState<
    PmfFormState,
    FormData
  >(saveTableAction.bind(null, appId, framework, field), undefined);
  const [genState, genAction, generating] = useActionState<JobState>(
    generateTableAction.bind(null, appId, framework, field),
    undefined,
  );
  const genJob = useJob(appId, genState);
  // Rows on their own: re-deriving replaces the columns the founder just
  // approved, which is the wrong price for a second opinion on the rows.
  const [rowState, rowAction, drafting] = useActionState<JobState>(
    generateRowsAction.bind(null, appId, framework, field),
    undefined,
  );
  const rowJob = useJob(appId, rowState);

  if (table.columns.length === 0) {
    return (
      <div className="mt-5 flex flex-col gap-4">
        {field === SEGMENTATION_FIELD ? (
          <SegmentationCompare
            appId={appId}
            framework={framework}
            field={field}
          />
        ) : null}
        <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-5">
          {field === SEGMENTATION_FIELD ? (
            <div className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
              Step 2 - the parameters
            </div>
          ) : null}
          <div className="mt-0.5 text-sm font-semibold">No columns yet</div>
          <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
            {prompt} The parameters are chosen from what you answered in the
            stages above this one, so fill those in first and then let it pick.
          </p>
          <form
            action={genAction}
            className="mt-3 flex flex-wrap items-center gap-3"
          >
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={generating}
            >
              {generating
                ? "Starting…"
                : `Generate with AI (${jobWait("table")})`}
            </button>
          </form>
          <div className="mt-2">
            <JobBanner state={genState} job={genJob} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-5 flex flex-col gap-4">
      {field === SEGMENTATION_FIELD ? (
        <SegmentationCompare
          appId={appId}
          framework={framework}
          field={field}
        />
      ) : null}
      <div className="flex flex-col gap-3 rounded-xl border border-stone-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
              Your table
            </div>
            <p className="mt-0.5 text-xs text-[var(--muted)]">{prompt}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <form action={rowAction}>
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={drafting || generating}
              >
                {drafting
                  ? "Starting…"
                  : `Suggest rows with AI (${jobWait("rows")})`}
              </button>
            </form>
            <form action={genAction}>
              <button
                type="submit"
                className="btn btn-secondary btn-sm"
                disabled={generating || drafting}
              >
                {generating
                  ? "Starting…"
                  : `Re-derive columns (${jobWait("table")})`}
              </button>
            </form>
          </div>
        </div>
        <JobBanner state={rowState} job={rowJob} />
        <JobBanner state={genState} job={genJob} />

        <form action={saveAction} className="flex flex-col gap-3">
          {/* The columns travel with the form so the server saves against the set that was on screen. */}
          <input
            type="hidden"
            name="__columns"
            value={serializeTable({ columns: table.columns, rows: [] })}
          />
          <div className="scroll-x">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  {table.columns.map((c) => (
                    <th
                      key={c.key}
                      className={`border-b border-stone-200 px-2 py-1.5 text-left text-[11px] font-semibold tracking-wide text-[var(--muted)] uppercase ${
                        c.kind === "text" ? "min-w-[22rem]" : "min-w-[8rem]"
                      }`}
                    >
                      <span className="block whitespace-nowrap">{c.label}</span>
                      <span className="block text-[10px] font-normal normal-case">
                        {c.kind === "choice" && c.options
                          ? c.options.join(" / ")
                          : c.kind === "scale"
                            ? `${c.min} to ${c.max}`
                            : "text"}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    {table.columns.map((c) => (
                      <td
                        key={c.key}
                        className="border-b border-stone-100 px-1 py-1.5 align-top"
                      >
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
              onClick={() =>
                setRows((prev) => [
                  ...prev,
                  blankRow({ columns: table.columns, rows: prev }),
                ])
              }
            >
              Add a row
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={saving}
            >
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
    </div>
  );
}

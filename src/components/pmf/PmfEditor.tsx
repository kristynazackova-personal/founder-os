"use client";

/**
 * The filled framework: the answers, an edit form, a rewrite box and the
 * version history.
 *
 * One form per step rather than one for the whole document, so a founder can
 * save the step they are working on. Each save appends a version - nothing
 * here overwrites anything.
 */
import { useActionState, useState } from "react";
import { generatePmfAction, rewritePmfAction, savePmfAction, type PmfFormState } from "@/app/actions/pmf";
import { SOURCE_LABEL, isAnswered, isPlaceholder, type PmfDoc } from "@/lib/domain/pmfDoc";
import { fieldsOfStage, frameworkOf, type PmfFrameworkId } from "@/lib/domain/pmfFrameworks";
import { readTable } from "@/lib/domain/pmfTable";
import { FrameworkTable } from "./PmfTable";

function Status({ state }: { state: PmfFormState }) {
  if (!state) return null;
  if (state.error) return <p className="text-sm text-red-700">{state.error}</p>;
  if (state.ok) return <p className="text-sm text-emerald-700">{state.ok}</p>;
  return null;
}

export function GenerateButton({ appId, framework, label }: { appId: string; framework: PmfFrameworkId; label: string }) {
  const [state, action, pending] = useActionState<PmfFormState>(generatePmfAction.bind(null, appId, framework), undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Filling it in…" : label}
      </button>
      <Status state={state} />
    </form>
  );
}

export function StageAnswers({ appId, framework, stage, doc }: { appId: string; framework: PmfFrameworkId; stage: string; doc: PmfDoc | null }) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState<PmfFormState, FormData>(savePmfAction.bind(null, appId, framework), undefined);
  const fields = fieldsOfStage(frameworkOf(framework), stage);

  if (!editing) {
    return (
      <div className="mt-5 rounded-xl border border-stone-200 bg-stone-50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">Your answers</div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>
            Edit
          </button>
        </div>
        <dl className="mt-3 flex flex-col gap-3">
          {fields.map((f) => {
            const value = doc?.values[f.key];
            if (f.table) {
              return (
                <div key={f.key}>
                  <dt className="text-xs font-semibold">{f.label}</dt>
                  <FrameworkTable appId={appId} framework={framework} field={f.key} table={readTable(value)} prompt={f.prompt} />
                </div>
              );
            }
            return (
              <div key={f.key}>
                <dt className="text-xs font-semibold">{f.label}</dt>
                <dd className={`text-sm ${isAnswered(value) && !isPlaceholder(value) ? "" : "text-[var(--muted)] italic"}`}>
                  {isAnswered(value) ? value : "Not answered yet."}
                </dd>
              </div>
            );
          })}
        </dl>
        <Status state={state} />
      </div>
    );
  }

  return (
    <form action={action} className="mt-5 flex flex-col gap-4 rounded-xl border border-stone-300 bg-white p-5">
      <div className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">Editing - saving writes a new version</div>
      {fields.filter((f) => !f.table).map((f) => (
        <div key={f.key}>
          <label className="label" htmlFor={f.key}>
            {f.label}
          </label>
          {f.long ? (
            <textarea id={f.key} name={f.key} className="input min-h-24" defaultValue={doc?.values[f.key] ?? ""} />
          ) : (
            <input id={f.key} name={f.key} className="input" defaultValue={doc?.values[f.key] ?? ""} />
          )}
          <p className="help">{f.prompt}</p>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save as a new version"}
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => setEditing(false)}>
          Cancel
        </button>
        <Status state={state} />
      </div>
    </form>
  );
}

export function RewriteBox({ appId, framework, canRewrite, pressureTest }: { appId: string; framework: PmfFrameworkId; canRewrite: boolean; pressureTest: boolean }) {
  const [state, action, pending] = useActionState<PmfFormState, FormData>(rewritePmfAction.bind(null, appId, framework), undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="label" htmlFor="comment">
        {pressureTest ? "Ask it to pressure-test or re-frame" : "Ask for a rewrite"}
      </label>
      <textarea
        id="comment"
        name="comment"
        className="input min-h-20"
        placeholder="e.g. We are not selling to agencies any more, only to in-house teams. Redo steps 2 and 3 for that."
      />
      <p className="help">
        {!canRewrite
          ? "This needs a model key on this deployment. Until then, edit the fields directly - that also writes a new version."
          : pressureTest
            ? "This framework's rule is that the ideas are yours, so it will sharpen the questions and challenge what you wrote rather than answer for you. Your comment is kept with the version it produced."
            : "Your comment is kept with the version it produced, so you can see what you asked for and what came back."}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={pending || !canRewrite}>
          {pending ? "Working…" : pressureTest ? "Pressure-test as a new version" : "Rewrite as a new version"}
        </button>
        <Status state={state} />
      </div>
    </form>
  );
}

export function VersionList({ docs }: { docs: PmfDoc[] }) {
  if (docs.length === 0) return null;
  return (
    <ol className="flex flex-col gap-2">
      {docs.map((d) => (
        <li key={d.version} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-stone-100 py-2 text-sm last:border-0">
          <span className="font-medium">
            v{d.version} · {SOURCE_LABEL[d.source]}
          </span>
          <span className="text-xs text-[var(--muted)]">{new Date(d.createdAt).toISOString().slice(0, 16).replace("T", " ")} UTC</span>
          {d.comment ? <span className="basis-full text-xs text-[var(--muted)]">Asked: &ldquo;{d.comment}&rdquo;</span> : null}
        </li>
      ))}
    </ol>
  );
}

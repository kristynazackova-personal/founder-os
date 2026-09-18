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
import type { PmfStepKey } from "@/lib/domain/pmf";
import { SOURCE_LABEL, fieldsForStep, isAnswered, isPlaceholder, type PmfDoc } from "@/lib/domain/pmfDoc";

function Status({ state }: { state: PmfFormState }) {
  if (!state) return null;
  if (state.error) return <p className="text-sm text-red-700">{state.error}</p>;
  if (state.ok) return <p className="text-sm text-emerald-700">{state.ok}</p>;
  return null;
}

export function GenerateButton({ appId, label }: { appId: string; label: string }) {
  const [state, action, pending] = useActionState<PmfFormState>(generatePmfAction.bind(null, appId), undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Filling it in…" : label}
      </button>
      <Status state={state} />
    </form>
  );
}

export function StepAnswers({ appId, step, doc }: { appId: string; step: PmfStepKey; doc: PmfDoc | null }) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState<PmfFormState, FormData>(savePmfAction.bind(null, appId), undefined);
  const fields = fieldsForStep(step);

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
      {fields.map((f) => (
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

export function RewriteBox({ appId, canRewrite }: { appId: string; canRewrite: boolean }) {
  const [state, action, pending] = useActionState<PmfFormState, FormData>(rewritePmfAction.bind(null, appId), undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="label" htmlFor="comment">
        Ask for a rewrite
      </label>
      <textarea
        id="comment"
        name="comment"
        className="input min-h-20"
        placeholder="e.g. We are not selling to agencies any more, only to in-house teams. Redo steps 2 and 3 for that."
      />
      <p className="help">
        {canRewrite
          ? "Your comment is kept with the version it produced, so you can see what you asked for and what came back."
          : "Rewriting needs a model key on this deployment. Until then, edit the fields directly - that also writes a new version."}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={pending || !canRewrite}>
          {pending ? "Rewriting…" : "Rewrite as a new version"}
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

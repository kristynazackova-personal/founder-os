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
import { generatePmfAction, prefillPmfAction, rewritePmfAction, savePmfAction, type PmfFormState } from "@/app/actions/pmf";
import { ACCEPTED_UPLOAD_ATTR, ACCEPTED_UPLOAD_LABEL, MAX_UPLOAD_BYTES } from "@/lib/domain/businessCase";
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


/**
 * Prefill stage 1 from what the founder already wrote about their business.
 *
 * Only this stage gets one. Everything below it is their thinking, and stays
 * behind its own button, one stage at a time - deriving stage 3 from a stage 2
 * nobody has read yet is how a worksheet becomes a wall of text.
 */
export function PrefillPanel({ appId, framework, appUrl }: { appId: string; framework: PmfFrameworkId; appUrl: string | null }) {
  const [state, action, pending] = useActionState<PmfFormState, FormData>(prefillPmfAction.bind(null, appId, framework), undefined);
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <form action={action} className="mt-5 flex flex-col gap-3 rounded-xl border border-dashed border-stone-300 bg-stone-50 p-5">
      <div>
        <div className="text-sm font-semibold">Start from what you have</div>
        <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
          This stage describes a business that already exists, so it can be filled in for you. Everything below it is your
          thinking, and stays yours. Anything it cannot tell from your own words it will ask rather than guess.
        </p>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-stone-200 bg-white p-3">
        <label className="flex items-start gap-2 text-sm font-medium">
          <input type="checkbox" name="use_website" defaultChecked className="mt-0.5 h-4 w-4" />
          <span>Read this website</span>
        </label>
        <input
          // Deliberately not type="url": the browser's own validation rejects
          // a bare "focustimer.com" before the form is ever submitted, and
          // that is exactly what normalizeUrl is built to accept. Native
          // validation here refuses input the server would have handled, with
          // a message the founder cannot act on.
          type="text"
          name="website_url"
          defaultValue={appUrl ?? ""}
          placeholder="https://your-product.com"
          inputMode="url"
          autoComplete="url"
          className="input text-sm"
          aria-label="Website to read"
        />
        <p className="text-xs leading-relaxed text-[var(--muted)]">
          {appUrl ? (
            <>The research runs against this address. It is your business URL from Settings - change it here to point this run somewhere else.</>
          ) : (
            <>The research runs against this address. This business has no URL in Settings yet.</>
          )}
        </p>
        <label className="flex items-start gap-2 text-xs text-[var(--muted)]">
          <input type="checkbox" name="save_url" className="mt-0.5 h-3.5 w-3.5" />
          <span>Also save this as the business URL in Settings</span>
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span>Or upload a business case</span>
        <input
          type="file"
          name="document"
          accept={ACCEPTED_UPLOAD_ATTR}
          onChange={(e) => setFileName(e.currentTarget.files?.[0]?.name ?? null)}
          className="block w-full text-xs file:mr-3 file:rounded-lg file:border file:border-stone-300 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-semibold"
        />
        <span className="text-xs text-[var(--muted)]">
          {fileName ?? `${ACCEPTED_UPLOAD_LABEL}, up to ${MAX_UPLOAD_BYTES / 1024 / 1024} MB. A scanned PDF has no text to read.`}
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
          {pending ? "Reading it…" : "Fill in this stage"}
        </button>
        <Status state={state} />
      </div>
    </form>
  );
}

export function StageAnswers({ appId, framework, stage, doc, prefill, appUrl }: { appId: string; framework: PmfFrameworkId; stage: string; doc: PmfDoc | null; prefill?: boolean; appUrl?: string | null }) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState<PmfFormState, FormData>(savePmfAction.bind(null, appId, framework), undefined);
  const fields = fieldsOfStage(frameworkOf(framework), stage);

  if (!editing) {
    return (
      <>
      {prefill ? <PrefillPanel appId={appId} framework={framework} appUrl={appUrl ?? null} /> : null}
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
      </>
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

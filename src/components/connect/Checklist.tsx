"use client";

import { useOptimistic, useTransition } from "react";
import type { ReactNode } from "react";
import { toggleConnectStepAction } from "@/app/actions/sources";

type Step = { key: string; title: string; body: ReactNode };

export function ConnectChecklist({ appId, source, steps, done, connected, finalStep, children }: { appId: string; source: string; steps: Step[]; done: string[]; connected: boolean; finalStep: string; children: ReactNode }) {
  const [optimistic, setOptimistic] = useOptimistic(done, (state: string[], patch: { key: string; done: boolean }) => (patch.done ? [...new Set([...state, patch.key])] : state.filter((k) => k !== patch.key)));
  const [, start] = useTransition();
  const isDone = (k: string) => connected || optimistic.includes(k);
  const completed = steps.filter((s) => isDone(s.key)).length;

  return (
    <ol className="space-y-3">
      {steps.map((s, i) => {
        const checked = isDone(s.key);
        return (
          <li key={s.key} className={`card flex gap-4 p-5 ${checked ? "border-emerald-200 bg-emerald-50/40" : ""}`}>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 h-5 w-5 accent-stone-900"
                checked={checked}
                disabled={connected}
                onChange={(e) => {
                  const next = e.target.checked;
                  start(async () => {
                    setOptimistic({ key: s.key, done: next });
                    await toggleConnectStepAction(appId, source, s.key, next);
                  });
                }}
                aria-label={`Step ${i + 1} done`}
              />
            </label>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Step {i + 1}</div>
              <div className={`font-semibold ${checked ? "line-through decoration-stone-400" : ""}`}>{s.title}</div>
              <div className="mt-1 text-sm text-[var(--muted)]">{s.body}</div>
            </div>
          </li>
        );
      })}
      <li className={`card flex gap-4 p-5 ${connected ? "border-emerald-200 bg-emerald-50/40" : completed === steps.length ? "border-stone-900" : ""}`}>
        <div className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-stone-300 text-xs font-bold">{connected ? "✓" : steps.length + 1}</div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Step {steps.length + 1}</div>
          <div className="font-semibold">{finalStep}</div>
          <div className="mt-3">{children}</div>
        </div>
      </li>
    </ol>
  );
}

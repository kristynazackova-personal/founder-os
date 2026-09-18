"use client";

import { useActionState } from "react";
import { createAppAction, type FormState } from "@/app/actions/apps";
import { INDUSTRIES, INDUSTRY_LABEL, NATURES, NATURE_LABEL } from "@/lib/domain/gates";

export function NewAppForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createAppAction, undefined);
  return (
    <form action={action} className="card space-y-4 p-6">
      <div>
        <label className="label" htmlFor="name">
          App name
        </label>
        <input id="name" name="name" className="input" required placeholder="e.g. Bookly" />
      </div>
      <div>
        <label className="label" htmlFor="url">
          Published URL
        </label>
        <input id="url" name="url" className="input" placeholder="https://bookly.lovable.app" inputMode="url" />
        <p className="help">Optional, but it&apos;s how the snippet and checkout links know where home is.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="platform">
            Built with
          </label>
          <select id="platform" name="platform" className="select" defaultValue="lovable">
            <option value="lovable">Lovable</option>
            <option value="bolt">Bolt</option>
            <option value="replit">Replit</option>
            <option value="base44">Base44</option>
            <option value="other">Something else</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="launchedAt">
            Launched on
          </label>
          <input id="launchedAt" name="launchedAt" type="date" className="input" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="industry">
            What kind of product
          </label>
          <select id="industry" name="industry" className="select" defaultValue="other">
            {INDUSTRIES.map((i) => (
              <option key={i} value={i}>{INDUSTRY_LABEL[i]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="nature">
            How it charges
          </label>
          <select id="nature" name="nature" className="select" defaultValue="web_subscription">
            {NATURES.map((n) => (
              <option key={n} value={n}>{NATURE_LABEL[n]}</option>
            ))}
          </select>
        </div>
      </div>
      <p className="help -mt-1">
        These two answers set the thresholds your metrics are judged against - published benchmarks for your
        category at first, then refined from comparable products. You can change them later, and the gates re-derive.
      </p>
      <div>
        <label className="label" htmlFor="projectLink">
          Project link
        </label>
        <input id="projectLink" name="projectLink" className="input" placeholder="https://lovable.dev/projects/…" inputMode="url" />
        <p className="help">Optional.</p>
      </div>
      {state?.error ? <p className="text-sm text-red-700">{state.error}</p> : null}
      <button type="submit" className="btn btn-primary w-full" disabled={pending}>
        {pending ? "Creating…" : "Continue to connect payment data"}
      </button>
    </form>
  );
}

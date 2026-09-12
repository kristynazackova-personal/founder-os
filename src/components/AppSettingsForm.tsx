"use client";

import { useActionState } from "react";
import { updateAppAction, type FormState } from "@/app/actions/apps";
import type { App } from "@/lib/db/schema";

export function AppSettingsForm({ app }: { app: App }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateAppAction.bind(null, app.id), undefined);
  const launched = app.launchedAt ? new Date(app.launchedAt).toISOString().slice(0, 10) : "";
  return (
    <form action={action} className="card space-y-4 p-6">
      <div>
        <label className="label">App name</label>
        <input name="name" className="input" defaultValue={app.name} required />
      </div>
      <div>
        <label className="label">Published URL</label>
        <input name="url" className="input" defaultValue={app.url ?? ""} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Built with</label>
          <select name="platform" className="select" defaultValue={app.platform}>
            <option value="lovable">Lovable</option>
            <option value="bolt">Bolt</option>
            <option value="replit">Replit</option>
            <option value="base44">Base44</option>
            <option value="other">Something else</option>
          </select>
        </div>
        <div>
          <label className="label">Launched on</label>
          <input name="launchedAt" type="date" className="input" defaultValue={launched} />
        </div>
      </div>
      <div>
        <label className="label">Project link</label>
        <input name="projectLink" className="input" defaultValue={app.projectLink ?? ""} />
      </div>
      <div>
        <label className="label">Activation event</label>
        <input name="activationEvent" className="input" defaultValue={app.activationEvent ?? ""} placeholder="e.g. exports first report" />
        <p className="help">What a user does when they &quot;get it&quot;. Set by the pricing interview; edit here.</p>
      </div>
      {state?.error ? <p className="text-sm text-red-700">{state.error}</p> : null}
      {state?.ok ? <p className="text-sm text-emerald-700">Saved.</p> : null}
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}

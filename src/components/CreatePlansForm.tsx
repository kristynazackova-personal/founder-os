"use client";

import { useActionState } from "react";
import { createPlansAction } from "@/app/actions/checkout";
import type { FormState } from "@/app/actions/apps";

export function CreatePlansForm({ appId, mode, hasPlans }: { appId: string; mode: "test" | "live"; hasPlans: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createPlansAction.bind(null, appId), undefined);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="mode" value={mode} />
      <button type="submit" className={`btn ${mode === "live" ? "btn-primary" : "btn-secondary"}`} disabled={pending}>
        {pending ? "Creating products…" : hasPlans ? `Rebuild ${mode} plans from pricing` : mode === "live" ? "Publish live plans" : "Create test plans"}
      </button>
      {state?.error ? <p className="text-sm text-red-700">{state.error}</p> : null}
      {state?.ok ? <p className="text-sm text-emerald-700">Plans created.</p> : null}
    </form>
  );
}

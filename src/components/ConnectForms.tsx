"use client";

import { useActionState } from "react";
import { connectGa4Action, connectLemonSqueezyAction, connectPaddleAction } from "@/app/actions/sources";
import type { FormState } from "@/app/actions/apps";

function Status({ state }: { state: FormState }) {
  if (state?.error) return <p className="text-sm text-red-700">{state.error}</p>;
  if (state?.ok) return <p className="text-sm text-emerald-700">Connected. Your diagnosis has been refreshed.</p>;
  return null;
}

export function LemonSqueezyForm({ appId }: { appId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(connectLemonSqueezyAction.bind(null, appId), undefined);
  return (
    <form action={action} className="space-y-3">
      <div>
        <label className="label">API key</label>
        <input name="apiKey" className="input" type="password" required placeholder="eyJ…" autoComplete="off" />
        <p className="help">Settings → API → create a key. It is stored encrypted and only ever used to read.</p>
      </div>
      <div>
        <label className="label">Store id (optional)</label>
        <input name="storeId" className="input" placeholder="12345" />
      </div>
      <Status state={state} />
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Checking…" : "Connect Lemon Squeezy"}
      </button>
    </form>
  );
}

export function PaddleForm({ appId }: { appId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(connectPaddleAction.bind(null, appId), undefined);
  return (
    <form action={action} className="space-y-3">
      <div>
        <label className="label">API key</label>
        <input name="apiKey" className="input" type="password" required placeholder="pdl_live_… or pdl_sdbx_…" autoComplete="off" />
        <p className="help">Developer tools → Authentication. Read permission on subscriptions, transactions and prices is enough.</p>
      </div>
      <Status state={state} />
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Checking…" : "Connect Paddle"}
      </button>
    </form>
  );
}

export function Ga4Form({ appId }: { appId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(connectGa4Action.bind(null, appId), undefined);
  return (
    <form action={action} className="space-y-3">
      <div>
        <label className="label">Property id</label>
        <input name="propertyId" className="input" required placeholder="123456789" />
      </div>
      <div>
        <label className="label">Service account JSON</label>
        <textarea name="serviceAccountJson" className="textarea h-28 font-mono text-xs" required placeholder='{"type":"service_account", …}' />
        <p className="help">Create a service account in Google Cloud, download its key, and add its email as a Viewer on the GA4 property.</p>
      </div>
      <Status state={state} />
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Checking…" : "Connect GA4"}
      </button>
    </form>
  );
}

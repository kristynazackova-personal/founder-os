"use client";

import { useActionState } from "react";
import { connectGa4Action, connectLemonSqueezyAction, connectPaddleAction, connectStripeKeyAction } from "@/app/actions/sources";
import type { FormState } from "@/app/actions/apps";

function Status({ state }: { state: FormState }) {
  if (state?.error) return <p className="text-sm text-red-700">{state.error}</p>;
  if (state?.ok) return <p className="text-sm text-emerald-700">Connected. Your diagnosis has been refreshed.</p>;
  return null;
}

export function StripeKeyForm({ appId }: { appId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(connectStripeKeyAction.bind(null, appId), undefined);
  return (
    <form action={action} className="space-y-3">
      <div>
        <label className="label">Restricted key</label>
        <input name="apiKey" className="input" type="password" required placeholder="rk_live_…" autoComplete="off" />
        <p className="help">Starts with rk_live_ (or rk_test_ for a sandbox). Secret keys (sk_…) are refused.</p>
      </div>
      <Status state={state} />
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Checking…" : "Connect Stripe"}
      </button>
    </form>
  );
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
        <p className="help">Analytics → Admin → Property details, top right.</p>
      </div>
      <div>
        <label className="label">Service account JSON</label>
        <textarea name="serviceAccountJson" className="textarea h-28 font-mono text-xs" required placeholder='{"type":"service_account", "client_email": "…@….iam.gserviceaccount.com", …}' />
        <p className="help">The whole key file. It must contain <code>&quot;type&quot;: &quot;service_account&quot;</code>, a <code>client_email</code> and a <code>private_key</code>.</p>
      </div>
      <Status state={state} />
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Checking…" : "Connect GA4"}
      </button>
    </form>
  );
}

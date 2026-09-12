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

export function Ga4Guide() {
  return (
    <details className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-sm">
      <summary className="cursor-pointer font-semibold">How to get the property id and the service account JSON (about 5 minutes)</summary>
      <ol className="mt-3 list-decimal space-y-2 pl-5">
        <li>
          <span className="font-semibold">Property id.</span> In Google Analytics open <em>Admin → Property → Property details</em>. The id is the number in the top right, e.g. <code>123456789</code>.
        </li>
        <li>
          <span className="font-semibold">Service account.</span> In{" "}
          <a className="underline" href="https://console.cloud.google.com/iam-admin/serviceaccounts" target="_blank" rel="noreferrer">
            Google Cloud Console → IAM &amp; Admin → Service Accounts
          </a>
          , create one (any name, no roles needed) or pick an existing one. Its email ends in <code>iam.gserviceaccount.com</code> — that&apos;s the account you want, not the one with your own email address.
        </li>
        <li>
          <span className="font-semibold">JSON key.</span> Click the account&apos;s email, open the <em>Keys</em> tab, then <em>Add key → Create new key → JSON → Create</em>. A file downloads once; existing keys can&apos;t be downloaded again, so create a new one if you don&apos;t have the file. Paste the whole file below.
        </li>
        <li>
          <span className="font-semibold">Enable the API.</span> In the same Cloud project, enable the{" "}
          <a className="underline" href="https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com" target="_blank" rel="noreferrer">
            Google Analytics Data API
          </a>
          .
        </li>
        <li>
          <span className="font-semibold">Give it read access in Google Analytics.</span> The service account is not on any list yet — you type its address in. Open the property, then <em>Admin</em> (gear, bottom left) → under the <em>Property</em> column, <em>Property access management</em> → the blue <em>+</em> button top right → <em>Add users</em>. Paste the service account&apos;s email (the one ending in <code>iam.gserviceaccount.com</code>) into the email box and press Enter, untick <em>Notify new users by email</em>, choose the <em>Viewer</em> role, click <em>Add</em>. It then appears in the list; wait a minute before connecting. A role on the Cloud project does not count — GA4 keeps its own access list. If there is no <em>+</em> button, your own account is only a Viewer or Analyst on the property; someone with Editor or Administrator has to add it.
        </li>
      </ol>
      <p className="mt-3 text-[var(--muted)]">
        We read two numbers: active users in the last 30 days and <code>sign_up</code> events. The key is stored encrypted and never used for anything else. If <em>Add key</em> is greyed out with an error mentioning{" "}
        <code>iam.disableServiceAccountKeyCreation</code>, your Google organisation blocks keys — ask an admin to allow them for this project, or skip GA4: the attribution snippet gives you the same numbers.
      </p>
    </details>
  );
}

export function Ga4Form({ appId }: { appId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(connectGa4Action.bind(null, appId), undefined);
  return (
    <form action={action} className="space-y-3">
      <Ga4Guide />
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

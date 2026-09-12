"use client";

import { useActionState } from "react";
import { connectAppStoreAction, connectGa4Action, connectLemonSqueezyAction, connectMixpanelAction, connectPaddleAction, connectPostgresAction, connectStripeKeyAction } from "@/app/actions/sources";
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

export function AppStoreForm({ appId }: { appId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(connectAppStoreAction.bind(null, appId), undefined);
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label">Issuer ID</label>
          <input name="issuerId" className="input" required placeholder="57246542-96fe-1a63-…" autoComplete="off" />
        </div>
        <div>
          <label className="label">Key ID</label>
          <input name="keyId" className="input" required placeholder="2X9R4HXF34" autoComplete="off" />
        </div>
        <div>
          <label className="label">Vendor number</label>
          <input name="vendorNumber" className="input" required placeholder="12345678" inputMode="numeric" />
        </div>
      </div>
      <div>
        <label className="label">Private key (.p8 contents)</label>
        <textarea name="privateKey" className="textarea h-28 font-mono text-xs" required placeholder={"-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----"} />
        <p className="help">The whole file, BEGIN and END lines included. Stored encrypted; used only to sign report requests.</p>
      </div>
      <Status state={state} />
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Checking with Apple…" : "Connect App Store"}
      </button>
    </form>
  );
}

export function MixpanelForm({ appId }: { appId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(connectMixpanelAction.bind(null, appId), undefined);
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Project id</label>
          <input name="projectId" className="input" required placeholder="1234567" inputMode="numeric" />
        </div>
        <div>
          <label className="label">Data residency</label>
          <select name="region" className="select" defaultValue="us">
            <option value="us">US (default)</option>
            <option value="eu">EU</option>
            <option value="in">India</option>
          </select>
        </div>
        <div>
          <label className="label">Service account username</label>
          <input name="serviceUser" className="input" required placeholder="founder-os.abc123.mp-service-account" autoComplete="off" />
        </div>
        <div>
          <label className="label">Service account secret</label>
          <input name="serviceSecret" className="input" type="password" required autoComplete="off" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label">Sign-up event</label>
          <input name="signupEvent" className="input" required placeholder="User Signup" />
        </div>
        <div>
          <label className="label">Activation event (optional)</label>
          <input name="activationEvent" className="input" placeholder="Onboarding Completed" />
        </div>
        <div>
          <label className="label">Visit event (optional)</label>
          <input name="visitorEvent" className="input" placeholder="Page View" />
        </div>
      </div>
      <p className="help">Exact event names, case-sensitive. We check they exist before saving.</p>
      <Status state={state} />
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Checking…" : "Connect Mixpanel"}
      </button>
    </form>
  );
}

export function PostgresForm({ appId }: { appId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(connectPostgresAction.bind(null, appId), undefined);
  return (
    <form action={action} className="space-y-3">
      <div>
        <label className="label">Read-only connection string</label>
        <input name="connectionString" className="input" type="password" required placeholder="postgresql://founder_os_ro:…@host:5432/db?sslmode=require" autoComplete="off" />
        <p className="help">A role that can only SELECT. Every query runs read-only with a 15-second limit.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Users table</label>
          <input name="usersTable" className="input" defaultValue="users" placeholder="users or auth.users" />
        </div>
        <div>
          <label className="label">Created-at column</label>
          <input name="usersCreatedAt" className="input" defaultValue="created_at" />
        </div>
      </div>
      <details className="rounded-xl border border-stone-200 p-3">
        <summary className="cursor-pointer text-sm font-semibold">Optional: subscriptions table (reports paying users, MRR and churn)</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Table</label>
            <input name="subsTable" className="input" placeholder="subscriptions" />
          </div>
          <div>
            <label className="label">Customer column</label>
            <input name="subsCustomer" className="input" placeholder="user_id" />
          </div>
          <div>
            <label className="label">Started-at column</label>
            <input name="subsStartedAt" className="input" placeholder="subscribed_date" />
          </div>
          <div>
            <label className="label">Ended-at column (null while active)</label>
            <input name="subsEndedAt" className="input" placeholder="unsubscribed_date" />
          </div>
          <div>
            <label className="label">Plan column</label>
            <input name="subsPlan" className="input" placeholder="tier" />
          </div>
          <div>
            <label className="label">Plan prices</label>
            <input name="priceMap" className="input" placeholder="premium=$3.99/week, premium_plus=$5.99/week" />
            <p className="help">One per plan value, comma-separated. Dollars with a decimal point or cents as a whole number; interval day, week, month or year.</p>
          </div>
        </div>
      </details>
      <Status state={state} />
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Reading…" : "Connect database"}
      </button>
    </form>
  );
}

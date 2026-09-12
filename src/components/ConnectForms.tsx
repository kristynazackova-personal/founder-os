"use client";

import { useActionState } from "react";
import { connectAppStoreAction, connectGa4Action, connectLemonSqueezyAction, connectMixpanelAction, connectPaddleAction, connectPostgresAction, connectStripeKeyAction, saveConnectDraftAction, connectGoogleAdsAction} from "@/app/actions/sources";

export type Draft = Record<string, string>;

/** Shown under a secret input when a draft holds a value for it. */
function SecretOnFile({ name, secretsOnFile }: { name: string; secretsOnFile: string[] }) {
  if (!secretsOnFile.includes(name)) return null;
  return <p className="help text-emerald-700">Saved from your draft (stored encrypted, never shown). Leave blank to use it, or paste a new one to replace it.</p>;
}

/** Secondary submit that stores the non-secret fields without connecting. */
function SaveForLater({ appId, source }: { appId: string; source: string }) {
  return (
    <button type="submit" formAction={saveConnectDraftAction.bind(null, appId, source)} formNoValidate className="btn btn-secondary">
      Save for later
    </button>
  );
}
import type { FormState } from "@/app/actions/apps";

function Status({ state }: { state: FormState }) {
  if (state?.error) return <p className="text-sm text-red-700">{state.error}</p>;
  if (state?.ok) return <p className="text-sm text-emerald-700">Connected. Your diagnosis has been refreshed.</p>;
  return null;
}

export function StripeKeyForm({ appId, secretsOnFile = [] }: { appId: string; secretsOnFile?: string[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(connectStripeKeyAction.bind(null, appId), undefined);
  return (
    <form action={action} className="space-y-3">
      <div>
        <label className="label">Restricted key</label>
        <input name="apiKey" className="input" type="password" required={!secretsOnFile.includes("apiKey")} placeholder="rk_live_…" autoComplete="off" />
        <p className="help">Starts with rk_live_ (or rk_test_ for a sandbox). Secret keys (sk_…) are refused.</p>
        <SecretOnFile name="apiKey" secretsOnFile={secretsOnFile} />
      </div>
      <Status state={state} />
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Checking…" : "Connect Stripe"}
        </button>
        <SaveForLater appId={appId} source="stripe" />
      </div>
    </form>
  );
}

export function LemonSqueezyForm({ appId, draft = {}, secretsOnFile = [] }: { appId: string; draft?: Draft; secretsOnFile?: string[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(connectLemonSqueezyAction.bind(null, appId), undefined);
  return (
    <form action={action} className="space-y-3">
      <div>
        <label className="label">API key</label>
        <input name="apiKey" className="input" type="password" required={!secretsOnFile.includes("apiKey")} placeholder="eyJ…" autoComplete="off" />
        <p className="help">Settings → API → create a key. It is stored encrypted and only ever used to read.</p>
        <SecretOnFile name="apiKey" secretsOnFile={secretsOnFile} />
      </div>
      <div>
        <label className="label">Store id (optional)</label>
        <input name="storeId" className="input" placeholder="12345" defaultValue={draft.storeId} />
      </div>
      <Status state={state} />
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Checking…" : "Connect Lemon Squeezy"}
        </button>
        <SaveForLater appId={appId} source="lemonsqueezy" />
      </div>
    </form>
  );
}

export function PaddleForm({ appId, secretsOnFile = [] }: { appId: string; secretsOnFile?: string[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(connectPaddleAction.bind(null, appId), undefined);
  return (
    <form action={action} className="space-y-3">
      <div>
        <label className="label">API key</label>
        <input name="apiKey" className="input" type="password" required={!secretsOnFile.includes("apiKey")} placeholder="pdl_live_… or pdl_sdbx_…" autoComplete="off" />
        <p className="help">Developer tools → Authentication. Read permission on subscriptions, transactions and prices is enough.</p>
        <SecretOnFile name="apiKey" secretsOnFile={secretsOnFile} />
      </div>
      <Status state={state} />
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Checking…" : "Connect Paddle"}
        </button>
        <SaveForLater appId={appId} source="paddle" />
      </div>
    </form>
  );
}

export function Ga4Form({ appId, draft = {}, secretsOnFile = [] }: { appId: string; draft?: Draft; secretsOnFile?: string[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(connectGa4Action.bind(null, appId), undefined);
  return (
    <form action={action} className="space-y-3">
      <div>
        <label className="label">Property id</label>
        <input name="propertyId" className="input" required placeholder="123456789" defaultValue={draft.propertyId} />
        <p className="help">Analytics → Admin → Property details, top right.</p>
      </div>
      <div>
        <label className="label">Service account JSON</label>
        <textarea name="serviceAccountJson" className="textarea h-28 font-mono text-xs" required={!secretsOnFile.includes("serviceAccountJson")} placeholder='{"type":"service_account", "client_email": "…@….iam.gserviceaccount.com", …}' />
        <SecretOnFile name="serviceAccountJson" secretsOnFile={secretsOnFile} />
        <p className="help">The whole key file. It must contain <code>&quot;type&quot;: &quot;service_account&quot;</code>, a <code>client_email</code> and a <code>private_key</code>.</p>
      </div>
      <Status state={state} />
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Checking…" : "Connect GA4"}
        </button>
        <SaveForLater appId={appId} source="ga4" />
      </div>
    </form>
  );
}

export function GoogleAdsForm({ appId, draft = {}, secretsOnFile = [] }: { appId: string; draft?: Draft; secretsOnFile?: string[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(connectGoogleAdsAction.bind(null, appId), undefined);
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Customer id</label>
          <input name="customerId" className="input" required placeholder="123-456-7890" defaultValue={draft.customerId} />
          <p className="help">Ten digits, top right in Google Ads.</p>
        </div>
        <div>
          <label className="label">Login customer id (optional)</label>
          <input name="loginCustomerId" className="input" placeholder="manager account id" defaultValue={draft.loginCustomerId} />
          <p className="help">Only when the account is queried through a manager account.</p>
        </div>
      </div>
      <div>
        <label className="label">Refresh token</label>
        <textarea name="refreshToken" className="textarea h-20 font-mono text-xs" required={!secretsOnFile.includes("refreshToken")} placeholder="1//0g…" />
        <SecretOnFile name="refreshToken" secretsOnFile={secretsOnFile} />
        <p className="help">An OAuth refresh token with the <code>adwords</code> scope. Stored encrypted and never shown again.</p>
      </div>
      <Status state={state} />
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Checking…" : "Connect Google Ads"}
        </button>
        <SaveForLater appId={appId} source="googleads" />
      </div>
    </form>
  );
}

export function AppStoreForm({ appId, draft = {}, secretsOnFile = [] }: { appId: string; draft?: Draft; secretsOnFile?: string[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(connectAppStoreAction.bind(null, appId), undefined);
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label">Issuer ID</label>
          <input name="issuerId" className="input" required placeholder="57246542-96fe-1a63-…" autoComplete="off" defaultValue={draft.issuerId} />
        </div>
        <div>
          <label className="label">Key ID</label>
          <input name="keyId" className="input" required placeholder="2X9R4HXF34" autoComplete="off" defaultValue={draft.keyId} />
        </div>
        <div>
          <label className="label">Vendor number</label>
          <input name="vendorNumber" className="input" required placeholder="12345678" inputMode="numeric" defaultValue={draft.vendorNumber} />
        </div>
      </div>
      <div>
        <label className="label">Private key (.p8 contents)</label>
        <textarea name="privateKey" className="textarea h-28 font-mono text-xs" required={!secretsOnFile.includes("privateKey")} placeholder={"-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----"} />
        <p className="help">The whole file, BEGIN and END lines included. Stored encrypted; used only to sign report requests.</p>
        <SecretOnFile name="privateKey" secretsOnFile={secretsOnFile} />
      </div>
      <Status state={state} />
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Checking with Apple…" : "Connect App Store"}
        </button>
        <SaveForLater appId={appId} source="appstore" />
      </div>
    </form>
  );
}

export function MixpanelForm({ appId, draft = {}, secretsOnFile = [] }: { appId: string; draft?: Draft; secretsOnFile?: string[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(connectMixpanelAction.bind(null, appId), undefined);
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Project id</label>
          <input name="projectId" className="input" required placeholder="1234567" inputMode="numeric" defaultValue={draft.projectId} />
        </div>
        <div>
          <label className="label">Data residency</label>
          <select name="region" className="select" defaultValue={draft.region ?? "us"}>
            <option value="us">US (default)</option>
            <option value="eu">EU</option>
            <option value="in">India</option>
          </select>
        </div>
        <div>
          <label className="label">Service account username</label>
          <input name="serviceUser" className="input" required placeholder="founder-os.abc123.mp-service-account" autoComplete="off" defaultValue={draft.serviceUser} />
        </div>
        <div>
          <label className="label">Service account secret</label>
          <input name="serviceSecret" className="input" type="password" required={!secretsOnFile.includes("serviceSecret")} autoComplete="off" />
          <SecretOnFile name="serviceSecret" secretsOnFile={secretsOnFile} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label">Sign-up event</label>
          <input name="signupEvent" className="input" required placeholder="User Signup" defaultValue={draft.signupEvent} />
        </div>
        <div>
          <label className="label">Activation event (optional)</label>
          <input name="activationEvent" className="input" placeholder="Onboarding Completed" defaultValue={draft.activationEvent} />
        </div>
        <div>
          <label className="label">Visit event (optional)</label>
          <input name="visitorEvent" className="input" placeholder="Page View" defaultValue={draft.visitorEvent} />
        </div>
      </div>
      <p className="help">Exact event names, case-sensitive. We check they exist before saving.</p>
      <Status state={state} />
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Checking…" : "Connect Mixpanel"}
        </button>
        <SaveForLater appId={appId} source="mixpanel" />
      </div>
    </form>
  );
}

export function PostgresForm({ appId, draft = {}, secretsOnFile = [] }: { appId: string; draft?: Draft; secretsOnFile?: string[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(connectPostgresAction.bind(null, appId), undefined);
  return (
    <form action={action} className="space-y-3">
      <div>
        <label className="label">Read-only connection string</label>
        <input name="connectionString" className="input" type="password" required placeholder="postgresql://founder_os_ro:…@host:5432/db?sslmode=require" autoComplete="off" defaultValue={draft.connectionString} />
        <p className="help">A role that can only SELECT. Every query runs read-only with a 15-second limit.{draft.connectionString && !secretsOnFile.includes("connectionString") ? " Your draft kept the host, user and database — add the password back." : ""}</p>
        <SecretOnFile name="connectionString" secretsOnFile={secretsOnFile} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Users table</label>
          <input name="usersTable" className="input" defaultValue={draft.usersTable ?? "users"} placeholder="users or auth.users" />
        </div>
        <div>
          <label className="label">Created-at column</label>
          <input name="usersCreatedAt" className="input" defaultValue={draft.usersCreatedAt ?? "created_at"} />
        </div>
      </div>
      <details className="rounded-xl border border-stone-200 p-3" open={Boolean(draft.subsTable)}>
        <summary className="cursor-pointer text-sm font-semibold">Optional: subscriptions table (reports paying users, MRR and churn)</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Table</label>
            <input name="subsTable" className="input" placeholder="subscriptions" defaultValue={draft.subsTable} />
          </div>
          <div>
            <label className="label">Customer column</label>
            <input name="subsCustomer" className="input" placeholder="user_id" defaultValue={draft.subsCustomer} />
          </div>
          <div>
            <label className="label">Started-at column</label>
            <input name="subsStartedAt" className="input" placeholder="subscribed_date" defaultValue={draft.subsStartedAt} />
          </div>
          <div>
            <label className="label">Ended-at column (null while active)</label>
            <input name="subsEndedAt" className="input" placeholder="unsubscribed_date" defaultValue={draft.subsEndedAt} />
          </div>
          <div>
            <label className="label">Plan column</label>
            <input name="subsPlan" className="input" placeholder="tier" defaultValue={draft.subsPlan} />
          </div>
          <div>
            <label className="label">Plan prices</label>
            <input name="priceMap" className="input" placeholder="premium=$3.99/week, premium_plus=$5.99/week" defaultValue={draft.priceMap} />
            <p className="help">One per plan value, comma-separated. Dollars with a decimal point or cents as a whole number; interval day, week, month or year.</p>
          </div>
        </div>
      </details>
      <Status state={state} />
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Reading…" : "Connect database"}
        </button>
        <SaveForLater appId={appId} source="postgres" />
      </div>
    </form>
  );
}

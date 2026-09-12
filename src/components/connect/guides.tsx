import type { ReactNode } from "react";
import type { SourceType } from "@/lib/sources";
import { env } from "@/lib/env";
import { CopyButton } from "@/components/CopyButton";
import { ADWORDS_SCOPE } from "@/lib/sources/googleads";

export type GuideStep = { key: string; title: string; body: ReactNode };

export type ConnectGuide = {
  source: SourceType;
  name: string;
  tagline: string;
  /** What the app reads, in one sentence. */
  reads: string;
  /** Rough time to complete. */
  minutes: number;
  steps: GuideStep[];
  /** Label of the final step, where the form / OAuth button lives. */
  finalStep: string;
};

const ext = (href: string, label: string) => (
  <a className="underline" href={href} target="_blank" rel="noreferrer">
    {label}
  </a>
);

export const CONNECT_GUIDES: Record<SourceType, ConnectGuide> = {
  stripe: {
    source: "stripe",
    name: "Stripe",
    tagline: "Subscriptions, customers and charges, read-only",
    reads: "Active subscriptions, cancellations and charges from the last 180 days. Only a read-only restricted key is accepted; secret keys are refused.",
    minutes: 3,
    steps: [
      {
        key: "keys",
        title: "Open Developers → API keys in your Stripe dashboard",
        body: <>{ext("https://dashboard.stripe.com/apikeys", "dashboard.stripe.com/apikeys")}. Make sure the <em>Test mode</em> toggle is off so the key reads real customers.</>,
      },
      {
        key: "create",
        title: "Click Create restricted key",
        body: (
          <>
            When Stripe asks how you will use the key, choose <em>Providing this key to a third-party application</em> (Founder OS is the third party). On the next screen, <em>Name</em>: <code>Founder OS</code>, <em>URL</em>: <code>{env.appUrl}</code>, then open <em>Customise permissions for this key</em>. Never use your secret key (<code>sk_…</code>) — the app refuses it.
          </>
        ),
      },
      {
        key: "permissions",
        title: "Set four permissions to Read, leave everything else at None",
        body: (
          <>
            <em>Customers</em>, <em>Subscriptions</em>, <em>Charges</em> and <em>Products</em> (that one covers prices). Read only — the key can then never move money or change anything.
          </>
        ),
      },
      {
        key: "copy",
        title: "Create the key and copy it",
        body: <>It starts with <code>rk_live_</code> and is shown once. To revoke it later, delete it on the same page.</>,
      },
    ],
    finalStep: "Paste the restricted key",
  },
  lemonsqueezy: {
    source: "lemonsqueezy",
    name: "Lemon Squeezy",
    tagline: "Subscriptions, orders and variants via an API key",
    reads: "Subscriptions, orders and product variants. The key is encrypted at rest and only used to read.",
    minutes: 3,
    steps: [
      {
        key: "settings",
        title: "Open Settings → API in your Lemon Squeezy dashboard",
        body: <>{ext("https://app.lemonsqueezy.com/settings/api", "app.lemonsqueezy.com/settings/api")} — top-right avatar → Settings → API.</>,
      },
      {
        key: "create",
        title: "Create a new API key",
        body: <>Click the <em>+</em> button, name it <code>Founder OS</code>. Lemon Squeezy keys are read-and-write, so keep this one to yourself.</>,
      },
      {
        key: "copy",
        title: "Copy the key",
        body: <>It is shown once, right after creation. If you lose it, delete it and make another.</>,
      },
      {
        key: "store",
        title: "Optional: note your store id",
        body: <>Settings → Stores. Only needed if the account has several stores; it limits the read to one.</>,
      },
    ],
    finalStep: "Paste the key",
  },
  paddle: {
    source: "paddle",
    name: "Paddle",
    tagline: "Paddle Billing subscriptions and transactions via an API key",
    reads: "Subscriptions, completed transactions and active prices. Sandbox keys are detected automatically.",
    minutes: 3,
    steps: [
      {
        key: "devtools",
        title: "Open Developer tools → Authentication in Paddle",
        body: <>{ext("https://vendors.paddle.com/authentication-v2", "vendors.paddle.com/authentication-v2")} (or the sandbox equivalent for a test account).</>,
      },
      {
        key: "create",
        title: "Generate a new API key with read permissions",
        body: (
          <>
            Name it <code>Founder OS</code>. Under permissions tick <em>Read</em> for <em>Subscriptions</em>, <em>Transactions</em> and <em>Prices</em>; nothing else is needed.
          </>
        ),
      },
      {
        key: "copy",
        title: "Copy the key",
        body: <>Paddle shows it once. Live keys start with <code>pdl_live_</code>, sandbox keys with <code>pdl_sdbx_</code>.</>,
      },
    ],
    finalStep: "Paste the key",
  },
  appstore: {
    source: "appstore",
    name: "App Store",
    tagline: "iOS subscriptions from App Store Connect sales reports",
    reads: "Daily subscriber reports for the last 90 days: starts, renewals, cancellations and prices, per anonymous subscriber id. Never customer names.",
    minutes: 6,
    steps: [
      {
        key: "key",
        title: "Create an App Store Connect API key with the Sales and Reports role",
        body: (
          <>
            {ext("https://appstoreconnect.apple.com/access/integrations/api", "App Store Connect → Users and Access → Integrations → App Store Connect API")} → the <em>Team Keys</em> tab → <em>+</em>. Name it <code>Founder OS</code>, access <em>Sales and Reports</em> (the smallest role that can read reports). Only the Account Holder or an Admin can create keys. It must be a <em>Team</em> key: an <em>In-App Purchase</em> key (the other tab, used by apps to verify purchases) cannot read sales reports and is rejected with 401.
          </>
        ),
      },
      {
        key: "download",
        title: "Download the .p8 file and note the Key ID and Issuer ID",
        body: <>The <em>Download API Key</em> link works once. The <em>Key ID</em> is on the key&apos;s row; the <em>Issuer ID</em> is at the top of the same page. Open the .p8 in a text editor — you paste its whole contents, BEGIN and END lines included.</>,
      },
      {
        key: "vendor",
        title: "Find your vendor number",
        body: <>{ext("https://appstoreconnect.apple.com/trends/reports", "Sales and Trends → Reports")} → the vendor number is shown next to your legal entity name (an 8-digit number).</>,
      },
      {
        key: "wait",
        title: "Know that Apple's reports run a day behind",
        body: <>A day&apos;s report appears the following morning (Pacific time) and days without activity have no report at all, so the first read can be empty for a brand-new app.</>,
      },
    ],
    finalStep: "Paste the issuer id, key id, vendor number and the .p8 key",
  },
  postgres: {
    source: "postgres",
    name: "Postgres / Supabase",
    tagline: "Sign-ups from your own users table; optionally subscriptions too",
    reads: "A count of rows in your users table from the last 30 days, and — if you map one — a subscriptions table. Every query runs read-only with a 15-second limit.",
    minutes: 5,
    steps: [
      {
        key: "readonly",
        title: "Create a read-only database role",
        body: (
          <>
            Run in the SQL editor (Supabase: <em>SQL Editor</em>; Neon: <em>SQL Editor</em>; anything else: psql):
            <pre className="code mt-2">{`CREATE ROLE founder_os_ro LOGIN PASSWORD 'choose-a-long-password';
GRANT USAGE ON SCHEMA public TO founder_os_ro;
GRANT SELECT ON public.users TO founder_os_ro;
-- and, only if you map subscriptions:
GRANT SELECT ON public.subscriptions TO founder_os_ro;`}</pre>
            Never paste your main database URL; a role that can only SELECT two tables is the whole point.
          </>
        ),
      },
      {
        key: "url",
        title: "Build the connection string for that role",
        body: (
          <>
            Copy your provider&apos;s connection string and swap in the new user and password: <code>postgresql://founder_os_ro:PASSWORD@HOST:5432/DBNAME?sslmode=require</code>. Supabase: use the <em>Session pooler</em> string from <em>Connect</em>. Neon: the pooled host works.
          </>
        ),
      },
      {
        key: "users",
        title: "Note the users table and its created-at column",
        body: <>Usually <code>users</code> and <code>created_at</code>. Supabase Auth keeps its users in <code>auth.users</code> (grant SELECT on that instead).</>,
      },
      {
        key: "subs",
        title: "Optional: map a subscriptions table",
        body: (
          <>
            If your app records subscriptions itself (e.g. because you bill on Stripe and the App Store), tell us the table, the customer column, the started-at and ended-at columns, the plan column, and what each plan costs: <code>premium=399/week, premium_plus=599/week</code>. With that, this one source reports paying users, MRR and churn.
          </>
        ),
      },
    ],
    finalStep: "Paste the connection string and the column names",
  },
  mixpanel: {
    source: "mixpanel",
    name: "Mixpanel",
    tagline: "Sign-ups, activation and visitors from your existing events",
    reads: "Distinct users of the events you name, over the last 30 days, through the raw export API. Nothing is written to Mixpanel.",
    minutes: 4,
    steps: [
      {
        key: "project",
        title: "Find your project id",
        body: <>Mixpanel → <em>Settings</em> (gear) → <em>Project settings</em> → <em>Overview</em>. The project id is a number; note the <em>Data residency</em> shown there too (US, EU or India).</>,
      },
      {
        key: "service-account",
        title: "Create a service account",
        body: (
          <>
            Same page → <em>Service Accounts</em> → <em>Add Service Account</em>. Role <em>Consumer</em> is enough (it can read, not change). Copy the <em>username</em> and the <em>secret</em> — the secret is shown once.
          </>
        ),
      },
      {
        key: "events",
        title: "Pick the events that mean sign-up, activation and a visit",
        body: <>Exact event names as they appear in Mixpanel, e.g. <code>User Signup</code>, <code>Onboarding Completed</code>, <code>Page View</code>. Sign-up is required; the other two are optional.</>,
      },
    ],
    finalStep: "Paste the project id, service account and event names",
  },
  googleads: {
    source: "googleads",
    name: "Google Ads",
    tagline: "What you actually spent, per campaign",
    reads: "Cost, clicks and impressions per campaign for the last 30 days. Read-only; nothing in your account is changed.",
    minutes: 6,
    steps: [
      {
        key: "customer-id",
        title: "Copy your Google Ads customer id",
        body: (
          <>
            Top right of the Google Ads interface, under your account name: ten digits like <code>123-456-7890</code>. Use the id of the account the campaigns run in, not your manager account.
          </>
        ),
      },
      {
        key: "oauth",
        title: "Authorise ONE scope and copy the refresh token",
        body: (
          <>
            <p>
              Google Ads has no read-only key, so access comes from an OAuth grant. Exactly one scope is needed, and it is the only one that works:
            </p>
            <div className="mt-2 flex items-start gap-2">
              <pre className="code flex-1">{ADWORDS_SCOPE}</pre>
              <CopyButton text={ADWORDS_SCOPE} label="Copy scope" />
            </div>
            <p className="mt-3">
              Easiest route is {ext("https://developers.google.com/oauthplayground/", "the OAuth playground")}:
            </p>
            <ol className="mt-1 list-decimal space-y-1 pl-5">
              <li>
                Open the gear (top right) → tick <em>Use your own OAuth credentials</em> → paste the client id and secret this deployment is configured with.
              </li>
              <li>
                Paste the scope above into the <em>Input your own scopes</em> box on the left (or pick <em>Google Ads API</em> → the same string from the list), then <em>Authorize APIs</em>.
              </li>
              <li>
                Sign in as <strong>the Google account that can see the ads account</strong> — the one listed in Google Ads under <em>Admin → Access and security</em>. It does not have to be the account that owns the OAuth client or the Cloud project: the client only identifies the app, while the account you sign in as decides whose data the token can read. If the ads account is reached through a manager account, sign in with access to that manager and fill in the login customer id below.
              </li>
              <li>
                <em>Exchange authorization code for tokens</em>, then copy the <strong>refresh token</strong> — a long string starting <code>1//</code>. The access token beside it expires in an hour; it is not the one to paste.
              </li>
            </ol>
            <p className="mt-3">
              If the token stops working after about a week with an <code>invalid_grant</code> error, the OAuth client&apos;s consent screen is still in <em>Testing</em>: Google revokes those refresh tokens after 7 days. Publishing the client fixes it permanently.
            </p>
            <p className="mt-3">
              <strong>Two scopes that look right and are not:</strong> <code>analytics.readonly</code> is Google Analytics, and <code>datamanager</code> is for uploading conversions. A token minted for either is rejected here, so a refresh token you already use elsewhere almost certainly needs re-minting for the scope above. You can reuse the same OAuth client, just not the same token.
            </p>
          </>
        ),
      },
      {
        key: "manager",
        title: "If the account sits under a manager account, note its id too",
        body: <>Agencies and multi-account setups query a child account through the manager. Put the manager&apos;s ten-digit id in the login customer id box; leave it blank otherwise.</>,
      },
    ],
    finalStep: "Paste the customer id and refresh token",
  },
  ga4: {
    source: "ga4",
    name: "Google Analytics 4",
    tagline: "Visitors and sign-ups when the snippet isn't installed yet",
    reads: "Two numbers: active users in the last 30 days and sign_up events. The key is encrypted at rest.",
    minutes: 5,
    steps: [
      {
        key: "property",
        title: "Find your property id",
        body: (
          <>
            In Google Analytics open <em>Admin</em> (gear, bottom left) → <em>Property</em> column → <em>Property details</em>. The id is the number in the top right, e.g. <code>123456789</code>. Not the measurement id (<code>G-…</code>) and not the account id.
          </>
        ),
      },
      {
        key: "service-account",
        title: "Pick or create a service account in Google Cloud",
        body: (
          <>
            {ext("https://console.cloud.google.com/iam-admin/serviceaccounts", "Google Cloud Console → IAM & Admin → Service Accounts")}. Create one (any name, no roles needed) or pick an existing one. Its email ends in <code>iam.gserviceaccount.com</code> — that is the account you want, not the one with your own email address.
          </>
        ),
      },
      {
        key: "key",
        title: "Download a JSON key for it",
        body: (
          <>
            Click the account&apos;s email, open the <em>Keys</em> tab, then <em>Add key → Create new key → JSON → Create</em>. The file downloads once; existing keys cannot be downloaded again, so create a new one if you don&apos;t have the file. If <em>Add key</em> is greyed out with an error mentioning <code>iam.disableServiceAccountKeyCreation</code>, your Google organisation blocks keys — ask an admin to allow them for this project, or skip GA4: the attribution snippet gives you the same numbers.
          </>
        ),
      },
      {
        key: "api",
        title: "Enable the Google Analytics Data API",
        body: <>{ext("https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com", "Enable it here")} in the same Cloud project as the service account.</>,
      },
      {
        key: "access",
        title: "Give the service account Viewer access in Google Analytics",
        body: (
          <>
            The service account is not on any list yet — you type its address in. Open the property → <em>Admin</em> → <em>Property access management</em> → the blue <em>+</em> button top right → <em>Add users</em>. Paste the service account&apos;s email into the email box and press Enter, untick <em>Notify new users by email</em>, choose the <em>Viewer</em> role, click <em>Add</em>. It then appears in the list; wait a minute before connecting. A role on the Cloud project does not count — GA4 keeps its own access list. If there is no <em>+</em> button, your own account is only a Viewer or Analyst on the property; someone with Editor or Administrator has to add it.
          </>
        ),
      },
    ],
    finalStep: "Paste the property id and the JSON key",
  },
};

export const CONNECT_ORDER: SourceType[] = ["stripe", "appstore", "lemonsqueezy", "paddle", "googleads", "postgres", "mixpanel", "ga4"];

export function isSourceType(s: string): s is SourceType {
  return s in CONNECT_GUIDES;
}

/** Simple monogram marks so the list reads at a glance; no third-party logos. */
export function SourceIcon({ source, size = 40 }: { source: SourceType; size?: number }) {
  const spec: Record<SourceType, { bg: string; fg: string; text: string }> = {
    stripe: { bg: "#635bff", fg: "#fff", text: "S" },
    lemonsqueezy: { bg: "#ffc233", fg: "#1f1f1f", text: "LS" },
    paddle: { bg: "#0b0b0b", fg: "#fff", text: "P" },
    ga4: { bg: "#f9ab00", fg: "#1f1f1f", text: "GA" },
    appstore: { bg: "#1d1d1f", fg: "#fff", text: "" },
    postgres: { bg: "#336791", fg: "#fff", text: "PG" },
    mixpanel: { bg: "#7856ff", fg: "#fff", text: "MP" },
    googleads: { bg: "#4285f4", fg: "#fff", text: "Ads" },
  };
  const { bg, fg, text } = spec[source];
  return (
    <span aria-hidden className="inline-flex shrink-0 items-center justify-center rounded-xl font-bold" style={{ width: size, height: size, background: bg, color: fg, fontSize: size * 0.38 }}>
      {text}
    </span>
  );
}

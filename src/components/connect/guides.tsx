import type { ReactNode } from "react";
import type { SourceType } from "@/lib/sources";

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
            Choose <em>Providing this key to another website</em> if asked, name it <code>Founder OS</code>. Never use your secret key (<code>sk_…</code>) — the app refuses it.
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

export const CONNECT_ORDER: SourceType[] = ["stripe", "lemonsqueezy", "paddle", "ga4"];

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
  };
  const { bg, fg, text } = spec[source];
  return (
    <span aria-hidden className="inline-flex shrink-0 items-center justify-center rounded-xl font-bold" style={{ width: size, height: size, background: bg, color: fg, fontSize: size * 0.38 }}>
      {text}
    </span>
  );
}

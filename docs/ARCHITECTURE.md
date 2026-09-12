# Architecture (V1)

Next.js 16 (App Router, server components + server actions), TypeScript,
Tailwind 4, Drizzle ORM on Postgres. One process, no queue, no cron.

```
src/
  app/                    routes (pages, server actions in app/actions, API route handlers)
  components/             client components (forms, pricing interview, copy buttons)
  lib/
    domain/               pure, dependency-free logic — unit-tested, runs in browser and server
      metrics.ts          normalised revenue data → Metrics
      stages.ts           placeStage / diagnose (docs/STAGES.md)
      pricing.ts          interview → recommendation → pricing page block
      attribution.ts      channel classification + per-channel aggregation
      billing.ts          Founder OS's own plan state machine
      money.ts            cents, fees (6% + 50¢), FX table
    db/                   Drizzle schema + client (Neon in prod, embedded PGlite otherwise)
    sources/              read adapters: stripe (restricted key or Connect OAuth), lemonsqueezy, paddle,
                          appstore (App Store Connect sales reports), postgres (founder's own DB, read-only),
                          mixpanel (export API), ga4
    checkout/             CheckoutProvider interface + dodo, polar, mock
    webhooks/             Standard Webhooks signature verification
    services/             DB-backed orchestration used by pages and actions
  proxy.ts                optimistic redirect for signed-out visitors
public/fos.js             the attribution snippet (< 5 KB)
drizzle/                  SQL migrations (drizzle-kit generate); applied automatically on boot
tests/                    vitest — domain units + PGlite integration (checkout flow, diagnosis)
```

## Data flow

1. **Connect.** A source row stores encrypted credentials (`revenue_sources`,
   AES-256-GCM with `ENCRYPTION_KEY`). Every credential is validated with a
   real read before saving and never displayed again (identifiers only;
   Replace / Disconnect). Stripe accepts a read-only restricted key (`rk_…`,
   secret keys refused) or Connect OAuth when the platform is configured.
   Sources split into revenue (Stripe, Lemon Squeezy, Paddle, App Store,
   Postgres with a mapped subscriptions table) and analytics (Postgres users
   table, Mixpanel, GA4); `isRevenueSource` decides. The Connect tab lists
   them as cards; each has a step-by-step page whose ticks persist in
   `connect_checklists` (`components/connect/guides.tsx`). "Save for later"
   stores a draft of the non-secret fields in the same row (`DRAFT_FIELDS`
   allow-list; connection strings lose their password) and clears it on a
   successful connect.
2. **Assess.** `services/diagnosis.runAssessment` pulls every source through
   its adapter into `NormalizedRevenueData`, merges it with live wrapped
   checkout rows, adds funnel signals from `attribution_events` (gaps filled
   from Postgres, then Mixpanel, then GA4 — `fetchAnalyticsSignals`), and
   stores an `assessments` row (metrics + stage + confidence + reasons). The
   diagnosis page reuses the last assessment for 6 hours; "Refresh" forces one.
3. **Price.** The interview is saved on `pricing_interviews` with the
   recommendation and the founder's overrides; `effectiveRecommendation`
   applies the overrides everywhere (pricing block, checkout).
4. **Charge.** `createPlansFromPricing` creates one provider product per tier
   × interval and a `plans` row with a public slug. `/pay/<slug>` is the
   hosted link: it records a `checkout_view` for the anonymous id carried in
   `?fos=`, then `startCheckout` opens a provider session with our metadata
   (`fos_app_id`, `fos_plan_id`, `fos_checkout_session_id`, `fos_anon_id`,
   `fos_mode`).
5. **Reconcile.** `/api/webhooks/<provider>` → `handleCheckoutWebhook`:
   verify signature → dedupe on `(provider, webhook id)` → apply.
   `payment_succeeded` writes a `purchases` row (fee + net), completes the
   checkout session, writes a `purchase` attribution event joined to the
   purchase, stamps `first_purchase`, and checks the $500 unlock threshold.
   `subscription_active/canceled` maintain `wrapped_subscriptions`; `refund`
   marks the purchase.
6. **Attribute.** `fos.js` assigns an anonymous id, stores first-touch source
   (UTM / referrer), sends `pageview` and the founder-called `signup`,
   `activation`, `purchase`, and decorates `/pay/` links with `?fos=<id>`.
   `services/attribution.channelReport` groups per visitor, attributes each
   to their first touch, and derives the 30-day return.

## Providers

- **Checkout** (`lib/checkout`): `dodo` (test/live hosts), `polar` (sandbox =
  test), `mock` (no keys; `/pay/mock/<session>` simulates a payment by posting
  a signed webhook through the real ingest path). Selected by
  `CHECKOUT_PROVIDER`. Both real adapters are written against the providers'
  2026 REST APIs and Standard Webhooks; verify field names against the
  provider dashboard before going live.
- **Founder OS billing** is separate: Stripe Checkout + `/api/webhooks/stripe-billing`.

## Product events

`product_events` (PRD V1 §7): `app_connected`, `source_connected{type}`,
`diagnosis_viewed{stage}`, `pricing_started`, `pricing_completed{model,tiers}`,
`pricing_page_copied`, `checkout_enabled`, `checkout_live`, `first_purchase`,
`snippet_installed`, `stage_changed{from,to}`, `plan_unlocked`. `track()` never throws.

## Non-negotiables carried from the plan

Wrap payment infra, never build it; never hold customer funds (the MoR pays
out); test vs live is shown on every money screen; three numbers and one
action per stage.

## Event settings for analytics sources

After GA4 or Mixpanel is connected the founder lands on
`/app/[appId]/connect/[source]/events`: read **all events** or **selected
events** (checkbox list of everything the tool has collected — GA4 with
all-time counts, Mixpanel names), and **all time** or **only from now on**.
Stored on `revenue_sources.meta.events` (`src/lib/domain/eventSettings.ts`,
pure; `src/lib/services/eventCatalog.ts` reads/writes it and lists events),
kept across a credential replace, editable from the connection page
("Change"). Every GA4 / Mixpanel read goes through `isEventAllowed` and
`readFrom` (the "from now on" floor), so an unticked event is never
requested. Postgres is a table mapping, not events — it has no such step.

## Ad spend

Three sources, in precedence order, merged by `summarizeCampaigns`:

1. **Google Ads** (`src/lib/sources/googleads.ts`) — the authoritative
   figure. GAQL over `campaign` for cost, clicks and impressions. The
   developer token and OAuth client are Founder OS's (env); the founder
   supplies a customer id and a refresh token with the `adwords` scope.
   `login-customer-id` is sent when the account sits under a manager.
2. **GA4** (`advertiserAdCost`) — only populated when the property's Google
   Ads link delivers cost, which it does not for iOS app campaigns. Cost is
   session-scoped there and GA4 answers a wrong-scope request with blank
   cost and a 200, so candidate dimensions are tried and judged on whether
   cost came back (`pickAdRows`).
3. **Typed in** (`ad_spend` table) — fills whatever neither reports, per
   campaign or as one figure for all of them. Rows are marked in the UI.

A reported figure always beats a typed one. Pure parts live in
`domain/googleAds.ts` and `domain/campaigns.ts` and are unit-tested.

## The deployment URL is load-bearing

`APP_URL` (`env.appUrl`) is baked into things that outlive it, so moving the
deployment to a new domain — e.g. `completefounder.com` — is not just a DNS
change:

- **The snippet a founder already pasted** carries the old host in its
  `src`, and so does the `fetch` in the app-install instructions. Those
  installs keep reporting to the old host or stop reporting at all. The old
  host must therefore keep serving `/fos.js` and `/api/collect`
  indefinitely, even after every page redirects.
- **Hosted pay links** (`/pay/<slug>`) already shared with a founder's
  customers have the old host in them; same requirement.
- **Stripe Connect's OAuth callback** is `${APP_URL}/api/connect/stripe/callback`
  and has to be re-registered on the Stripe app for the new domain.
- **Google's OAuth client** needs any new callback URI added before a
  click-through Google flow can work from the new domain.

So a cutover is: point the new domain at the service, set `APP_URL`, keep
the old host alive and un-redirected for those paths, and re-register the
callbacks. Anything else silently drops a customer's data.

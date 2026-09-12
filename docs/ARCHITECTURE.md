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
    sources/              read adapters: stripe (Connect OAuth), lemonsqueezy, paddle, ga4
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
   AES-256-GCM with `ENCRYPTION_KEY`). Stripe is read-only Connect OAuth; the
   others are API keys validated before saving.
2. **Assess.** `services/diagnosis.runAssessment` pulls every source through
   its adapter into `NormalizedRevenueData`, merges it with live wrapped
   checkout rows, adds funnel signals from `attribution_events` (or GA4), and
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

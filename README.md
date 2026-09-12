# Founder OS

The monetization layer for AI-built apps: **diagnose, price, charge.**
This repository holds the business plan, the PRDs, and the V1 application.

- `docs/founder-os-plan-v2.md` — business plan (market, competition, monetization, milestones)
- `docs/PRD-V1-wedge.md` — V1: diagnose, price, charge (this codebase)
- `docs/PRD-V2-growth-layer.md` — V2: launch, grow, memberships A and C
- `docs/PRD-V3-platform-and-capital.md` — V3: platform, vertical B2B, ads, capital, marketplace
- `docs/STAGES.md` — the deterministic stage rules and per-stage diagnosis
- `docs/ARCHITECTURE.md` — how the code is organised and how money and data flow

## What V1 does

1. **Connect and assess** — read-only sources with step-by-step guides:
   Stripe (restricted key or Connect OAuth), App Store (App Store Connect
   sales reports), Lemon Squeezy and Paddle (API key), the founder's own
   Postgres / Supabase database (sign-ups, optional subscriptions table),
   Mixpanel and GA4 (funnel numbers). Places the app at stage 0–3 with a
   confidence flag and shows three numbers, one sentence, one action.
2. **Pricing engine** — an 8-question interview → model, tiers, prices, the
   reasoning in plain language, and a pricing page block (HTML + a Lovable
   prompt). Free and standalone at `/pricing-engine`; every number editable.
3. **Wrapped checkout** — products and hosted checkout links created from the
   pricing, merchant of record behind an interface (Dodo, Polar, or a mock
   that simulates payments). Test/live toggle, 6% + 50¢ per transaction.
4. **Attribution snippet** — one line, < 5 KB, anonymous id only. Pageview,
   signup, activation, checkout view, purchase, 30-day return, by channel.
   Native apps post `install` (plus the same funnel events) straight to
   `/api/collect`, bucketed as "App Store / Play Store". A connected GA4
   property also shows Firebase `first_open` installs by first-touch channel
   and, when linked to Google Ads, spend per campaign with cost per install /
   trial / paid customer and payback.
5. **Billing for Founder OS** — free until $500 lifetime revenue through
   checkout, then $39/mo; Stripe-connected founders $29/mo after 14 days.

## Run it

```bash
npm install
cp .env.example .env      # defaults run on an embedded database with simulated payments
npm run dev               # http://localhost:3000
```

No Postgres needed locally: without `DATABASE_URL` the app uses an embedded
PGlite database in `./.data`. Set `DATABASE_URL` (Neon) for production; the
migrations in `drizzle/` apply automatically on first use.

```bash
npm test          # vitest: domain units + an end-to-end checkout flow on PGlite
npm run check     # tsc
npm run lint      # eslint
npm run build     # next build
npm run db:generate   # after changing src/lib/db/schema.ts
```

## Configuration

See `.env.example`. The minimum for a real deployment: `APP_URL`,
`SESSION_SECRET`, `ENCRYPTION_KEY`, `DATABASE_URL`, and either
`CHECKOUT_PROVIDER=dodo` + Dodo keys or `CHECKOUT_PROVIDER=polar` + Polar keys.
Stripe Connect (`STRIPE_SECRET_KEY`, `STRIPE_CONNECT_CLIENT_ID`) enables the
read-only Stripe connection; the Stripe price ids enable Founder OS billing.

Webhook endpoints to register: `/api/webhooks/dodo`, `/api/webhooks/polar`,
`/api/webhooks/stripe-billing`.

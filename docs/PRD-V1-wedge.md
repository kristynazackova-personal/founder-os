# PRD V1: Diagnose, price, charge
Working name: [TBD] | Owner: Kristyna Zackova | Status: Draft | Target: months 0 to 5

## 1. Goal
Get 30 beta founders through connect → diagnosis → price → live checkout, with at least 5 taking real payments through us. Prove founders trust the product with the pricing decision and accept 6% + 50¢.

## 2. Target user
Solo, non-technical founder who published an app on Lovable, Bolt, Replit or Base44 in the last 90 days. Two entry profiles:
- **New builder**: live app, no checkout, $0 (stage 0 to 1).
- **Early earner**: Stripe already connected, 1 to 50 paying users (stage 2 to 3).

## 3. Problem
The build is done in a weekend. The founder does not know what to charge, breaks the app wiring checkout, and has no idea whether they are doing well. Existing tools assume the answer to the previous step.

## 4. Scope

### In
1. **Connect and assess** (ship first)
   - Read-only OAuth for Stripe. Lemon Squeezy and Paddle via API key.
   - Optional: published URL, Lovable/Bolt project link, GA4 read.
   - Automatic assessment: paying users, MRR, MoM growth, churn, signup rate (if analytics connected), days since launch.
   - Stage placement (0 to 3 in V1) with data-confidence flag.
   - Diagnosis screen: three numbers, one sentence, one action, peer band where data allows.
2. **Pricing engine**
   - Guided interview (5 to 8 questions): who it's for, what it replaces, value metric, comparables, willingness-to-pay anchors.
   - Output: recommended model (one-time / subscription / usage), 1 to 3 tiers, price points, reasoning, and a generated pricing page block (copy + structure) the founder pastes into Lovable/Bolt.
   - Works standalone and free (top-of-funnel).
3. **Wrapped checkout**
   - Merchant of record via Dodo Payments API (provider abstracted; Polar as fallback).
   - Products and prices created from the pricing engine output.
   - Hosted checkout link + embeddable button; subscriptions and one-time; test/live toggle.
   - Founder never sees the MoR. Payouts, tax, refunds handled through us.
4. **Attribution snippet (basic)**
   - One-line script. Captures: source (UTM/referrer), signup, activation event (defined in pricing interview), checkout view, purchase, 30-day return.
   - Purchase joins to checkout or Stripe data.
5. **Stage KPIs for stages 0 to 3** (see plan doc, section 5).
6. **Billing for us**: free until $500 lifetime revenue on wrapped checkout, then $39/mo auto-unlock. Stripe-connected founders: $29/mo after 14-day trial.

### Out (V2+)
Launch sequence, weekly playbook, memberships, stages 4 to 5, Lovable/Bolt marketplace listings, ads, partner network, financing.

## 5. User stories
- As a new builder, I connect my app and in under 5 minutes see what stage I'm at and what to do this week.
- As a new builder, I answer 8 questions and get a pricing page I can paste into Lovable.
- As a new builder, I turn on checkout without touching a backend and receive my first payout.
- As an early earner, I connect Stripe read-only and see churn and growth vs. apps like mine.
- As either, I install one line and see which channel my paying users came from.

## 6. Functional requirements
- Diagnosis loads in <10s after connect; degrades gracefully when only one source is connected.
- Stage rules are deterministic and documented; the founder can see why they were placed.
- Pricing engine explains every recommendation in plain language; founder can override any number.
- Checkout provider is behind an internal interface (create product, create price, create checkout, webhook ingest, refund).
- Webhooks reconcile purchases to attribution events within 5 minutes.
- Snippet is <5KB, no PII beyond an anonymous ID until purchase.
- All money-related screens show test vs live state unambiguously.

## 7. Data and events
`app_connected`, `source_connected{type}`, `diagnosis_viewed{stage}`, `pricing_started`, `pricing_completed{model,tiers}`, `pricing_page_copied`, `checkout_enabled`, `checkout_live`, `first_purchase`, `snippet_installed`, `stage_changed{from,to}`, `plan_unlocked`.

## 8. Integrations
Stripe (read), Dodo (MoR), Polar (fallback), Lemon Squeezy and Paddle (read via key), GA4 (read), Supabase (optional read key for signups).

## 9. Success metrics (end of month 5)
- 30 founders connected; median time to diagnosis <5 min.
- 60% of connected founders complete the pricing interview.
- 15 founders enable checkout; 5 with a live purchase.
- Attribution snippet installed by 50% of checkout-enabled founders.
- $1K+ MRR in merchant GMV through wrapped checkout.
- Qualitative: 8 of 20 interviewed founders say "I'd give you a cut."

## 10. Risks
- Founders won't accept 6%: fall back to subscription-after-first-dollar; test both in beta.
- MoR onboarding delays or rejections: pre-approve with Dodo; keep Polar warm.
- Snippet install friction on Lovable: ship a copy-paste prompt ("add this script to index.html") and a template.
- Data too thin for peer bands: show absolute benchmarks from public data until n>50 per stage.

## 11. Dependencies
Dodo partner account, Stripe Connect read-only app approval, 20 founder interviews (recruit via r/lovable, Lovable Discord, MentorCruise), 500-app crawl to size stage 0 to 1 share.

## 12. Open questions
- Activation event: founder-defined vs. inferred? (V1: founder-defined in interview.)
- Do we build the pricing page or only generate the block? (V1: block only.)
- Minimum data to show a peer band without misleading?

## 13. Release criteria
Five founders with live purchases through wrapped checkout, zero money-handling incidents, diagnosis accuracy validated by hand on 30 accounts.

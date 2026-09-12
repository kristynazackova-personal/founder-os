# Roadmap: features that help the current customer (Selvenn) grow revenue

Written 2026-09-12 from a review of what Founder OS ships versus what its one
signed-up customer needs. Selvenn: consumer app on Apple weekly subscriptions
($3.99 / $5.99, 7-day free trial) plus two Stripe web subscriptions; 3–4 real
paying customers; planned bets are an annual plan, a founding-member win-back
offer, a coach per-client Stripe tier, and Google Ads app campaigns.

**Working rule: build all eight, one per session, in this order. The next
session works on #1 ONLY — do not start #2 until #1 is merged and deployed.**

Status legend: `todo` · `in progress` · `done (commit)`.

---

## 1. Trial funnel + lapse detection — `done` (2026-09-12, session branch claude/trusting-shannon-3wndg6; deploy = fast-forward the default branch)

Why: for a weekly plan with a free trial the business is trial starts →
trial-to-paid rate → weeks survived. Today Founder OS counts trials
(`trialingUsers`) but computes no conversion rate, and a subscriber whose
renewals simply stopped stays "active" until Apple reports a cancel, so
paying customers, MRR, churn and the stage placement are all overstated.

Build:
- `src/lib/sources/appstore.ts` `normalizeAppStore(events, now)`: infer expiry.
  A subscription whose last paid event is older than one billing period
  (`interval × intervalCount`) plus Apple's billing-retry grace (16 days) is
  lapsed: `status: "canceled"`, `canceledAt` = last paid event + period +
  grace. Same rule for a trial with no paid event after trial length + grace
  (trial length = the intro-offer duration when the report carries it, else
  the plan period). Keep the parser pure; `now` is a parameter.
- Stripe: treat `past_due` beyond 16 days since `current_period_end` the same
  way if the adapter can see it; otherwise leave Stripe alone (its statuses
  are authoritative).
- `src/lib/domain/metrics.ts`: add `trialStarts30d`, `trialConversions30d`
  (trials that reached a paid event within the window), `trialToPaid30d`
  (fraction, null when no starts), `lapsed30d`. Source is the normalised
  subscription list — it needs `trialStartedAt` and `firstPaidAt` on
  `NormalizedSubscription` (nullable; only App Store and Stripe fill them).
- Diagnosis page "All the numbers": Trial starts 30d · Trial → paid ·
  Lapsed 30d. Stage-2 KPI card hint already shows trials; add the rate.
- Attribution: nothing.
- Tests: `tests/appstore.test.ts` (lapsed weekly, lapsed trial, still-active
  weekly renewed 3 days ago, yearly not lapsed after 40 days),
  `tests/metrics.test.ts` (rates, nulls).
- `docs/STAGES.md`: document that "active" means renewed within one period +
  grace for report-derived sources.

Done when: Selvenn's diagnosis shows the true paying count (3–4), trial
starts and trial → paid for the last 30 days, and `npm test`, `check`,
`lint`, `build` pass.

## 2. Cost per paid user and payback by campaign — `done` (2026-09-12; GA4 read + manual spend entry, since GA4 supplies no cost for this property — see 2b)

Why: Selvenn spends on Google Ads app campaigns and Founder OS has no
ad-cost data. GA4's Google Ads link exposes clicks and cost per campaign
next to `first_open`, `trial_start`, `purchase` with first-touch campaign.

Build: `src/lib/sources/ga4.ts` `fetchGa4Campaigns(credentials, days)` —
runReport with dimensions `firstUserGoogleAdsCampaignName` (fallback
`firstUserCampaignName`), metrics `advertiserAdClicks`, `advertiserAdCost`,
plus event counts for `first_open`, `sign_up`, `trial_start`, `purchase`
(one report per event with the same dimension, or `eventName` as a second
dimension). Pure aggregation in `src/lib/domain/campaigns.ts`: cost per
install, per trial, per paid; payback = CPA ÷ monthly-equivalent price
(from the app's plans or the diagnosis MRR ÷ paying users). Attribution page
section "Paid campaigns, last 30 days" — table campaign · spend · installs ·
trials · paid · CAC · payback months, with an unambiguous "not connected /
no Google Ads link" state. Read-only; no spend controls (that is V3).

## 2b. Google Ads as a first-class source — `todo` — NEXT SESSION

Why: GA4 was proven unable to supply Selvenn's ad spend (2026-09-12). The
Google Ads account IS linked to property 552881470, yet every valid
dimension accepted the cost query and reported zero, and a dimensionless
query is rejected outright ("Please add sessionCampaignName to make the
request compatible"). For iOS App campaigns GA4 never receives per-user
campaign attribution, so this is not a misconfiguration to hunt down.
Manual entry now covers the gap (item 2, shipped) but the real source is
the Google Ads API.

Build: a `googleads` source behind the existing `RevenueAdapter`/analytics
pattern. OAuth with the `adwords` scope (the founder clicks through, same
as Stripe Connect); the DEVELOPER TOKEN belongs to Founder OS, not the
founder, so one approved token serves every customer. Read with GAQL over
`campaign` + `metrics.cost_micros`, `metrics.clicks`,
`metrics.impressions`, `segments.date`, per campaign per day; feed
`CampaignAdRow` so `summarizeCampaigns` needs no change. Precedence:
Google Ads > GA4 > manual.

BLOCKED ON: a Google Ads manager account and an approved developer token
(basic access). Days to weeks, and not something a session can do. Do not
start the code until the token exists — check with the founder first.

## 3. Paywall views from apps — `todo`

Why: "checkout → paid" is blank for Selvenn because `checkout_view` only
fires on Founder OS pay pages. The collector already accepts the event.

Build: document `checkout_view` in the attribution page's app step (the
fetch snippet gets a third example line) and in `public/fos.js`'s header
comment; count it in `snippetSignals` (already does). In the Selvenn repo:
send it from the mobile paywall screen and the web subscribe screen through
the Founder OS sink (`apps/mobile/lib/founderOs.ts` maps a
`Paywall Viewed`-style analytics event; web calls `fosTrack("checkout_view")`
— extend the web helper's event union).

## 4. Revenue by plan and rail — `todo`

Why: Selvenn runs a consumer engine on Apple and a coach engine on Stripe;
its plan gives 80% of founder time to whichever retains better. Founder OS
merges everything into one MRR.

Build: `NormalizedSubscription` gains `source` (stripe | appstore | …) and
`planName` (Stripe price nickname / product name, App Store subscription
name). `computeMetrics` returns `byPlan: Array<{ source, planName,
payingUsers, mrrUsdCents, churn30d }>`. Diagnosis page: a "By plan" table
under "All the numbers". Tests on the split.

## 5. Weekly cohort retention — `todo`

Why: 30-day churn is a monthly-SaaS metric; weekly subscriptions need
week-1…week-8 survival per signup cohort.

Build: pure `src/lib/domain/cohorts.ts` `weeklyCohorts(subscriptions, now,
weeks = 8)` → rows per start-week with survivors per week (uses the lapse
logic from #1). Diagnosis page: a small survival table (cohort × week, %),
last 8 cohorts. Tests with synthetic subscriptions.

## 6. Consumer app-store mode in the pricing engine — `todo`

Why: the interview assumes monthly SaaS; Selvenn's open questions are an
$89 annual plan and a $49 founding-member offer on Apple's 15/30% cut.

Build: `PricingAnswers` gains `channel: "web" | "app_store"`, `trialDays`,
`introOffer` (none | discounted first period | free trial), and the engine
applies the store fee to net revenue, recommends an annual anchor when
frequency is daily/weekly, and shows net-per-user after fee and expected
trial conversion (default 20% until #1 supplies the real rate — read it
from the latest assessment when present). Pricing page block gets the
annual line. Tests in `tests/pricing.test.ts`.

## 7. Win-back segments — `todo`

Why: the reactivation campaign is Selvenn's biggest planned revenue lever;
the Postgres source can see users.

Build: with a Postgres source connected, a "Win-back" section on the
diagnosis (or a new `/app/[appId]/winback` page): lapsed trials, expired
subscribers, and signed-up-never-paid users with last-active date, counts
per segment, and a CSV export (email column only when the users table has
one — never render emails in the page, count them). Requires the users /
subscriptions table mapping the Postgres source already asks for.

## 8. Weekly playbook — `todo`

Why: three data-triggered actions a week is the V2 feature most likely to
change a solo founder's behaviour; credible only once #1 and #2 supply real
numbers.

Build: `src/lib/domain/playbook.ts` — deterministic rules over `Metrics` +
campaign rows: e.g. trial → paid < 15% → "move the paywall to after the
first result"; a campaign with payback > 6 months → "pause it"; lapsed30d >
signups30d → "win-back email this week". Each action shows the numbers that
triggered it. Rendered as "This week" on the diagnosis page, three items
max, with a done checkbox stored per app per ISO week. Tests on the rules.

# Metrics and funnels

The definitions behind the Selvenn admin dashboard. Every tile on that
dashboard links to an anchor here; if a number on screen and a number here
disagree, this file is wrong and should be fixed, not the dashboard.

Design: **Selvenn Metrics Dashboard** canvas -
`https://claude.ai/artifact/HW6wmJACwaYGfZKfoCYKQy` (Overview, Acquisition,
Onboarding, Activation & Retention, Revenue, Loops, plus the metric-tile
anatomy). **Every figure on that canvas is mock data**, chosen to exercise the
formatting rules below (counts beside rates, rates suppressed under n = 30).
No number in this document is a measurement either - the tables here name
steps, sources and gates, not values.

---

## 1. Reading rules

These apply to every tile, table and funnel. They exist because Selvenn's
denominators are small enough that ordinary dashboard conventions mislead.

- **Cohorts are ISO weeks by signup date.** A retention cell appears only once
  its window has fully elapsed - never a partial week rendered as if complete.
- **A rate needs a denominator of 30.** Below that the tile shows the count
  pair instead (`3 of 11`), and the rate is not rendered at all.
- **The count stays visible next to every rate.** `26% · 9 of 34`, never `26%`
  alone.
- **A metric that cannot be computed shows `—`, never `0`.** Absent data and
  zero are different answers and must not look alike.
- **Verdicts are icon plus label, never colour alone**: on target · below gate ·
  watch · failing · not measurable · no gate · count.
- **Deltas are signed and compared to the prior complete week.** Colour encodes
  direction × whether up is good, so a rising failure rate is red.
- **Sparklines cover eight complete weeks**, muted, with the current week as
  the only accent mark. No axis - the n line carries the number.
- **Internal accounts are excluded by default**, and the count of exclusions is
  shown next to the toggle.
- **Amber caveat = the source is a posted client event**, which undercounts
  until every user is on the build that posts it.

### Source badges

| Badge | Source | Standing |
|---|---|---|
| `PG` | Postgres | System of record |
| `MP` | Mixpanel | Product events |
| `GA4` | Google Analytics 4 / Firebase | The only source that knows ad clicks |
| `Apple` | App Store Connect | Subscription truth for the iOS rail |
| `Stripe` | Stripe | Subscription truth for the web rail |
| `SendGrid` | SendGrid | Email delivery and engagement |

A tile spanning two rails shows both badges.

### Gates and bands

Two different kinds of target, never mixed:

- **Own gates** come first - Selvenn's own thresholds, e.g. *Gate 2: D1 ≥ 20%,
  D7 ≥ 8%*. A gate also carries a minimum n (Gate 2 needs n ≥ 100); below it
  the tile says the gate cannot be judged yet rather than passing or failing it.
- **Market bands** come second, always labelled with their denominator and
  source, e.g. health-and-wellness D7 ≈ 7–8.5% and D30 ≈ 4%.

---

## 2. The ten numbers

The weekly fifteen-minute read. Everything else on the dashboard exists to
explain one of these.

| # | Metric | Definition | Source |
|---|---|---|---|
| 1 | **North star** | Share of a signup cohort with a *second* analysis or coaching session within 7 days | PG |
| 2 | **Signups** | New accounts, split web / iOS / android | PG |
| 3 | **Wizard completion** | Signups that finished every onboarding question | PG |
| 4 | **Activated ≤ 24 h** | Signups with any first-value event within 24 h: a Lena session, an analysis, an exercise or a journal entry | PG |
| 5 | **D1 · D7 · D30** | Share of the cohort active in the day-1 / 7 / 30 window | PG |
| 6 | **WAU · streak-done share** | Weekly active users, and the share of them with a done week | PG |
| 7 | **Paywall → trial → paid** | The monetization funnel's three live steps | PG + Apple + Stripe |
| 8 | **Active subs · early cancels** | Active subscribers, and trials cancelled inside the trial | PG + Apple + Stripe |
| 9 | **Push opened · email returned ≤ 48 h** | The two loop engines' effectiveness | PG + SendGrid |
| 10 | **Session failure · open issues** | Voice session failure rate against the < 3% guardrail | PG |

### The activity spine

Wherever this document says "active", it means any of: a coaching session, an
analysis, a chat message, a task submission, a journal entry, or an
authenticated cold-start launch ping. One definition, used by D1/D7/D30, the
cohort triangle, WAU, streaks, resurrection, churn, and every
"returned ≤ 48 h" figure - so those numbers are comparable with each other.

---

## 3. Acquisition

Where signups come from, and what each channel's users do afterwards.

| Metric | Definition | Source | Target |
|---|---|---|---|
| Signups | New accounts by platform | PG | count |
| Landing → signup (web) | Signups ÷ distinct sessions on `/` | PG | campaign-page band 3.8–6.6%; home traffic reads lower |
| Install → signup (iOS) | Signups ÷ first opens | PG + GA4 | no reliable market bar |
| Attribution coverage | Signups carrying a source ÷ all signups | PG | iOS campaign is not attributable in-app |

**Per channel** the table carries web signups, iOS signups, activated and D7 -
channels are judged on what their users *did*, never on volume.
Channels tracked: email waves, Google Ads iOS app campaign, organic App Store
search, organic web search / direct, coach invite, partner invite, unknown.

### Google Ads → app (iOS)

Ad clicks → first opens → signups → onboarding started → trial started, with
an "all" column and a "from Ads" column.

- GA4 first-touch campaign is the only ad-click source.
- **The attributed column is a floor, not a measurement.** With ATT off, iOS
  App campaigns do not report per-user campaign attribution, so attributed
  counts undercount by an unknown amount.
- Cost per **activated** user is the figure to read from the Ads console.
  **Never optimise to signups.**

### Experiments

Each A/B row shows users, the step rate, D7 as a count pair, and paid - plus an
explicit "not significant at this n" chip where that is the case. Running
experiments: `landing_livedemo_v1` (landing, all-time), `welcome_screen_v1`
(iOS welcome screen, device-level from the launch ping, keep running below 100
per arm), `lena_onboarding_v1` (recap vs coaching-first first session).

---

## 4. Onboarding

Signup → consent → every wizard question → tour → paywall, web against iOS.

| Metric | Definition | Source |
|---|---|---|
| Wizard completion | Finished the questions ÷ signups, split by platform | PG |
| Worst step | The question with the most users left standing on it | PG |
| Time to complete | Median and p75 signup → last question, split by platform | PG |
| Consent rate (iOS) | AI-consent grants ÷ iOS signups (web has no separate step) | PG |

### The funnel steps, in order

Landing / install → signup → AI consent (iOS only) → pitch page → name +
gender → goal → life areas → coach should know → hobbies → commitment → why
now → product tour → plans (wizard paywall) → paywall viewed (any screen) →
tier selected → subscribed.

Distinct users per step, reconstructed from Postgres. Each question step also
carries **answered / skipped / left** - a question a user skipped and one they
abandoned are different failures and are never summed. Steps marked
*event-only* come from posted client events and undercount until every user is
on that build; the iOS tour stamp precedes the tour itself.

### Paywall outcomes

Siblings off the paywall view, never a single path: Lena opened from the
paywall, tier selected (split by tier), subscribed (as a share of paywall
views *and* of signups).

**Paywall dismissal is not recorded** - see fix #7.

---

## 5. Activation and retention

Did day two happen, and did the week happen.

| Metric | Definition | Source | Target |
|---|---|---|---|
| Activated ≤ 24 h | Any first-value event within 24 h, with the per-surface split | PG | no gate yet |
| Time to first value | Median signup → first completed session or analysis, plus p75 | PG | - |
| First Lena session | Started ÷ signups, with completed / failed / left | PG | failures are a guardrail, not a funnel step |
| North star | Second analysis or session ≤ 7 days | PG | KPI, no gate yet |
| D1 · D7 · D30 | Active in the day-1 / 7 / 30 window | PG | Gate 2: D1 ≥ 20%, D7 ≥ 8%, needs n ≥ 100 |

Because a single week's cohort is too small to judge Gate 2, the tile shows
both the latest cohort and the four-week pooled figure with its pooled n.

### Cohort triangle

Share of each signup week's cohort active in week N, on the activity spine.
One hue, darker = more, never a rainbow. A cell appears only once its week has
elapsed. Market reference: health and wellness D7 ≈ 7–8.5%, D30 ≈ 4%.

### Per active user

Totals, distinct users and per-WAU for coaching sessions, analyses completed,
exercises submitted, journal entries and chat messages. Per-WAU is the figure
that matters; totals move with WAU and flatter a growing week.

### Weekly streak

Users with ≥ 3 active days in the rolling week, bucketed 0 (week not done) /
1 week / 2–3 weeks / 4+ weeks, plus the share of WAU with a done week.

### Resurrected and churned

- **Resurrected** - active this week, with nothing in the prior four. Broken
  down by what brought them back (push, win-back email).
- **Churned** - 30 days without any activity on the spine. Reported with the
  last action before the gap and lifetime analyses at churn, because the shape
  of a churn tells you which surface failed.

---

## 6. Revenue

Paywall → trial → paid → renewal, by tier, plan interval and rail.

| Metric | Definition | Source | State |
|---|---|---|---|
| Active subscribers | Active subs by tier and rail, sponsored counted separately | PG + Apple + Stripe | live |
| MRR (normalised) | Weekly × 52 ÷ 12; annual ÷ 12. ARPPU alongside | Apple + Stripe | needs price + interval on `subscriptions` - fix #2 |
| Trials started | Trials by rail, and as a share of paywall views | PG | live |
| Trial → paid | First charge after a trial | Apple + Stripe | **not measurable in Postgres** - fix #2. Read App Store Connect meanwhile; short-trial band ≈ 25% |
| Early cancels | Trials cancelled inside the trial window | PG | live |

### Monetization funnel

Signups → paywall viewed (any) → tier selected → checkout started → trial
started → trial → paid → first renewal, per platform.

Steps marked event-only are posted client events. Web `checkout_started` is
not posted (fix #6). Trial → paid and first renewal are not in Postgres
(fix #2) and read `n/a` rather than zero.

### Free → paid

Subscribed ÷ signups, by signup cohort. Market band 1–3% of registered-free
users; health-and-fitness download → paid ≈ 2.9%. At Selvenn's n this is a
**floor, read as a floor**.

### Reconciliation

Active subscribers counted from Postgres, App Store Connect and Stripe side by
side, flagged red when they differ by more than one. Apple + Stripe must equal
the Postgres count; a persistent gap is a bug in the subscription write path,
not a reporting quirk.

### Cancellations and refunds

Cancelled count, median tenure, how many fell inside the trial, refunds by
rail, and Stripe billing retries. **Cancel reasons are not collected** -
win-back replies are the only signal.

### Payers versus free

Sessions per day and tasks per day, normalised per day, for paying, cancelled
and never-paid users. The comparison that says whether paying correlates with
using it.

---

## 7. Loops

The day-two engine: push, lifecycle email, Next Step, partner and coach.

| Metric | Definition | Source | Note |
|---|---|---|---|
| Push opened | Opens ÷ sends | PG | Exact only since 2026-09-12; earlier sends carry no open id. `likely-opened` is the estimate that fills the gap |
| Push → returned ≤ 48 h | Active on the spine within 48 h of a send | PG | the number that actually matters |
| Push opt-in (iOS) | Signups with an active device token | PG | prompt outcome not recorded - fix #8 |
| Email → returned ≤ 48 h | Active within 48 h of a send | PG + SendGrid | opens and clicks not pulled - fix #9 |
| Email reachable | Opted in and not bounced ÷ users | PG | - |

One log row is **one device per send**, so push counts are deliveries the
transport accepted, not people.

### Push by trigger

Sent, failed, opened, returned and return % per trigger: daily reminder, Next
Step, level-up imminent (9 pm), journal reminder, day-2 follow-up, analysis
complete.

### Lifecycle email by kind

Sent, opened, returned and subscribed (paid within 7 days of the send), read
from each service's claim table: onboarding nudge T1/T2, day-2 follow-up email
fallback, trial reminder (day 5), trial win-back, weekly check-in, Next Step
email, judge-gated re-analysis.

### Next Step

Shown → tapped → converted, per surface: Today card, session handoff, push,
email. State and register in the drill-down.

### Partner loop

Invites sent → accepted → both partners active in the same week, plus Partner
Match generations. The middle step is where it fails.

### Coach engine

Coach signups → verified → sent ≥ 1 invite → ≥ 1 client connected → ≥ 2 real
clients → billable clients. Web only. **Billable = connected plus at least one
session per month.** Gate 1 needs ≥ 5 coaches at the "≥ 2 real clients" step.

---

## 8. Metric tile anatomy

The contract every tile on the dashboard keeps.

| Part | Rule |
|---|---|
| **Label** | Sentence case, naming the definition in this document; the tile links to its anchor |
| **Source badge** | PG · MP · GA4 · Apple · Stripe · SendGrid. Two rails show both |
| **Value** | Proportional figures at 30 px. A rate only when its denominator ≥ 30, otherwise the count pair is the value. Not computable shows `—`, never `0` |
| **n line** | Always numerator and denominator, plus the split that explains the number (platform, tier, rail) |
| **Target line** | Own gates first (Gate 2: D1 ≥ 20%, D7 ≥ 8%), market bands second and labelled with their denominator |
| **Verdict chip** | Icon + label, never colour alone |
| **Delta** | Signed, against the prior complete week. Colour = direction × whether up is good |
| **Sparkline** | Eight complete weeks, muted, current week the only accent. No axis |
| **Caveat** | Amber with a triangle: a posted client event, a fix number from this document, or the interim workaround |

Series colours: web, iOS, other/android, and the Selvenn accent for totals and
the current point. Cohort cells use one sequential hue, light → dark.

---

## 9. Known measurement gaps

Numbered as the dashboard's caveats reference them. Each one is a metric that
cannot currently be computed, not a metric that reads zero.

| Fix | Gap | Consequence | Interim |
|---|---|---|---|
| **#2** | `subscriptions` carries no price or interval, and no first-charge or renewal lifecycle columns | Trial → paid, first renewal and a trustworthy normalised MRR are all unavailable | Read trial conversion from App Store Connect |
| **#6** | Web `checkout_started` is not posted | The web monetization funnel skips a step | iOS only for that step |
| **#7** | Paywall dismissal is not recorded | Paywall views cannot be split into dismissed vs progressed | Infer from the siblings that were recorded |
| **#8** | The iOS push-permission prompt outcome is not recorded | Opt-in is measured from tokens that exist, so a declined prompt looks the same as a prompt never shown | Token presence as a floor |
| **#9** | SendGrid engagement events are not pulled | Email opens and clicks are blank; only "returned ≤ 48 h" works | Union view plus an event webhook |

Fix numbers are the dashboard's own; they are referenced on the tiles they
affect so a blank figure always says why it is blank.

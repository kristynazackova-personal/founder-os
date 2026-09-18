# B2C analytics

A consumer-funnel dashboard for the founder's own app, at
`/app/<appId>/b2c`. Modelled on Selvenn's `/admin/v2` (its definitions are in
that repo's `docs/METRICS_AND_FUNNELS.md`, mirrored here as
`docs/METRICS_AND_FUNNELS.md`), and built to the same presentation contract.

**It is additive.** Diagnosis and Attribution are untouched: they answer "what
stage am I at" and "which channel produced a payment". This answers a third
question — *what happens to the people who arrive* — cohort by cohort. It
writes nothing, and reads the same tables those pages already read, so if it
breaks they keep working.

## Why the presentation rules matter more than the metrics

Founder OS customers have small numbers. At n = 11, "27%" is one person
changing their mind. Every rule below exists because the ordinary dashboard
convention lies at this scale, and they are enforced in
`src/lib/domain/b2c.ts`, not left to each page:

- **A rate needs a denominator of 30** (`MIN_RATE_DENOMINATOR`). Below that the
  value *is* the count pair — `3 of 11` — and no percentage is rendered.
- **The count is always printed beside the rate** in the n line.
- **Not computable reads `—`, never `0`.** A metric with no connected source
  is a `notMeasurable` tile that says which connection would answer it.
- **Only complete ISO weeks.** `completeWeeks` excludes the running week; a
  partial week beside complete ones always reads as a collapse.
- **A cohort is held out of a checkpoint until its window has elapsed.** A
  cohort that signed up two days ago contributes to D1 and to nothing else,
  and a triangle cell stays blank rather than showing 0%.
- **A verdict is an icon plus a label**, never colour alone.
- **A delta is coloured by direction × whether up is good**, so a rising
  failure rate is red.

## The five views

| View | Answers | Source |
|---|---|---|
| **Overview** | the weekly read: north star, activation, signups, D1/D7, paying, signup → paid, trials, early cancels | snippet + rails |
| **Acquisition** | signups by week and channel, visit → signup, install → signup, attribution coverage, the snippet funnel | snippet |
| **Activation & retention** | activated ≤ 24 h, time to first value, north star, D1/D7/D30, the cohort triangle, active visitors per week | snippet |
| **Revenue** | paying, MRR, checkout → paid, trial → paid, the monetization funnel, paid by signup cohort | rails + snippet |
| **Coverage** | every metric that has no source, why, and the connection that would fix it | — |

"Loops" from the Selvenn dashboard has no counterpart here on purpose:
Founder OS never sees a customer's push or lifecycle email sends, so there is
no source for it. Coverage says so rather than the page implying otherwise.

## Definitions

<a id="signups"></a>**Signups** — distinct anonymous ids that fired `signup`,
by the ISO week they signed up in. Platform is `app` when that visitor ever
reported an `install` or arrived with a store source, else `web` — the only
platform signal the snippet carries.

<a id="activation"></a>**Activated ≤ 24 h** — signups whose first `activation`
or `purchase` landed within `ACTIVATION_HOURS` of signing up.

<a id="north-star"></a>**North star** — signups with a *second* activation or
purchase within `NORTH_STAR_DAYS` (7) of signing up: they came back for more,
which is the earliest honest signal of retention. Only cohorts whose seven
days have fully elapsed are in the denominator.

<a id="retention"></a>**D1 · D7 · D30** — share of the cohort active in the
24 hours that begin N days after signup. "Active" is any snippet event at all.
Bands come from public consumer-app benchmarks (D1 ≈ 25%, D7 ≈ 8%,
D30 ≈ 4%) and are labelled as such; this dashboard sets no gates of its own,
because a gate belongs to an app, not to a tool.

<a id="signup-to-paid"></a>**Signup → paid** — snippet purchases from a signup
cohort ÷ that cohort's signups. Market band 1–3% of registered-free users. At
these denominators, read it as a floor.

<a id="paying"></a>**Paying customers** — subscriptions reading `active` or
`past_due` across every connected rail plus wrapped checkout. Trials are
counted separately and never as paying, the same rule as `isUserPremium`
elsewhere.

<a id="trials"></a>**Trials started** — subscriptions whose `trialStartedAt`
falls in the window. Only rails that report trial dates can contribute.

<a id="early-cancels"></a>**Early cancels** — subscriptions closed within
`EARLY_CANCEL_DAYS` (9) of starting. The fastest signal that the first week
disappoints.

**Attribution coverage** — signups whose channel is neither `direct` nor
`other`: the share you could actually act on. iOS App campaigns cannot be
attributed per campaign client-side, so every store install shares one bucket.

## Where the code lives

```
src/lib/domain/b2c.ts          pure: weeks, rate rules, tiles, cohorts, triangle, funnel
src/lib/services/b2cAnalytics.ts  loads snippet events + rails, assembles one payload per view
src/components/b2c/tiles.tsx   the tile anatomy and the charts
src/app/app/[appId]/b2c/       layout + sub-nav, overview page, [section] page
tests/b2c.test.ts              the presentation rules and the cohort maths
```

The domain module stays pure (the repo rule): no DB, no env, no network, so
the rules that decide whether a number may be shown are testable without
Postgres. `tests/b2c.test.ts` pins them — including that a rate under 30
becomes a count pair, that a fresh cohort is excluded from D7, and that a
triangle cell is null rather than 0%.

Every loader is fail-soft: a source that throws lands in `sourceErrors`, its
tiles read `—`, and the rest of the page renders.

## Deliberately not here

- **Push and lifecycle email.** No source. Not inferable.
- **Per-screen onboarding funnels.** The snippet reports signup and
  activation, not each screen of someone else's wizard.
- **Gates.** Selvenn's dashboard judges against Selvenn's own gates; a
  multi-tenant tool has no business inventing thresholds for an app it did not
  build. Market bands are shown with their denominator instead.

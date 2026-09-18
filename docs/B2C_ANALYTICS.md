# B2C analytics

A consumer-funnel dashboard for the founder's own app, at
`/app/<appId>/b2c`. Modelled on Selvenn's `/admin/v2` (its definitions are in
that repo's `docs/METRICS_AND_FUNNELS.md`, mirrored here as
`docs/METRICS_AND_FUNNELS.md`), and built to the same presentation contract.

**It is additive.** Diagnosis and Attribution are untouched: they answer "what
stage am I at" and "which channel produced a payment". This answers a third
question - *what happens to the people who arrive* - cohort by cohort. It
writes nothing, and reads the same tables those pages already read, so if it
breaks they keep working.

## Why the presentation rules matter more than the metrics

Founder OS customers have small numbers. At n = 11, "27%" is one person
changing their mind. Every rule below exists because the ordinary dashboard
convention lies at this scale, and they are enforced in
`src/lib/domain/b2c.ts`, not left to each page:

- **A rate needs a denominator of 30** (`MIN_RATE_DENOMINATOR`). Below that the
  value *is* the count pair - `3 of 11` - and no percentage is rendered.
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
| **Loops** | push and lifecycle email - **locked** until a provider is connected | - |
| **Coverage** | every metric that has no source, why, and the connection that would fix it | - |

**Loops is locked, not absent.** Founder OS cannot see a customer's push or
email sends, so the page shows its real layout with every figure reading `—`
and a banner naming what unlocks it. Nothing on it is estimated in the
meantime. The two connectors that fill it are listed on the Connect page as
planned (`src/components/connect/planned.tsx`) - deliberately not links,
because a card that cannot be completed should not look like one that can.

## Gates

Gates are the thresholds a metric is judged against, and they are derived per
app rather than hard-coded. Two answers at app creation drive them - what kind
of product it is (`industry`) and how it charges (`nature`) - because the
second moves the conversion numbers far more than the first.

Two layers, in `src/lib/domain/gates.ts`:

1. **Category bands** - published benchmarks for the category, each carrying
   its own source string. Written synchronously when the app is created, so
   the tiles are judged from the first render. Deterministic, offline, no key.
2. **A competitor pass** - optional, per app. It looks up comparable products
   and may tighten or loosen a band, but every gate it returns must carry a
   citation: `parseResearchedGates` throws away anything without a number in
   range and a source, because **a gate with no provenance is worse than no
   gate**. It runs in the background, is fail-soft, and never blocks app
   creation (`GATE_RESEARCH_API_KEY`; see `.env.example`).

Researched gates win per metric and category gates fill every gap
(`mergeGates`), so a set is `category`, `researched` or `mixed`, and the
Overview and Coverage tabs both print the whole set with its sources.

`judgeAgainstGate` applies the same denominator rule as a rate: below 30 it
returns "n too small to judge" and still shows the gate, and a null value is
an absence rather than a failure. Churn is the one metric where lower is
better, and it reads `≤` rather than `≥`.

Changing an app's industry or nature re-derives the set - otherwise the tiles
would keep judging against the old category.

**Where the bands come from** (September 2026): all-category mobile medians
D1 26% / D7 13% / D30 7%; health & fitness D1 ≈ 20%, D7 7–8.5%, D30 3.5–4%
(7.2% with wearable sync); education D30 ≈ 2%; fintech D30 15–25%; trial →
paid global median ≈ 25.6% with hard paywalls ≈ 10.7% at D35 against freemium
≈ 2.1%; freemium free → paid median ≈ 4.5% (2–8%); trial → paid median ≈ 8%
on a bimodal distribution; SMB/self-serve monthly churn 3–7%; B2B SaaS median
monthly churn 3.5%, top quartile under 1.2%. Each number sits next to its own
source string in the catalog, and that string is what the tile shows.

## Measurement notes

`src/lib/domain/notes.ts` holds the things a reader has to know to read a
number correctly, shown **in the app** beside the number rather than left in
this file. Each note names the surfaces it appears on, so a note cannot exist
without a home, and Coverage lists all of them:

- **Everyone reads as web until your app reports an install** - the install
  event is the only platform signal the snippet carries (Acquisition).
- **A person on two devices counts as two people** - cohorts key on the
  snippet's anonymous id, which belongs to a device, not a human; read
  retention as a floor (Activation & retention).
- **Checkout → paid is only as good as the event behind it** - if the paywall
  does not call `checkout_view`, the step is invisible, not zero (Revenue).
- **Loops is locked until a push or email source is connected** (Loops).

## Definitions

<a id="signups"></a>**Signups** - distinct anonymous ids that fired `signup`,
by the ISO week they signed up in. Platform is `app` when that visitor ever
reported an `install` or arrived with a store source, else `web` - the only
platform signal the snippet carries.

<a id="activation"></a>**Activated ≤ 24 h** - signups whose first `activation`
or `purchase` landed within `ACTIVATION_HOURS` of signing up.

<a id="north-star"></a>**North star** - signups with a *second* activation or
purchase within `NORTH_STAR_DAYS` (7) of signing up: they came back for more,
which is the earliest honest signal of retention. Only cohorts whose seven
days have fully elapsed are in the denominator.

<a id="retention"></a>**D1 · D7 · D30** - share of the cohort active in the
24 hours that begin N days after signup. "Active" is any snippet event at all.
Bands come from public consumer-app benchmarks (D1 ≈ 25%, D7 ≈ 8%,
D30 ≈ 4%) and are labelled as such; this dashboard sets no gates of its own,
because a gate belongs to an app, not to a tool.

<a id="signup-to-paid"></a>**Signup → paid** - snippet purchases from a signup
cohort ÷ that cohort's signups. Market band 1–3% of registered-free users. At
these denominators, read it as a floor.

<a id="paying"></a>**Paying customers** - subscriptions reading `active` or
`past_due` across every connected rail plus wrapped checkout. Trials are
counted separately and never as paying, the same rule as `isUserPremium`
elsewhere.

<a id="trials"></a>**Trials started** - subscriptions whose `trialStartedAt`
falls in the window. Only rails that report trial dates can contribute.

<a id="early-cancels"></a>**Early cancels** - subscriptions closed within
`EARLY_CANCEL_DAYS` (9) of starting. The fastest signal that the first week
disappoints.

**Attribution coverage** - signups whose channel is neither `direct` nor
`other`: the share you could actually act on. iOS App campaigns cannot be
attributed per campaign client-side, so every store install shares one bucket.

## Where the code lives

```
src/lib/domain/b2c.ts          pure: weeks, rate rules, tiles, cohorts, triangle, funnel
src/lib/domain/gates.ts        pure: the category catalog, gate parsing, judging
src/lib/domain/notes.ts        the measurement notes and where each one appears
src/lib/services/gates.ts      seeds gates at creation, runs the competitor pass
src/lib/services/b2cAnalytics.ts  loads snippet events + rails, assembles one payload per view
src/components/b2c/tiles.tsx   the tile anatomy and the charts
src/app/app/[appId]/b2c/       layout + sub-nav, overview page, [section] page
tests/b2c.test.ts              the presentation rules and the cohort maths
tests/gates.test.ts            the catalog, the parser's refusals, judging, the notes
```

The domain module stays pure (the repo rule): no DB, no env, no network, so
the rules that decide whether a number may be shown are testable without
Postgres. `tests/b2c.test.ts` pins them - including that a rate under 30
becomes a count pair, that a fresh cohort is excluded from D7, and that a
triangle cell is null rather than 0%.

Every loader is fail-soft: a source that throws lands in `sourceErrors`, its
tiles read `—`, and the rest of the page renders.

## Deliberately not here

- **Push and lifecycle email numbers.** No source until a provider is
  connected. The Loops page exists and is locked; nothing on it is estimated.
- **Per-screen onboarding funnels.** The snippet reports signup and
  activation, not each screen of someone else's wizard.
- **Invented gates.** A gate is derived from published data for the app's own
  category, or from a cited competitor pass, or it does not exist. There is no
  third option, and no default number applied to an app nobody looked at.

# Session log

A running record of Claude Code sessions: what shipped, what was decided
and why, and the traps that cost time. Read it when resuming work; append
to it as you go. It is a log, not instructions.

---

## 2026-09-12 — Attribution, ad spend, and the Google Ads source

Branch `claude/trusting-shannon-3wndg6`, 24 commits `ef5e958..abc54dd`,
all deployed by fast-forwarding the default branch. Founder OS's first
signed-up customer is **Selvenn** (`kristynazackova-personal/ConversationLens-monorepo`),
a consumer app on Apple weekly subscriptions with a 7-day trial plus two
Stripe web subscriptions, running Google Ads iOS App campaigns. Most of
this session was driven by one request — *show my ad spend* — which took
five attempts because GA4 turned out not to have the number at all.

### What shipped

**Attribution page**
- The install guide moves behind a **How to install** button once the
  snippet reports its first event (`ef5e958`).
- **App installs, last 30 days** from GA4/Firebase `first_open`, bucketed
  by first-touch channel (`f862cf1`), plus `installs30d` in the diagnosis
  numbers (`88f94c3`).
- An `install` attribution event and an **App Store / Play Store** channel,
  so a native app can post installs to `/api/collect` (`0e4689c`).
- **Paid campaigns, last 30 days**: spend per campaign with cost per
  install, cost per trial, CAC and payback (`fc022be`, roadmap item 2).
- **Manual ad spend** (`ad_spend` table, migration `0004`): a figure per
  campaign, or one for all of them, typed in at the bottom of the card and
  marked "entered" (`0a8d2bb`).
- **Google Ads as a source** (`327fa62`): the authoritative spend. See
  `docs/GOOGLE_ADS_SETUP.md`.

**Diagnosis**
- **Free trials split out of paying customers** (`51ee397`) and a **trial
  funnel with lapse detection** (`4ce9758`, roadmap item 1).

**Connect**
- **Event settings** (`bb3353e`): after GA4 or Mixpanel connects, the
  founder chooses all events or a ticked subset, and all history or only
  from now on. Enforced in every read.
- **A ticked checklist step stays ticked** (`81024c3`).
- Google Ads setup guidance: the one scope, who to authorise as, and an
  upfront warning when the deployment is unconfigured (`d12078f`,
  `a365bfa`).

### Decisions

- **Google Ads is now the primary spend source, GA4 second, typed-in
  third.** A reported figure always beats a typed one. Reversed an earlier
  recommendation in this same session: I argued against the Ads API on the
  grounds that it needed a per-founder credential and that Google had
  closed the API to this account. Both were wrong — the developer token
  belongs to Founder OS, so one approval serves every customer, and the
  closure applied to *conversion uploads*, not reporting.
- **Consent screen must be External, not Internal.** Internal only lets
  accounts inside one Workspace organisation authorise, and every founder
  connecting their own ads account is outside it. `e85ad8e` corrects a doc
  that had recommended the opposite.
- **Zero spend means unknown, not free.** Founder OS cannot distinguish "no
  spend" from "spend not reported", so unit costs stay `—` rather than
  claiming a $0 CAC (`bcf289d`).
- **Roadmap kept in `docs/ROADMAP-revenue-selvenn.md`**, one item per
  session, with the next item named in `CLAUDE.md`. Items 1, 2 and 2b are
  done; item 3 (paywall views from apps) is next.

### Traps, verified

- **GA4 ad cost is session-scoped.** Paired with a user-scoped dimension
  (`firstUserGoogleAdsCampaignName`) the Data API answers **200 with blank
  cost**, not an error — so an error-only fallback never fires and a
  correctly linked account renders `$0`. Candidates are now tried and
  judged on whether cost came back (`pickAdRows`).
- **Cost cannot be queried with no dimension at all.** GA4 rejects it:
  *"Please add sessionCampaignName to make the request compatible."*
- **GA4 does not have app-campaign spend for this property.** The Google
  Ads link is in place, every valid dimension accepted the query and
  reported zero, and `firstUserGoogleAdsCampaignName` was `(not set)` for
  all 34 installs. For iOS App campaigns per-user campaign attribution
  never reaches GA4. This is not a misconfiguration to hunt.
- **GA4 withholds small rows.** Campaign-scoped funnel counts are
  thresholded on low-traffic properties, which is why installs, trials and
  paid all read low. The funnel is now also read property-wide with
  `eventName` alone and the larger figures win (`5292c96`).
- **Apple reports a free trial as "Start introductory offer" at 0.00** —
  the trial wording is only in the offer-type column. Treating that as a
  paid start is what inflated Selvenn's paying customers to 21 against 3–4
  real ones.
- **Apple's reports never say a subscription quietly stopped.** Lapse is
  inferred: last paid event older than one billing period plus Apple's
  16-day retry grace.
- **A consent screen that is External + Testing issues refresh tokens
  Google revokes after 7 days.** It works, then stops, and reports
  `invalid_grant`, which reads like a bad token rather than a project
  setting.
- **`serviceusage.services.enable` refusals** usually mean the selected
  project is one auto-created by another Google product (AI Studio keys,
  Firebase) where you hold no admin role.
- **A `useOptimistic` component needs the server action to revalidate.**
  Without it React discards the optimistic value and the pre-click render
  wins, so a saved change appears to undo itself.

### Mistakes worth not repeating

Five deploys went to one number because I reasoned from documentation
instead of from a response, and twice told the user a fix was live when the
failing path had not been changed.

- **Check what is actually deployed.** `/api/health` returns `commit`.
  Twice a "fix" was reported as live when the default branch had never been
  fast-forwarded, or when only part of the path had been updated.
- **Surface the provider's own message before theorising.** The bare
  `POST … → 400` said nothing; Google's body named the incompatible field
  immediately. `ga4ErrorText` and `googleAdsErrorText` exist for this, and
  they must be used in *every* catch, including the top-level one.
- **Never let a diagnostic read break a working page.** Making a failed
  spend query fatal replaced a real funnel with an error (`a470e33` undid
  that).
- **Verify in a browser, not only in tests.** Two real bugs were only
  visible that way: typed spend not rendering without a GA4 connection, and
  the checklist revert. A third "bug" was a test artifact — a double-wrapped
  stub dropped the error body, and a `waitForLoadState` raced a server
  action.

### Selvenn side (other repo, same session)

The `fos.js` snippet is installed in `apps/web/client/index.html`, with
`signup` fired from `trackUserRegistration` and the V4 signup screen, and
`activation` on the user's first completed analysis
(`client/src/lib/founderOs.ts`). Mobile reports `install`, `signup` and
non-trial `purchase` from `apps/mobile/lib/founderOs.ts`, mirrored off
`Analytics.track()` under the launch ping's install id. Mobile events only
arrive once a build carrying that code ships.

### Open

- **Blocked on the operator**, not on code: `GOOGLE_ADS_DEVELOPER_TOKEN`,
  `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` on the
  deployment. The connect page says so until they are set.
- A click-through *Connect with Google* flow does not exist; the founder
  pastes a refresh token. Needs a callback URI on the OAuth client.
- Manual spend has no staleness handling beyond showing its last-updated
  date.
- Roadmap item 3 next: paywall views from apps, which unblocks the
  checkout-to-paid conversion number.

---

## 2026-09-18 — B2C analytics (`/app/<id>/b2c`)

A consumer-funnel dashboard modelled on Selvenn's `/admin/v2`, **added beside
the existing analytics, not replacing any of it**. Diagnosis and Attribution
are byte-for-byte unchanged; the only edit to existing code is one row in
`src/components/AppTabs.tsx`. Reference: `docs/B2C_ANALYTICS.md`, definitions
`docs/METRICS_AND_FUNNELS.md`.

Five views under one window control (complete ISO weeks, in the URL, so a view
is a link): Overview, Acquisition, Activation & retention, Revenue, Coverage.

### What was worth deciding

- **The presentation rules are the product here, not the metrics.** At
  Founder OS denominators a bare percentage lies, so `domain/b2c.ts` enforces
  them centrally: a rate needs a denominator of 30 or the value becomes the
  count pair (`3 of 11`); the count always sits beside the rate; not
  computable is `—`, never `0`; only complete ISO weeks; a cohort is held out
  of a checkpoint until its window has elapsed, and a triangle cell is `null`
  rather than 0%. Each of those is a test in `tests/b2c.test.ts`.
- **No gates.** Selvenn's dashboard judges against Selvenn's own gates. A
  multi-tenant tool has no business inventing a threshold for an app it did
  not build, so this shows public market bands with their denominator and
  labels them as bands.
- **Platform comes from the install event**, the only platform signal the
  snippet carries: a visitor is `app` if they ever reported an `install` or
  arrived with a store source, else `web`. Coverage says so, because until a
  build ships that calls `install`, everyone reads as web.
- **"Loops" has no counterpart.** Founder OS never sees a customer's push or
  email sends. Rather than a page of blanks, Coverage lists it as having no
  source and says it is out of scope by design.
- **The Coverage view is the honest half of the dashboard**: one row per
  metric with its state (live / partial / no source), why, and the connection
  that would fix it. Every `—` elsewhere has a row there.

### Traps

- `HOUR_MS` and a leftover `signups` binding tripped the lint gate — the
  service does not need the hour constant, the domain module does.
- Retention needs activity loaded from BEFORE the window: the loader fetches
  `max(weeks × 2, 8)` weeks of history so D30 and the sparklines have
  something to read.

### Open

- Nothing computes ad spend on these pages; that stays on Attribution, which
  already has Google Ads, GA4 and manual entry feeding it.
- `checkout_view` is only as good as the app calling it — roadmap item 3.
  Until then "Checkout → paid" reads as a count pair or a blank, and Coverage
  names it.
- Cohorts are keyed on the snippet's anonymous id, so a user who switches
  device counts twice. Fixing that needs an identity the snippet does not have.

## 2026-09-18 (later) — gates per app, Loops locked, notes in the app

Five follow-ups to the B2C dashboard, all on the same branch.

### Gates are derived, not hard-coded

Two new answers at app creation — `industry` and `nature` (how it charges) —
drive the thresholds every B2C tile is judged against. `nature` matters more
than `industry` for conversion and is asked separately for that reason.

Two layers in `src/lib/domain/gates.ts`:

- **Category bands**: published benchmarks per category, each with its own
  source string, written synchronously at creation. Deterministic, offline,
  no key — so an app is judged from its first render, and this layer alone is
  a complete product.
- **A competitor pass** (`services/gates.ts`): optional, per app, background,
  fail-soft. `parseResearchedGates` keeps only what carries a metric in range
  AND a source — **a gate with no provenance is worse than no gate**, and the
  parser's refusals are the part under test. Needs
  `GATE_RESEARCH_API_KEY`; without it nothing runs and nothing degrades.

The band numbers were looked up rather than invented (all-category mobile
medians, health & fitness, education, fintech, trial → paid, freemium, SMB and
B2B churn — September 2026). Each sits beside its source string in the
catalog, and that string is what the tile prints.

`judgeAgainstGate` reuses the rate rule: under 30 it says "n too small to
judge" and still shows the gate; a null value is an absence, not a failure;
churn is the one metric where lower is better. Changing industry or nature
re-derives the set, or the tiles would keep judging against the old category.

### Loops kept and locked

The Loops page is back with its real layout, every figure reading "—", a
banner naming what unlocks it, and no estimates anywhere. Push and lifecycle
email are listed on the Connect page as **planned** connectors
(`components/connect/planned.tsx`) — rendered as dashed cards, deliberately
NOT links, because a card that cannot be completed should not look like one
that can.

### Notes live in the app

`src/lib/domain/notes.ts` carries four measurement notes, each declaring the
surfaces it appears on (so a note cannot exist without a home) and all of
them listed on Coverage: the install event being the only platform signal;
cohorts keyed on a device rather than a human; `checkout_view` being only as
good as the app calling it; and Loops being locked. These were the three
caveats from the previous entry's "Open" list — they are now in front of the
reader instead of in a file nobody opens.

### Open

- The competitor pass has never run against a real key in this environment.
  The prompt, the parser and the merge are unit-tested; the round trip is not.
- `industry`/`nature` are asked at creation and editable in settings, but
  existing apps have neither, so they fall back to `other` +
  `web_subscription` until someone sets them. `gatesOf` handles that.
- Push and email connectors are placeholders only — no adapter, no schema.

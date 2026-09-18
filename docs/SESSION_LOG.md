# Session log

A running record of Claude Code sessions: what shipped, what was decided
and why, and the traps that cost time. Read it when resuming work; append
to it as you go. It is a log, not instructions.

---

## 2026-09-12 - Attribution, ad spend, and the Google Ads source

Branch `claude/trusting-shannon-3wndg6`, 24 commits `ef5e958..abc54dd`,
all deployed by fast-forwarding the default branch. Founder OS's first
signed-up customer is **Selvenn** (`kristynazackova-personal/ConversationLens-monorepo`),
a consumer app on Apple weekly subscriptions with a 7-day trial plus two
Stripe web subscriptions, running Google Ads iOS App campaigns. Most of
this session was driven by one request - *show my ad spend* - which took
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
  closed the API to this account. Both were wrong - the developer token
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
  cost**, not an error - so an error-only fallback never fires and a
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
- **Apple reports a free trial as "Start introductory offer" at 0.00** -
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
  the checklist revert. A third "bug" was a test artifact - a double-wrapped
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

## 2026-09-18 - B2C analytics (`/app/<id>/b2c`)

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

- `HOUR_MS` and a leftover `signups` binding tripped the lint gate - the
  service does not need the hour constant, the domain module does.
- Retention needs activity loaded from BEFORE the window: the loader fetches
  `max(weeks × 2, 8)` weeks of history so D30 and the sparklines have
  something to read.

### Open

- Nothing computes ad spend on these pages; that stays on Attribution, which
  already has Google Ads, GA4 and manual entry feeding it.
- `checkout_view` is only as good as the app calling it - roadmap item 3.
  Until then "Checkout → paid" reads as a count pair or a blank, and Coverage
  names it.
- Cohorts are keyed on the snippet's anonymous id, so a user who switches
  device counts twice. Fixing that needs an identity the snippet does not have.

## 2026-09-18 (later) - gates per app, Loops locked, notes in the app

Five follow-ups to the B2C dashboard, all on the same branch.

### Gates are derived, not hard-coded

Two new answers at app creation - `industry` and `nature` (how it charges) -
drive the thresholds every B2C tile is judged against. `nature` matters more
than `industry` for conversion and is asked separately for that reason.

Two layers in `src/lib/domain/gates.ts`:

- **Category bands**: published benchmarks per category, each with its own
  source string, written synchronously at creation. Deterministic, offline,
  no key - so an app is judged from its first render, and this layer alone is
  a complete product.
- **A competitor pass** (`services/gates.ts`): optional, per app, background,
  fail-soft. `parseResearchedGates` keeps only what carries a metric in range
  AND a source - **a gate with no provenance is worse than no gate**, and the
  parser's refusals are the part under test. Needs
  `GATE_RESEARCH_API_KEY`; without it nothing runs and nothing degrades.

The band numbers were looked up rather than invented (all-category mobile
medians, health & fitness, education, fintech, trial → paid, freemium, SMB and
B2B churn - September 2026). Each sits beside its source string in the
catalog, and that string is what the tile prints.

`judgeAgainstGate` reuses the rate rule: under 30 it says "n too small to
judge" and still shows the gate; a null value is an absence, not a failure;
churn is the one metric where lower is better. Changing industry or nature
re-derives the set, or the tiles would keep judging against the old category.

### Loops kept and locked

The Loops page is back with its real layout, every figure reading "—", a
banner naming what unlocks it, and no estimates anywhere. Push and lifecycle
email are listed on the Connect page as **planned** connectors
(`components/connect/planned.tsx`) - rendered as dashed cards, deliberately
NOT links, because a card that cannot be completed should not look like one
that can.

### Notes live in the app

`src/lib/domain/notes.ts` carries four measurement notes, each declaring the
surfaces it appears on (so a note cannot exist without a home) and all of
them listed on Coverage: the install event being the only platform signal;
cohorts keyed on a device rather than a human; `checkout_view` being only as
good as the app calling it; and Loops being locked. These were the three
caveats from the previous entry's "Open" list - they are now in front of the
reader instead of in a file nobody opens.

### Open

- The competitor pass has never run against a real key in this environment.
  The prompt, the parser and the merge are unit-tested; the round trip is not.
- `industry`/`nature` are asked at creation and editable in settings, but
  existing apps have neither, so they fall back to `other` +
  `web_subscription` until someone sets them. `gatesOf` handles that.
- Push and email connectors are placeholders only - no adapter, no schema.

## 2026-09-18 (later still) - Product Market Fit tab

Pulled Kristyna's own PMF framework out of `my-personality`
(`raw/mentoring/matium-guillen/2026-09-05.md`, a recorded session from
2026-09-05) into founder-os as `src/lib/domain/pmf.ts`, and rendered it at
`/app/<id>/pmf` behind a new "Product Market Fit" tab. Reference:
`docs/PMF_FRAMEWORK.md`.

### Finding it

The framework is not a file. It exists as spoken advice inside a mentoring
transcript, so the port quotes her verbatim rather than paraphrasing - the
wording is the framework, and that repo's first rule is never invent. Two
wrong turns first: the personal site repo (`kristynazackova`) has no
framework in it, and `profile/story-bank.md` documents her modified STAR,
which is an interview-answer framework, not this one. `list_repos` is what
surfaced `my-personality`.

### What shipped

Five steps in her order - the bar ("if I don't get this, it's gonna hurt
me"), qualitative before quantitative, market and competitor research with
revenue per feature, prioritisation ("is the house gonna burn?"), then one
revenue driver with a quarterly goal above and per-launch numbers under it.
Plus her interview questions split by audience, the technique rules (open
questions, never lead, watch a screen share), and a "not yet" block.

`pmfStateFor` picks the step from paying customers, whether anything is
reporting, and whether checkout is live. A founder with four customers is
sent to the conversations, never to competitor research - that inversion is
the failure the framework exists to prevent.

A test asserts no ported string contains an em dash. That is her standing
instruction and it is trivially easy to reintroduce.

### Open

- Only one transcript was mined. If she has taught this since, the later
  sessions may have refined it.
- The page is read-only. There is no per-app progress through the steps,
  which would need a table.
- Her mentoring quotes name no mentee, but the transcript they come from is
  a real client conversation in a private repo. Nothing identifying the
  mentee or his company was ported.

## 2026-09-18 (end of day) - the PMF framework fills itself in, versioned

The framework tab was read-only. Now it holds a document per business.

- **A new business is filled top to bottom at creation.** The scaffold lands
  synchronously inside `createApp`, so the tab is never empty; the model fill
  appends v2 in the background when a key is configured.
- **An existing business fills on demand.** No document means a "Fill in the
  framework" button. Selvenn is exactly this case, and it needed no flag -
  absence of a document is the signal.
- **Editing appends.** One form per step so a founder can save the step they
  are on; each save is a new version.
- **A comment drives a rewrite**, also a new version, with the comment stored
  next to the version it produced.

### Decisions worth keeping

- `pmf_documents` is append-only, unique on (app, version). A concurrent save
  loses the index race, re-reads and rebases instead of clobbering. The first
  draft is always still there.
- **The scaffold never guesses.** Every field it writes is a question aimed at
  that business, prefixed `[to fill]`. A guessed answer would be read as a
  finding, which is worse than a blank. The model prompt carries the same rule
  and is told not to invent a customer, a competitor number, a revenue figure
  or an interview finding; `parseModelValues` drops anything the framework did
  not ask for, plus non-strings and blanks, and bounds the rest to 2,000 chars.
- Steps 3 to 5 depend on conversations that may not have happened, so the
  prompt says to leave them as prompts unless there is evidence otherwise.
- `services/ai.ts` is now the single model call site, shared with gate
  research. Both features are optional and both have an offline path.
- Every action revalidates the page. That is the connect-checklist bug and it
  would have reproduced exactly here: write the version, show the old one.
- Rewriting is the one thing that genuinely needs a key, so the box disables
  itself and points at the edit form rather than pretending.

### Open

- No diff between versions, and no restore. The list shows what happened and
  the comment behind it; rolling back means copying text forward by hand.
- The model fill at creation is fire-and-forget, so a founder who lands on the
  tab within a second or two sees the scaffold and has to reload.
- No per-field provenance: once a version is written you can see that a model
  filled it, not which fields it touched.

## 2026-09-18 (mobile) - mobile web, and a production bug the build could not see

Asked to make the app mobile friendly. Audited all 19 pages in headless
Chromium at 390x844, which is also how the real bug below surfaced.

### The bug: data exported from a "use client" module

`B2C_SECTIONS` lived in `B2cNav.tsx`, a client component, and the two server
pages imported it from there. Across that boundary a client module's data
exports are NOT the values - only component references survive - so
`B2C_SECTIONS.find` threw and **every B2C page 500'd in production** from the
moment it deployed. `tsc`, `eslint`, `vitest` and `next build` all passed,
because nothing type-checks that boundary.

Moved to `b2c/meta.ts`, a plain module both sides import. The rule: shared
DATA goes in a plain module; a "use client" file exports components and
types. Types are erased so they are safe (`Draft`, `TierOverrides` are fine).

**Loading a page in a browser is the only check that would have caught this.**
Worth doing after any feature that adds routes.

### Mobile fixes

- `viewport` export on the root layout, `maximumScale` deliberately unset so
  pinch-zoom still works.
- Inputs to 16px on small screens. Below that iOS Safari zooms the page on
  focus and does not zoom back.
- `.btn` min-height 2.75rem, `.btn-sm` 2.25rem for inline table actions.
- `.scroll-x` wrapper on every table (7 bare `table.data` plus the two in
  `b2c/tiles.tsx`), and numeric cells nowrap so a wide table scrolls inside
  its card instead of squeezing every cell to "0 /\n0 /\n0". A horizontal
  scrollbar on the document is the one bug that makes a whole app feel broken
  on a phone.
- `.tab-strip`: the app tabs (7) and B2C sections (6) scroll sideways rather
  than wrapping to three rows.
- Headers wrap; the account email is hidden under `sm`, truncated above it.
- An em dash at 30px reads as a redaction bar, so a "not measurable" value now
  renders muted and smaller, on the B2C tiles and the diagnosis KPIs.
- `.break-anywhere` on the site key.

### The check

`mobile-audit.mjs` (not committed - it needs playwright, which is not a
dependency) signs up, creates a business, then per page asserts: no document
overflow, no control under 36px, no input under 16px, and that the page is not
showing the dev error overlay. That last assertion is what turned the B2C
failures from "small button" into "page is broken".

The detector has to ignore nodes inside a horizontal scroller - a tab strip's
items are MEANT to extend past the viewport - or every scroller reads as a
bug.

### Open

- 46 files still contain em dashes in copy. Not swept: most predate this work
  and the `—` in `notMeasurable` is a load-bearing data marker, not prose.
  Her standing rule says hyphens, so this is worth a deliberate pass.
- Audited at 390px only. Nothing checks 320px or landscape.
- pglite on disk failed locally ("CREATE SCHEMA drizzle"); `PGLITE_MEMORY=1`
  works. Worth knowing before debugging a local 500 on signup.

## 2026-09-18 (later) - a second framework on the PMF tab

Added her written **Product Framework** doc as a second framework beside the
mentoring one: `?framework=build`, its own document, its own versions.

Nine stages in her order: goal, one segment (MECE, scored on size,
pay-strength and whether it is already solved), the current journey then its
pains scored on reach and severity, solutions scored on fit and build cost
plus what v1 is NOT, impact metrics with retention at three horizons, jobs to
be done in "as a <specific user>" form, platform and design guidelines, the
LLM prompt as the product's engine with a test log, then a gate: all yes, or
go back to that stage.

### The decision worth keeping

Its first rule is *"The ideas should be yours. I'm deliberately not handing
you solutions - you won't love a product you didn't come up with."* That
contradicts what the other framework's document does, which is let the tool
draft answers.

So `aiRole` is per framework. `build` is `pressure_test`: the tool writes the
sharpest version of each question for this business and may challenge what
the founder already wrote, and the prompt states that proposing a segment, a
pain, a solution or a metric breaks the framework's first rule. A framework
that tells you not to hand over answers should be implemented as a tool that
cannot.

### Structural changes

- `domain/pmfFrameworks.ts` is the registry. `domain/pmf.ts` stays the record
  of what she said in the session; the `conversation` framework wraps it, and
  a test asserts the wrap has not drifted.
- Fields moved off `pmfDoc.ts` onto the framework. `parseModelValues` is per
  framework and drops a field belonging to the other one.
- `pmf_documents` gained `framework`; the unique index is now (app,
  framework, version), so the two version independently.
- Creation scaffolds both, so either tab is usable on the first visit.

### Open

- The build framework is 27 fields over nine stages, which is about 11,500px
  of page on a phone. Collapsing stages by default would help.
- Its scored tables in the original doc (segments, pains, solutions) are
  single long-text fields here. Structured rows with the scores as columns
  would match the doc better.
- The `pressure_test` path has never run against a real key.

## 2026-09-18 (end) - collapsed stages, and the em dash sweep

### Collapsed stages on the build framework

A framework now declares `collapseStages`. The build one sets it: nine stages
and 27 fields was about 11,500px of page on a phone. Measured after:
**4,233px**, with the stage you are on open and the rest one tap away. The
conversation framework stays expanded (five stages, 9,698px).

Implemented as `<details>`, not a client component: it collapses without
JavaScript, the page stays a single server render, and each summary carries
its own answered count so the page still reads as a worksheet when closed.

### Em dashes

Swept, with a rule rather than a one-off: `tests/emDash.test.ts` walks `src/`
and fails on any em dash that is not the DATA marker. `"—"` is what a tile
prints when a metric cannot be computed, so the character survives inside
quotes or backticks, and the copy quoting it survives too. Everything else is
a hyphen now - 241 in `src/`, 29 in the docs.

Two things the sweep could not own:

- The `<!-- BEGIN:nextjs-agent-rules -->` block in `CLAUDE.md` is regenerated
  by `next dev` on every run, em dashes and all. Swept once, restored
  immediately. Left as Next writes it so the tree stays clean.
- Prose that quotes the marker keeps the character on purpose. Four places in
  `src/`, eleven in the docs.

### Why the app still needs its own model key

Worth writing down because it came up as a question: the deployed app is a
separate program on Railway with no connection to any Claude Code session, so
any model call it makes needs its own credential. This is not Gemini versus
Claude - it is that a server cannot borrow one. `services/ai.ts` points at
Google today only because gate research needed web-grounded search and the
`GEMINI_API_KEY` fallback already existed in the founder's other stack.
Anthropic's `web_search_20260209` server tool covers the same need, so
switching is a contained change to that one file plus an `ANTHROPIC_API_KEY`.

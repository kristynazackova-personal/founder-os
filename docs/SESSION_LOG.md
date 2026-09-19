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

---

## 2026-09-18 (tables) - the three list stages became real tables

Target user, problem and solutions are lists with parameters, not paragraphs.
Her doc gives each of them a small table and then hands the parameters back:
*"feel free to add or remove the parameters I proposed to look at based on
what you care about. E.g., do you not care about profit? Then don't look at
the willingness to pay or pay strength."*

So the column set is an OUTPUT of the framework, derived per business from the
stages above the table, and the stored value of a table field is JSON carrying
its columns and its rows together - a row can never be read against a column
set it was not filled in under.

### The research came first

`docs/research/pmf-build/` - one file per stage plus `columns.md`, each
separating what her doc fixes from what the prioritisation literature adds,
with a candidate-column table stating the condition each column earns its
place under and what it does NOT settle. `src/lib/domain/pmfPrompts.ts` is the
operational form of those files: the rule in the code, the reasoning in the
research, and the research changes first.

It settled the questions her doc leaves open. Frequency belongs beside
severity (severity alone ranks a rare catastrophe above a daily nuisance).
Urgency predicts early traction better than size, which is the beachhead
argument. Three to six columns, because below three there is nothing to
compare on and above six nobody fills it in. No RICE at this size: it wants a
reach number and person-months of effort, and a founder who has not run the
interviews has neither, so the score would be two guesses in a trench coat.

### Verified against the real model, not just the tests

A business whose founder wrote *"usefulness and thank-yous, I do not care
about profit"* got size, urgency, already-solved, reachability, early-adopter
tendency and can-you-talk-to-one-this-week. No pay-strength column - her own
example, reproduced without being hard-coded.

Three things only a real run showed:

- **A 2,000-character cap silently ate every table.** `parseModelValues`
  bounded a stored value at 2,000 characters, which is right for a paragraph
  and fatal for JSON: truncation does not shorten a table, it corrupts it, and
  `readTable` then returns an empty one. Generation reported success and the
  page showed the empty state. The cap is per field now, 100,000 for a table.
- **The model returned six parameters and nothing to score.** Asked for
  columns, it gave columns - no column naming the row. The prompt asks for it
  and `withRowLabelColumn` adds it back, dropping the weakest parameter if
  that would push the set past six.
- **`[to fill]` questions landed in choice cells and vanished.** A select has
  no such option, so the page showed a dash while the document said something
  else. `cellValue` now reads every cell against its own column - a listed
  option, a number in range, or nothing - on the way in from the model and on
  the way in from the form alike. Questions belong in text cells.

The generated rows come back named and unscored, which is right: her caution
says S/M/L for a consumer segment is a judgement to ask for, never to assert.

### Cost of it

Two model calls in sequence (columns, then rows against those columns) take 40
to 50 seconds. Fine on Railway, which runs a long-lived server; it would not
survive a serverless function timeout. "Re-derive columns" stays a deliberate
button - re-deriving on its own would rewrite the question after the answers
were given.

---

## 2026-09-18 (chain) - the tables were not actually chained

Running all three tables in sequence against the real model, rather than the
first one, showed two things the segment table could never have revealed -
stage 1 is all there is above it, so it looked correct while the stages below
it were not.

**Earlier tables were not in the prompt at all.** `generateTable` filtered its
context with `!x.table`, so a later stage saw only the prose fields. The pains
table never read the segment the founder chose, and the solutions table never
read the pains. `renderTableForPrompt` now passes the filled rows down. The
difference in one run: pains went from generic FocusTimer complaints to six
rows all about *"university students cramming for finals"*, the segment typed
into the table above, and the solutions table's "which pain it solves" column
turned from a free-text `[to fill]` question into a choice keyed to the pain
rows it can now see.

**The pains were anchored inside the product.** "When attempting to start a
new focus session after opening FocusTimer", "When encountering a paywalled
feature". That is usability feedback on a product that may not need to exist,
and it is the exact failure her own warning names - a pain outside your
product is invisible to a journey drawn inside it. The rule is in the research
and the prompt now, and the same run produced "before opening any books or
notes, when they know they should be studying" and "after a period of
studying, when they decide to step away for a short break".

Also swept: the last standing lint warning (`TOTAL_SCOPE` imported and unused
in `sources/ga4.ts`). `npm run lint` is silent now, which is worth keeping -
one tolerated warning is how a second one goes unnoticed.

### What a single-table check cannot tell you

The first table is derived from stage 1, which is prose. Every bug here lived
in the step from one table to the next, so the check that mattered was the one
that filled a row and generated the table below it. Worth remembering before
declaring a chained feature verified.

Generation is also visibly flaky at the row step: one run returned columns and
zero rows, another failed outright in three seconds and recovered on a retry.
Both degrade honestly (the status line reports the row count, an error shows
in red), so this is a latency and reliability note rather than a defect.

---

## 2026-09-18 (WIF) - keyless GitHub Actions against the Claude API

`founder-os` had no `.github` directory at all. It now has none again on
purpose: a smoke-test workflow proved Workload Identity Federation works end
to end, and was deleted, because a probe that runs on every push to `main` is
not CI.

What it proved: GitHub Actions mints an OIDC token, Anthropic exchanges it at
`/v1/oauth/token` for a short-lived `sk-ant-oat01-` token, and that token makes
a real `/v1/messages` call. No `ANTHROPIC_API_KEY` in repository secrets.

Four things were wrong, and the order they surfaced in is the lesson.

- **A diagnostic sank the job.** `base64 -d` returns non-zero on unpadded
  base64url even after writing the decoded bytes. Under `pipefail` the last
  line of a claims dump failed the step that had just succeeded in fetching the
  token. Pad before decoding, and end a diagnostic in `|| true`.
- **The organization id was the wrong UUID.** The workflow's guard could only
  check that it was *a* UUID, not the right one.
- **`workspace_id` was missing from the exchange.** The docs call it optional
  for a single-workspace rule; the Console's generated snippet sends it
  unconditionally. Believe the snippet.
- **The subject was the hardened form.** These tokens carry
  `repo:<owner>@<owner id>/<repo>@<repo id>:ref:refs/heads/main`, not the
  documented `repo:<owner>/<repo>:ref:...`, so no rule written to the
  documented shape can ever match. The upside: pinning the exact hardened
  subject binds owner, repo AND branch by immutable numeric id in one value,
  which is a stronger pin than the documented format offers.

**The authentication history is the debugging tool, and its silence is
evidence.** A 401 from this endpoint is deliberately opaque - the body is a
fixed "Authentication failed" with nothing but a request id. The deny reason
lives at `/settings/workload-identity-federation?tab=history`. An attempt that
is missing from that page did not fail a rule check, it never reached one:
that is a bad org id or rule id, not a bad match. Once the org id was right,
the page immediately said `match_subject_prefix` and the last fix was one
line.

Scope, worth stating: this authenticates CI only. The app runs on Railway,
which is not an OIDC provider Anthropic federates with, so anything calling a
model from the running app still needs a service account key. `services/ai.ts`
also still calls Gemini, so nothing in production uses this yet.

---

## 2026-09-18 (tap target) - the business card, and the first loading state

"Hard to click through the business name to its dashboard." The card was
already a full-card `<Link>`, so the first job was finding out what was
actually true. `elementFromPoint` at nine points across the card, at 1280 and
390 wide, found two separate things.

**The four corners were dead.** A rounded anchor clips its own hit area, so a
point inside the visual corner falls through to the grid behind it. The fix is
to make the anchor a square box and move the rounding to a card inside it; the
visual is identical and all nine points now hit the link. Children are
`pointer-events-none` so nothing inside can swallow a tap.

**The bigger one was not the target at all.** `/app/<id>` runs the assessment,
the diagnosis and the benchmark bands before it can render - 658 ms on a warm
dev server, and there was no `loading.tsx` anywhere in the app, so a click
produced no feedback of any kind. That reads as a missed tap, not a slow page.
The segment now has a skeleton, and the card has `:active` and
`focus-visible` states.

Worth keeping in mind: "the button does not work" is often "the button does not
answer". Measure the hit area before widening it.

---

## 2026-09-18 (prefill) - stage 1 from a website or an uploaded business case

Stage 1 of the build framework can now be filled in from the founder's own
website and/or a business case they upload (PDF, Word `.docx`, plain text, up
to 10 MB). They edit it and save like any other stage. `docs/PMF_FRAMEWORK.md`
has the design; what is worth keeping here is why the line sits where it does
and what the real run caught.

**Why stage 1 and nothing else.** The framework's `pressure_test` role exists
to stop the tool answering for the founder, and that is right for segments,
pains and solutions - the thinking. Stage 1 is a description of a business that
already exists on its own landing page. Refusing to prefill it was never
protecting anything; it was making someone retype their homepage. Every stage
below it stays behind its own button, one at a time, and there is deliberately
no "run the rest" control: stage 3 derives from a stage 2 the founder is meant
to have read and corrected first.

**The field it must not guess.** "What do YOU want out of it" is what drops the
pay-strength column for an impact-first founder and steers every table below
it. Marketing copy will imply a revenue motive that the founder does not hold.
Fed a page reading "Pro from $8/month", the prefill returned `[to fill] What do
you, the founder, want out of FocusTimer?` rather than inventing one. That
behaviour is the feature; if a future prompt edit makes it confidently answer
that field from a landing page, it is a regression however good the sentence
reads.

**Turbopack broke both parsers, and the tests could not see it.**
`pdfjs-dist` and `mammoth` bundled by Turbopack fail at runtime with "That file
could not be read" and nothing in the logs. The unit tests import them directly
and passed, and so did typecheck, lint and build. Only uploading a real PDF
through the real form showed it. They are in `serverExternalPackages` now,
beside pglite, and the parser catch logs the underlying error so the next
occurrence is not mute. This is the third time this session that a green
toolchain hid a runtime fault - after the B2C pages 500ing and the truncated
table JSON. Load the page.

Also: server actions cap request bodies at 1 MB by default, so
`experimental.serverActions.bodySizeLimit` is 12 MB. The real limit is enforced
in the service, which can say why a file was refused.

**Follow-up, same day: the URL is shown and editable.** The prefill panel now
displays the address it will run against, prefilled from the business URL in
Settings, as a text field. Editing it changes that run only; a separate
checkbox, unticked by default, offers to save it back to Settings. Rewriting a
business setting as a side effect of a research run is not something to do
silently. `domain/url.ts` holds the one normaliser both the panel and the
Settings action use, so they cannot disagree about whether the address changed.

The trap: the field must NOT be `type="url"`. The browser's own validation
rejects a bare `focustimer.com` before the form is submitted at all - which is
exactly the input `normalizeUrl` exists to accept - and the founder gets a
native message they cannot act on. It silently swallowed two submissions in
testing and looked like the button was dead. `type="text"` with
`inputMode="url"`, and let the server say what is wrong.

---

## 2026-09-18 (Anthropic) - one provider, one place

`services/ai.ts` calls the Claude API through `@anthropic-ai/sdk` instead of
posting to Gemini's REST endpoint. Model `claude-opus-5`; grounding is
Anthropic's `web_search_20260209` server tool in place of `google_search`.

**There were two Gemini call sites, not one.** `services/gates.ts` held its own
copy of the key, the model and the fetch, which is how a deployment can end up
with the PMF tables working and gate research quietly not. It now calls
`askForJson(..., { search: true })` like everything else, and
`gateResearchConfigured()` is `aiConfigured()`. The docblock in `ai.ts` claimed
to be "the one place a model gets called" the whole time it was not.

**Env.** `ANTHROPIC_API_KEY`, with `GATE_RESEARCH_API_KEY` still read as an
alias so an existing deployment keeps working by swapping the value.
`GATE_RESEARCH_MODEL` is deliberately NOT read any more: a service still
carrying `gemini-2.5-flash` in it would otherwise send that string to Anthropic
and 404 every call. Override with `ANTHROPIC_MODEL` if ever needed.

**Opus, not Sonnet.** Every call is a judgement the founder reads as a finding
- which columns a table earns, what a landing page says the business is, which
published figure a gate can be attributed to - at a handful of calls per
business. The cheaper model saves nothing worth having here.

**Three failure modes that are not exceptions**, now handled: a safety decline
arrives as HTTP 200 with `stop_reason: "refusal"` and no usable content; a
truncated answer arrives as `stop_reason: "max_tokens"` with JSON that would
half-parse; and a grounded reply carries search-result and thinking blocks
beside the text, so taking "the content" rather than the text blocks picks up
the wrong thing.

**Tested without a key and without the network.** `tests/ai.test.ts` points the
SDK at a local HTTP server via `ANTHROPIC_BASE_URL` and asserts on the request
it recorded - the model id, the tool block, the max_tokens - then feeds back
real Messages response shapes. That covers what typecheck cannot, and costs
nothing to run. One trap: the module reads the key at import, so the env has to
be set and `vi.resetModules()` called before the first dynamic import, or every
call short-circuits as unconfigured.

Not verified against the live API: this sandbox has no Anthropic credentials
and cannot reach the service.

**Prepared, not switched: a model per purpose.** `services/ai.ts` now maps an
`AiPurpose` (`gate_research`, `table_columns`, `table_rows`, `doc_fill`,
`prefill`) to a model, and every call site passes its purpose. All five are
`claude-opus-5` today - no behaviour changed. The machinery exists so the
future split is one line in one table instead of a hunt through callers.

The likely split is rows and doc-fill to Sonnet: they draft against a shape
something else already decided. It was not made now on purpose. Nothing here
had run against a real business at the time of writing, and picking a cheaper
model for output nobody has read is guessing at where quality is safe to spend
less. The rule written into the file: never downgrade a purpose without the
Opus output of that same call to compare against. The test asserts the routing,
not which model a purpose has, so it survives the change rather than blocking
it.

---

## 2026-09-19 - the answers were feature lists

Reported from the deployment, for `one_sentence`: the model returned every
input format, both product tracks and all four outputs. Accurate, and the
wrong answer - the question asks what the product is FOR and it gave an
inventory of what it can do.

**The cause is not that field.** Fed a website or a business case, a model's
safest move is a faithful summary. A field prompt that specifies only a SHAPE
gets that summary poured into the shape. Most of the 27 prompts specified a
shape and nothing else, so the same failure was waiting in all of them. Worse,
`one_sentence` said "Mechanism, not benefit" - meant to stop "a coaching
platform", but it is also an invitation to enumerate the machinery, which is
exactly what came back.

**Fix, in two halves.** `domain/pmfAnswers.ts` holds `ANSWER_RULES` plus the
rejected answer as a worked example, and every generator sends it: prefill,
doc fill, pressure-test, table rows. And all 27 field prompts were rewritten to
name the DECISION the answer carries and the nearest wrong answer, instead of
only the format. Those strings are shown in the form as well as sent to the
model, so they had to stay readable as questions to a person.

Keeping the real rejected sentence in the file, rather than paraphrasing it,
is deliberate: a rule states a principle, an example shows the exact distance
between right and wrong, and this failure is subtle enough that the rule alone
reads as satisfied by the bad answer.

Not verified against the live model: there is no Anthropic key in this
sandbox. The prompts are unit-tested for content and the guidance renders, but
whether the answers actually improve is the next real run's evidence.

---

## 2026-09-19 (deploys) - why pushes never built

Railway had been building only when the dashboard offered an **Update**
button, never on a push. The cause was visible in Settings → Source: the
service carried an **Upstream Repo** - Railway's *template* relationship -
pointing at `kristynazackova-personal/founder-os`, the same repo as its
Source. So Railway watched the repo as a template and offered manual
template updates instead of deploying pushes.

**Do not press Eject.** Its dialog reads "remove the connection to the
upstream URL", but the next line says it creates a NEW repository in the
account and repoints the service at it. That forks the repo and leaves
pushes to the original deploying nothing.

The fix was to Disconnect the source and reconnect the same repo, which
re-creates the GitHub webhook without the template link. Variables,
domains and volumes live on the service, so they survive it.

The diagnostic that would have found this in one look: GitHub → repo →
Settings → Webhooks → the `railway.app` hook's Recent Deliveries. No hook,
or red deliveries, and Railway is simply not hearing the pushes.

`/api/health` reports `commit` from `RAILWAY_GIT_COMMIT_SHA`, which is the
cheapest way to tell which build is actually serving - the build log names
an image digest, not a commit. `cf4a558` went live at 00:32 UTC.

---

## 2026-09-19 (interview-isms) - "in one sentence" was grading the wrong thing

Raised by the founder, and correct: this framework descends from the product
design interview, where brevity is the point because you are timed and the
interviewer has to follow you live. Nothing here is timed. The first field's
label asked for the answer "in one sentence" for a reason that does not
transfer.

The constraint was replaced, not dropped. It was doing two jobs - forcing a
CHOICE, which is the whole point of every question in the framework, and
being SHORT, which was the interview's. Those come apart. The prompt now
carries the choice ("one kind of user, one change, one mechanism") and says
two sentences are fine; `ANSWER_RULES` rule 6 changed from a length rule to a
shape rule, so the test is whether you listed, not whether you were brief.

**The failure it was hiding.** Rule 3 said "name the PRIMARY one and drop the
rest". Selvenn has couples coaching and life coaching: different person,
different situation, different reason to pay. Squeezed into one sentence, the
model either drops half the business or retreats to an umbrella ("helps
people understand their relationships") too vague to derive segments from -
and a segment list drawn across two products is not MECE, so every table
below inherits it. A new rule makes that case a QUESTION back to the founder:
name both, say the framework is filled in for one of them, ask which.

The worked example now has to demonstrate it. `good` became the couples-only
answer and a new `whyGood` explains why the second track was not bolted on.
`FEATURE_LIST_EXAMPLE.question` lost its "in one sentence" too - it is
rendered into every prompt, so leaving it would have reintroduced the
constraint next to the rule removing it.

The field KEY stays `one_sentence`: stored answers are keyed by it, and
renaming it would orphan every existing one. Only the label a person reads
changed.

Not swept yet: the other 26 prompts may carry more interview conventions.
MECE on the segment list is one, though it survives translation on merit.

---

## 2026-09-19 (voice) - the answer was right and still unusable

First real run of the reframed stage 1. The two-product rule worked: it caught
that couples coaching and life coaching are different people in a different
moment paying for a different reason, which the first run had flattened. Two
things were wrong anyway.

**It narrated its own reasoning.** The answer opened "The evidence shows two
products, not one", and the outcome field opened "Assuming couples is the
answer above", closing with "if the answer is life coaching, this needs
rewriting". Every one of those is a sentence about the worksheet rather than
an entry in it - and these values are pasted straight into the founder's
document and shown back as their own writing. No CONTENT rule catches this;
the answer can be completely right about the business and still unusable
because of who it is written to. So `ANSWER_RULES` gained a voice rule, first
in the list, and `META_VOICE_EXAMPLE` keeps the rejected text verbatim beside
the feature-list one. The two fail in opposite directions: the first described
everything and decided nothing, the second decided and then narrated the
deciding.

**And the target was wrong.** "One kind of user, one change, one mechanism"
was still the interview's aim in disguise - a crisp mechanism sketch. What
stage 1 actually wants is the MISSION: who it is for, the problem it exists to
solve, what the product is. Likewise `user_outcome` had produced a vignette
(one partner, one argument, one day) where the question wants the general
outcome: how the problem gets solved. Both prompts were retargeted.

**The two-product question moved into `[to fill]`.** It was being asked in
prose at the end of the answer, which is the same voice problem. The framework
already has a marker for a decision only the founder can make, and
`PLACEHOLDER_PREFIX` is read by `pmfDocs` to count what is answered versus
asked, so the flag is both the right voice and the right data.

Worth noticing for next time: each round of this has been a register problem,
not a knowledge problem. The model knew the business in all three runs.

---

## 2026-09-19 (altitude) - one product, whole picture, vision not usage

Second run of the reframed stage 1. The voice rule held - no "the evidence",
no "assuming" - and three things were still wrong. All three were altitude or
shape, none was knowledge.

**The two-product rule was an over-correction, and it fired on a false
positive.** It split Selvenn into couples coaching and life coaching. Those
are not two businesses; they are one product used by a couple together or by
one person alone, which is two USE CASES, and this framework has an entire
stage for splitting users up. Manufacturing the split at the mission turns
"what is this business" into "which worksheet should I open". The rule now
reads **assume ONE product**, with the `[to fill]` flag reserved for genuinely
separate businesses - no shared core, bought separately, nothing lost by
building one without the other - and even then the model decides whether it is
worth raising. Two products is the rare case, not the careful one.

**It described one branch in full, then the other.** New rule: widest true
statement first, then deeper only if needed. The reader should never have to
assemble the business themselves.

**`user_outcome` was a usage report.** "Over weeks they can tell whether the
thing they keep fighting about is actually improving" is the mechanics of a
few weeks of use; the question wants the VISION. Stage 1 is now explicitly
mission then vision, with one guard against the empty version of a vision: if
you could paste it onto a competitor's site, it is too vague.

**Shape change.** `FEATURE_LIST_EXAMPLE` / `META_VOICE_EXAMPLE` became
`MISSION_EXAMPLE` / `VISION_EXAMPLE` (`WORKED_EXAMPLES`), keyed by the QUESTION
rather than by the failure, each holding a list of rejected answers. Failures
keep accumulating on the same two questions, and naming the constants after
one failure each meant renaming them every round. Both rejected answers per
question are kept word for word, and both are true about the business - that
is the point of keeping them.

The pattern across all three rounds: rules do not fix register, because a rule
about register reads as already satisfied by the answer that breaks it. The
rejected text is what shows the distance. Expect the next fix to be an example
rather than a rule.

---

## 2026-09-19 (tables) - the answer rules were not reaching the tables

Asked whether Target users has AI behind it. It does - `generateTable` makes
two calls, columns then rows - and it was the only generator that never saw
`answerGuidance()`. Three rounds of tuning had landed on the stage 1 prefill
and the doc filler; the tables had one line echoed into `ROW_RULES` about a
row that lists several tracks being "a feature list wearing a row's clothing",
and nothing else.

That gap was going to reproduce every failure we had just fixed, one table at
a time. A row per product track is the same mistake as splitting one business
into two, and a cell that narrates its own reasoning is as unusable as a
paragraph that does.

**Split, not bolted on.** `answerRulesBlock()` is the rules alone;
`answerGuidance()` is the rules plus the worked examples. Columns get the
rules - that call returns labels, anchors and a one-line reason, and two
paragraph-length answers to two stage-1 questions would be most of its prompt
for nothing. Rows get both, plus a line naming the one rule a cell does NOT
inherit: length. A cell has to stay comparable against the rows beside it, and
"length is not the test" is written for prose.

Worth remembering as the shape here: a generator added later does not
automatically pick up guidance added earlier, and nothing fails when it
doesn't. The check is `grep answerGuidance src/lib` against the list of call
sites in `ai.ts`'s `AiPurpose`.

---

## 2026-09-19 (rows) - a failed row call looked like an empty table

The columns came back good and the table was empty, with no error. Cause:
`generateTable` makes two calls, and the second one's failure was swallowed -
zero rows were saved as a success. From the founder's side that reads as "the
model had nothing to suggest" when it actually means the call failed.

Two fixes, both small:

- **`draftRows` reports an empty result as an error.** `generateTable` still
  SAVES the columns when rows fail - they are the expensive half, and throwing
  them away because the second call failed would mean deriving them again -
  and the action now says "N columns, but no rows: <why>".
- **`generateRows` is a second entry point**, rows only, against the columns
  already stored. Until now the only retry was "Re-derive columns", which
  replaces the columns the founder just approved and discards any rows they
  edited. That is the wrong price for a second opinion on the rows.
  Button: **Suggest rows with AI**, beside Re-derive columns.

`tableContext` was extracted while doing it - both entry points need the same
"answers above this table" context, and that logic (upward only, earlier
tables rendered, `[to fill]` dropped) is the part that would drift if it were
copied.

Also renamed the empty-state button from "Choose the parameters" to
**Generate with AI**: the old label described the first of its two calls and
named neither the AI nor the rows.

**Text cells were truncating.** The row label is the thing being compared, and
it was a single-line `<input>` showing "Someone who" and nothing else. Every
text cell is now a textarea that wraps and grows to its content on mount and
on input, and text columns get `min-w-[22rem]` against `min-w-[8rem]` for the
scoring ones - `.scroll-x` already handles the overflow on a narrow screen.
A `[to fill]` question lands in a text cell too, which is the other reason a
single line was never enough.

---

## 2026-09-19 (axes) - a MECE list is only MECE with respect to an axis

Raised by the founder, and it is a level above what the tool was doing: the
segment generator picked an axis SILENTLY and returned the rows it implied.
Split by the moment someone is in, by what they have already tried, by what
they can afford, and you get three defensible tables and three different
companies. That choice was being made for them.

**`src/lib/domain/pmfSegmentations.ts`** + `proposeSegmentations` /
`chooseSegmentation` + a **Compare ways to split** button on the segment
table. It returns 2 to 4 whole alternatives, each with its axis, its rows,
why it might be right, and - required - what it HIDES. "Use this one"
replaces the rows.

Three rules came out of the conversation and are all enforced in the prompt:

- **A row is a situation, never a label.** The founder's first sketch was
  relationship trouble / depression / ADHD / ambition, then corrected it
  themselves: those are labels that correlate with situations. A diagnosis as
  a segment is two problems at once - a clinical claim the product is not
  entitled to make, and a poor predictor of purchase. "Cannot get out of bed
  while their partner quietly carries everything" is the segment.
- **The label still has a job, in its own field.** It is how these people
  search and how an ad reaches them, which is not the same job as describing
  their situation. `selfDescription` per row is that bridge, and choosing a
  segmentation injects a `How they describe themselves` column for it. You can
  buy the keyword without making the claim.
- **Axes must not be mixed.** Someone with a diagnosis can be in any of the
  situational rows, so a table holding both is not mutually exclusive even
  though every row reads fine alone. Offering axes as whole alternatives is
  what prevents it, and choosing REPLACES the rows for the same reason.

Unpicked alternatives are deliberately not persisted: cheap to ask for again,
and storing them turns one decision into a drawer of half-made ones. The
option travels back through the form and is re-read with the same tolerant
parser that read it out of the model, so a mangled payload is rejected rather
than stored.

Scoped to `segment_list` on purpose (`SEGMENTATION_FIELD`). A pain is anchored
to a step of a journey that is already written, so its axis is given; widen
only if a second table turns out to have the same ambiguity.

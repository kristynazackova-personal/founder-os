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

# PRD V2: Launch, grow, and memberships A and C
Working name: [TBD] | Owner: Kristyna Zackova | Status: Draft | Target: months 6 to 12

## 1. Goal
Turn V1's diagnosed founders into earning ones and reach $20K MRR: 800 active merchants, full stage ladder, launch and playbook engine, and two memberships (Distribution, Product operations). Establish distribution through Lovable and Bolt ecosystems.

## 2. Target user
All V1 users plus founders at stage 3 to 5 who arrive with Stripe already connected. Secondary: technical indie hackers who want the attribution loop.

## 3. Problem
After price and checkout, founders stall on distribution and on product decisions. They post once, drift back to building, and cannot tell what worked. No tool ties channel activity to paid outcomes or helps a non-PM run product.

## 4. Scope

### In
1. **Full stage ladder (0 to 5)** with peer bands from our data; stage-transition celebrations and lifecycle email.
2. **Stage-scaled subscription** for Stripe-connected founders: $29 (stage 2 to 3), $79 (stage 4), $149 (stage 5). Wrapped-checkout founders stay on $39 auto-unlock.
3. **Launch sequence**
   - Channel-specific playbooks: Product Hunt, Reddit, Hacker News, LinkedIn, X, niche communities.
   - Draft posts and timing; founder approves and publishes (draft-first, one-tap approve, we never post).
   - Every draft carries a tracked link; results flow into attribution.
4. **Weekly playbook**
   - Three concrete actions per week, chosen from the founder's stage and channel results.
   - "Reddit brought 12 paying users at $4 each, LinkedIn 0" style reporting; kill/scale recommendations.
5. **Membership A: Distribution** ($49 to $79/mo)
   - Social post creation tied to attribution.
   - Word of mouth: relevant public threads surfaced, helpful reply drafts (ThreadLift module).
   - Partner reach: cross-promotion matches between apps in the network by complementary audience; opt-in, both sides approve.
6. **Membership C: Product operations** ($39 to $99/mo)
   - In-app feedback widget (via the snippet) and interview-synthesis tool.
   - Release review: pre-ship checklist, changelog generator, security scan (exposed tables, secrets in client code), pricing-impact check.
   - Coaching tier ($199/mo) with a monthly call. Manual at first.
7. **Ecosystem distribution**
   - Lovable and Bolt templates with the snippet and checkout pre-wired.
   - Lovable Connectors listing; Bolt/Replit integration where available.
8. **Graduation referrals**: Paddle, ChartMogul, RevenueCat, vetted engineers, accountants. Referral tracking and payout.

### Out (V3)
Ads, B2B sales membership, vertical tier, platform white-label, financing, marketplace, PM automation beyond feedback and release review.

## 5. User stories
- As a stage 2 founder, I get a launch plan for the two channels most likely to work for apps like mine, with posts drafted.
- As a stage 3 founder, I see paid conversion by channel and am told which channel to kill.
- As a founder, I approve a reply in a Reddit thread where my app is relevant and see whether it produced a signup.
- As a founder, I get matched with another app whose users overlap mine and we cross-promote.
- As a non-PM founder, I collect feedback in-app and get a prioritized list of what to build next.
- As a founder about to ship, I run a release review and learn my Supabase table is publicly readable before a customer does.

## 6. Functional requirements
- Playbook recommendations are explainable: each action shows the data that triggered it.
- Draft-first everywhere; no OAuth scopes that allow posting on the founder's behalf.
- Partner matching requires mutual opt-in and shows audience overlap without exposing user data.
- Feedback widget respects the same anonymous-ID policy as the snippet.
- Release review runs in <2 minutes on a published URL plus optional repo read.
- Peer bands only shown where n ≥ 50 in the stage/category cell.

## 7. Data and events
`launch_plan_generated`, `draft_approved{channel}`, `draft_published{channel}`, `playbook_action_completed`, `channel_killed`, `wom_thread_surfaced`, `wom_reply_approved`, `partner_match_proposed`, `partner_match_accepted`, `feedback_received`, `release_review_run{findings}`, `membership_started{A|C}`, `referral_clicked{partner}`.

## 8. Integrations
Reddit, X, LinkedIn, Hacker News, Product Hunt (read/draft only), Lovable Connectors, Bolt templates, GitHub read (release review), referral partners' affiliate programs.

## 9. Success metrics (end of month 12)
- $20K MRR; 800 active merchants; merchant GMV $480K/mo.
- 40% of earning merchants on at least one membership.
- Founders with attribution installed: 70%.
- Launch sequence users reach stage 2 at 1.5x the rate of non-users.
- Release review catches at least one critical finding in 20% of runs (proves value).
- 30% of new signups come via Lovable/Bolt templates or listings.
- Monthly churn on paid: <6%.

## 10. Risks
- Platform bans for automated activity: mitigated by draft-first; audit any partner tooling.
- Content quality of drafts is generic: use the founder's product data and prior winning posts; human review.
- Lovable ships a native launch assistant: keep the attribution loop and cross-app partner network as things they cannot replicate quickly; be listed inside their ecosystem.
- Memberships dilute focus: A and C only; B deferred.

## 11. Dependencies
V1 release criteria met; n ≥ 50 merchants in enough stage cells for peer bands; ThreadLift module integration; Lovable partner program acceptance.

## 12. Open questions
- Should partner reach be free (network effect) or membership-only? (Proposal: free to match, membership to run campaigns.)
- Coaching tier: founder-delivered only, or a vetted coach bench?
- Do we host founders' blog/SEO content, or stay draft-only?

## 13. Release criteria
Launch sequence and playbook live for all stages; both memberships purchasable; Lovable template published; $10K MRR run-rate at least one month before the end of the window.

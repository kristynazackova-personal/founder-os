# PRD V3: Platform, vertical B2B, ads, capital, marketplace
Working name: [TBD] | Owner: Kristyna Zackova | Status: Draft | Target: months 12 to 24

## 1. Goal
Reach ~$1M ARR and move from a direct SaaS to a data-and-distribution business: white-label the layer to at least one build platform, open the vertical B2B tier with Membership B, launch ads-with-a-guardrail, pilot revenue advances, and open the exit marketplace.

## 2. Target user
- Build platforms (Lovable, Bolt, Replit, Base44) as B2B customers.
- Vertical B2B founders (healthcare, restaurants, fashion, professional services) at stage 3+.
- Stage 4 to 5 founders ready for paid acquisition or capital.
- Buyers of small software businesses.

## 3. Problem
Direct distribution and a 2-point spread cap the business near $1M ARR. The accumulated asset (verified revenue, attribution, and product feedback on thousands of AI-built apps) is worth more as infrastructure, underwriting data, and a marketplace signal than as a dashboard.

## 4. Scope

### In
1. **Platform white-label (B2B2C)**
   - Embeddable "Monetize" module: diagnosis, pricing engine, checkout, stage KPIs, delivered via SDK and API.
   - Multi-tenant, platform-branded, SSO from the host platform.
   - Commercial: 0.5% of merchant GMV or per-active-merchant fee; platform keeps the founder relationship.
   - Target: one signed platform by month 18.
2. **Vertical B2B tier** ($199 to $499/mo + take-rate)
   - Sales-assisted onboarding, invoicing, annual plans, contracts/quotes, multi-seat customer accounts.
   - **Membership B: B2B client reach** ($149 to $249/mo): ICP definition, prospect lists, intent signals, personalized outreach drafts. Founder-sent only.
3. **Ads with a guardrail** (stage 4+, $99/mo or 5% of spend)
   - Founder connects their own Meta/Google ad account.
   - We draft campaigns from winning organic creative; spend capped at a multiple of proven CAC; daily ROI vs. attribution data; auto-pause on payback breach.
   - We never hold budget.
4. **Revenue advances (pilot)**
   - 3 to 6 month advances against MRR, underwritten on our own payment and retention data.
   - Capital from a partner (revenue-based financing fund); we take 6 to 10% of the advance as origination/servicing.
   - Eligibility: stage 4+, 6 months of data, churn under threshold. Repayment via checkout split or Stripe debit.
5. **Exit marketplace**
   - Verified-revenue listings for AI-built businesses; buyer side vetted; 5 to 10% success fee.
   - Data room auto-generated from our metrics; escrow via partner.
6. **PM automation and coaching (Membership C expansion)**
   - Roadmap generation from feedback, spec drafts, weekly prioritization; coach bench for the $199 tier.

### Out
Building our own payment infrastructure; holding customer funds; lending from our own balance sheet; enterprise/agency multi-client accounts.

## 5. User stories
- As a build platform, I add a Monetize tab in a week and report merchant GMV to my investors.
- As a healthcare-software founder, I send quotes and invoices, close annual contracts, and get prospect lists I approve before sending.
- As a stage 4 founder, I turn on ads knowing spend stops automatically if payback exceeds 90 days.
- As a stage 4 founder, I take a $10K advance against MRR in two days without a pitch deck.
- As a founder ready to move on, I list my app with verified revenue and get qualified buyers.

## 6. Functional requirements
- White-label module is API-first; every V1/V2 feature is available headless.
- Tenant isolation, per-platform data residency options, audit log.
- Ads module reads spend and conversions daily; pause rule executes within one hour of breach.
- Underwriting model is documented, back-tested on existing merchants, and reviewed by the capital partner.
- Marketplace listings show only metrics we can verify; unverified claims are labeled.
- All lending, escrow, and money movement are executed by licensed partners; we orchestrate.

## 7. Data and events
`platform_tenant_created`, `platform_merchant_activated`, `vertical_tier_started`, `quote_sent`, `invoice_paid`, `b2b_prospect_list_generated`, `b2b_outreach_approved`, `ads_connected`, `ads_paused{reason}`, `advance_offered`, `advance_funded`, `advance_repaid`, `listing_created`, `buyer_verified`, `deal_closed{value}`.

## 8. Integrations
Platform SDK/SSO (Lovable, Bolt, Replit, Base44), Meta Ads and Google Ads APIs, RBF capital partner, escrow provider, prospecting data provider, e-signature.

## 9. Success metrics (end of month 24)
- ~$1M ARR total; at least $200K ARR from non-subscription lines (platform, advances, marketplace).
- One platform partnership live with ≥1,000 activated merchants.
- 40 vertical B2B accounts; Membership B attach rate ≥50% among them.
- Ads: median payback under 90 days across active accounts; zero founder-reported budget losses beyond cap.
- Advances: $500K originated in pilot; default rate <5%.
- Marketplace: 10 closed deals.

## 10. Risks
- Platform partner builds it themselves: keep pricing benchmarks, attribution, partner network, and marketplace liquidity as the reasons to integrate rather than rebuild; sign with the platform that is not Lovable first if Lovable stalls.
- Regulatory exposure on advances and marketplace: partners hold licenses; legal review before pilot.
- Ads reputation risk: hard caps and auto-pause are non-negotiable; ads are opt-in for stage 4+ only.
- B2B outreach deliverability: founder-sent, volume-limited, no shared domains.
- Founder bandwidth: V3 requires hires (engineering lead, partnerships/BD, part-time risk/ops).

## 11. Dependencies
V2 success metrics; ≥2,000 merchants of data for underwriting; legal entity and partner agreements (RBF fund, escrow, ads API access); at least one platform champion.

## 12. Open questions
- Platform deal structure: revenue share vs. flat fee vs. acquisition talk?
- Advances: which capital partner, and do we need any license ourselves in the US?
- Marketplace: exclusive listings or syndicate to Acquire.com?
- When does membership B become a standalone product?

## 13. Release criteria
Platform module in production with one partner; vertical tier live with ≥20 paying accounts; ads and advances pilots complete with published guardrails; marketplace with first closed deal.

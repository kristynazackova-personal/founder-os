import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name"),
  createdAt: createdAt(),
  // Billing for Founder OS itself (we charge founders via Stripe).
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  subscriptionActive: boolean("subscription_active").notNull().default(false),
  planUnlockedAt: timestamp("plan_unlocked_at", { withTimezone: true }),
});

export const sessions = pgTable("sessions", {
  /** sha256 of the cookie token */
  id: text("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

export const apps = pgTable(
  "apps",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    url: text("url"),
    platform: text("platform").notNull().default("other"),
    projectLink: text("project_link"),
    launchedAt: timestamp("launched_at", { withTimezone: true }),
    /** Public key used by the attribution snippet. */
    siteKey: text("site_key").notNull().unique(),
    activationEvent: text("activation_event"),
    /** test | live — the wrapped-checkout mode the founder is currently editing. */
    checkoutMode: text("checkout_mode").notNull().default("test"),
    lastStage: integer("last_stage"),
    lastConfidence: text("last_confidence"),
    /** What the business is, asked at creation — drives the gates below (domain/gates.ts). */
    industry: text("industry"),
    /** How it sells: app_subscription | web_subscription | freemium | one_off | marketplace_fee. */
    nature: text("nature"),
    /**
     * The thresholds this app's B2C metrics are judged against, as a GateSet.
     * Written from published category benchmarks the moment the app is created,
     * then refined by a competitor research pass when one can run. Never
     * invented: every gate carries its own source.
     */
    gates: jsonb("gates").$type<Record<string, unknown>>(),
    gatesGeneratedAt: timestamp("gates_generated_at", { withTimezone: true }),
    snippetInstalledAt: timestamp("snippet_installed_at", { withTimezone: true }),
    firstPurchaseAt: timestamp("first_purchase_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("apps_user_idx").on(t.userId)],
);

export const revenueSources = pgTable(
  "revenue_sources",
  {
    id: id(),
    appId: uuid("app_id").notNull().references(() => apps.id, { onDelete: "cascade" }),
    /** stripe | lemonsqueezy | paddle | ga4 */
    type: text("type").notNull(),
    externalId: text("external_id"),
    /** AES-256-GCM encrypted JSON of tokens / keys. */
    credentialsEnc: text("credentials_enc").notNull(),
    status: text("status").notNull().default("connected"),
    connectedAt: createdAt(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastError: text("last_error"),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [uniqueIndex("revenue_sources_app_type_idx").on(t.appId, t.type)],
);

/** Which guide steps a founder has ticked off on an integration's connect page. */
export const connectChecklists = pgTable(
  "connect_checklists",
  {
    id: id(),
    appId: uuid("app_id").notNull().references(() => apps.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    done: jsonb("done").$type<string[]>().notNull().default([]),
    /** Non-secret form fields saved for later (never keys, passwords or tokens). */
    draft: jsonb("draft").$type<Record<string, string>>().notNull().default({}),
    /** Secret draft fields (keys, passwords), AES-256-GCM encrypted JSON. Used on connect, never displayed. */
    draftSecretsEnc: text("draft_secrets_enc"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("connect_checklists_app_source_idx").on(t.appId, t.source)],
);

export const assessments = pgTable(
  "assessments",
  {
    id: id(),
    appId: uuid("app_id").notNull().references(() => apps.id, { onDelete: "cascade" }),
    computedAt: createdAt(),
    metrics: jsonb("metrics").notNull(),
    stage: integer("stage").notNull(),
    confidence: text("confidence").notNull(),
    reasons: jsonb("reasons").$type<string[]>().notNull().default([]),
    confidenceReasons: jsonb("confidence_reasons").$type<string[]>().notNull().default([]),
    sourcesUsed: jsonb("sources_used").$type<string[]>().notNull().default([]),
  },
  (t) => [index("assessments_app_idx").on(t.appId, t.computedAt)],
);

export const pricingInterviews = pgTable("pricing_interviews", {
  id: id(),
  appId: uuid("app_id").notNull().references(() => apps.id, { onDelete: "cascade" }).unique(),
  answers: jsonb("answers").notNull(),
  recommendation: jsonb("recommendation").notNull(),
  /** Founder edits to tiers (name / price), applied over the recommendation. */
  overrides: jsonb("overrides").$type<Record<string, { name?: string; priceCents?: number; yearlyPriceCents?: number | null }>>().notNull().default({}),
  startedAt: createdAt(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  copiedAt: timestamp("copied_at", { withTimezone: true }),
});

export const plans = pgTable(
  "plans",
  {
    id: id(),
    appId: uuid("app_id").notNull().references(() => apps.id, { onDelete: "cascade" }),
    slug: text("slug").notNull().unique(),
    tierKey: text("tier_key").notNull(),
    name: text("name").notNull(),
    /** subscription | one_time */
    model: text("model").notNull(),
    /** month | year | null */
    interval: text("interval"),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("usd"),
    /** test | live */
    mode: text("mode").notNull(),
    provider: text("provider").notNull(),
    providerProductId: text("provider_product_id"),
    providerPriceId: text("provider_price_id"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("plans_app_idx").on(t.appId)],
);

export const checkoutSessions = pgTable(
  "checkout_sessions",
  {
    id: id(),
    appId: uuid("app_id").notNull().references(() => apps.id, { onDelete: "cascade" }),
    planId: uuid("plan_id").notNull().references(() => plans.id, { onDelete: "cascade" }),
    anonId: text("anon_id"),
    provider: text("provider").notNull(),
    providerSessionId: text("provider_session_id"),
    mode: text("mode").notNull(),
    status: text("status").notNull().default("open"),
    createdAt: createdAt(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("checkout_sessions_app_idx").on(t.appId), index("checkout_sessions_provider_idx").on(t.provider, t.providerSessionId)],
);

export const wrappedSubscriptions = pgTable(
  "wrapped_subscriptions",
  {
    id: id(),
    appId: uuid("app_id").notNull().references(() => apps.id, { onDelete: "cascade" }),
    planId: uuid("plan_id").references(() => plans.id, { onDelete: "set null" }),
    provider: text("provider").notNull(),
    providerSubscriptionId: text("provider_subscription_id").notNull(),
    providerCustomerId: text("provider_customer_id"),
    customerEmail: text("customer_email"),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull(),
    interval: text("interval").notNull(),
    status: text("status").notNull(),
    mode: text("mode").notNull(),
    anonId: text("anon_id"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("wrapped_subs_provider_idx").on(t.provider, t.providerSubscriptionId), index("wrapped_subs_app_idx").on(t.appId)],
);

export const purchases = pgTable(
  "purchases",
  {
    id: id(),
    appId: uuid("app_id").notNull().references(() => apps.id, { onDelete: "cascade" }),
    planId: uuid("plan_id").references(() => plans.id, { onDelete: "set null" }),
    provider: text("provider").notNull(),
    providerPaymentId: text("provider_payment_id").notNull(),
    providerSubscriptionId: text("provider_subscription_id"),
    providerCustomerId: text("provider_customer_id"),
    customerEmail: text("customer_email"),
    /** one_time | subscription | renewal */
    kind: text("kind").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull(),
    feeCents: integer("fee_cents").notNull(),
    netCents: integer("net_cents").notNull(),
    mode: text("mode").notNull(),
    anonId: text("anon_id"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    raw: jsonb("raw"),
  },
  (t) => [uniqueIndex("purchases_provider_payment_idx").on(t.provider, t.providerPaymentId), index("purchases_app_idx").on(t.appId, t.occurredAt)],
);

export const attributionEvents = pgTable(
  "attribution_events",
  {
    id: id(),
    appId: uuid("app_id").notNull().references(() => apps.id, { onDelete: "cascade" }),
    anonId: text("anon_id").notNull(),
    /** pageview | signup | activation | checkout_view | purchase | return */
    event: text("event").notNull(),
    channel: text("channel").notNull(),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    referrer: text("referrer"),
    path: text("path"),
    purchaseId: uuid("purchase_id").references(() => purchases.id, { onDelete: "set null" }),
    props: jsonb("props").$type<Record<string, unknown>>(),
    occurredAt: createdAt(),
  },
  (t) => [index("attribution_app_anon_idx").on(t.appId, t.anonId), index("attribution_app_time_idx").on(t.appId, t.occurredAt)],
);

/**
 * Ad spend the founder typed in, for the attribution card's rolling window.
 * GA4 only reports cost when the Google Ads link actually delivers it, which
 * it often does not for app campaigns, and the Google Ads API needs an
 * approved developer token — so a number the founder enters is the only
 * source that always works. GA4 wins for any campaign it does report.
 */
export const adSpend = pgTable(
  "ad_spend",
  {
    id: id(),
    appId: uuid("app_id").notNull().references(() => apps.id, { onDelete: "cascade" }),
    /** Campaign name as the founder writes it, or "" for "all campaigns". */
    campaign: text("campaign").notNull().default(""),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("usd"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("ad_spend_app_campaign_idx").on(t.appId, t.campaign)],
);

export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: id(),
    provider: text("provider").notNull(),
    externalId: text("external_id").notNull(),
    type: text("type").notNull(),
    receivedAt: createdAt(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    error: text("error"),
    payload: jsonb("payload"),
  },
  (t) => [uniqueIndex("webhook_events_provider_ext_idx").on(t.provider, t.externalId)],
);

export const productEvents = pgTable(
  "product_events",
  {
    id: id(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    appId: uuid("app_id").references(() => apps.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    props: jsonb("props").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("product_events_name_idx").on(t.name, t.createdAt)],
);

export type User = typeof users.$inferSelect;
export type App = typeof apps.$inferSelect;
export type RevenueSource = typeof revenueSources.$inferSelect;
export type Assessment = typeof assessments.$inferSelect;
export type PricingInterview = typeof pricingInterviews.$inferSelect;
export type Plan = typeof plans.$inferSelect;
export type Purchase = typeof purchases.$inferSelect;
export type WrappedSubscription = typeof wrappedSubscriptions.$inferSelect;
export type AttributionEvent = typeof attributionEvents.$inferSelect;
export type AdSpend = typeof adSpend.$inferSelect;

/**
 * One filled-in PMF framework per version, per app (domain/pmfDoc.ts).
 *
 * Immutable: an edit or a rewrite writes a new row rather than updating one,
 * so the founder can always see what the tool drafted and what they changed.
 * The newest row for an app is the live document.
 */
export const pmfDocuments = pgTable(
  "pmf_documents",
  {
    id: id(),
    appId: uuid("app_id").notNull().references(() => apps.id, { onDelete: "cascade" }),
    /** Which framework these answers belong to (domain/pmfFrameworks.ts). */
    framework: text("framework").notNull().default("conversation"),
    version: integer("version").notNull(),
    /** scaffold | generated | edited | rewritten */
    source: text("source").notNull(),
    /** The comment that asked for a rewrite, kept with the version it produced. */
    comment: text("comment"),
    values: jsonb("values").$type<Record<string, string>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("pmf_app_framework_version_idx").on(t.appId, t.framework, t.version)],
);

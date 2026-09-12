import type { AnalyticsSignals, NormalizedRevenueData } from "../domain/metrics";
import type { EventSettings } from "../domain/eventSettings";

export type SourceType = "stripe" | "lemonsqueezy" | "paddle" | "appstore" | "postgres" | "mixpanel" | "ga4" | "googleads";

/** Either a Connect OAuth grant (platform key + Stripe-Account header) or a founder-pasted restricted read-only key. */
export type StripeCredentials = { stripeUserId: string; accessToken?: string; refreshToken?: string; restrictedKey?: string };
export type ApiKeyCredentials = { apiKey: string; storeId?: string };
export type Ga4Credentials = { propertyId: string; serviceAccountJson: string };
/** A founder's Google Ads account. The developer token and OAuth client live in env, not here. */
export type GoogleAdsCredentials = { customerId: string; refreshToken: string; loginCustomerId?: string | null };
export type AppStoreCredentials = { issuerId: string; keyId: string; privateKey: string; vendorNumber: string };
export type MixpanelCredentials = { projectId: string; serviceUser: string; serviceSecret: string; region: "us" | "eu" | "in"; signupEvent: string; activationEvent: string | null; visitorEvent: string | null };
export type PriceMap = Record<string, { amountCents: number; interval: "day" | "week" | "month" | "year" }>;
export type PostgresCredentials = {
  connectionString: string;
  usersTable: string;
  usersCreatedAt: string;
  /** Optional subscription mapping; when set the source also reports revenue. */
  subs: { table: string; customer: string; startedAt: string; endedAt: string | null; plan: string | null; priceMap: PriceMap } | null;
};

export const SOURCE_LABEL: Record<SourceType, string> = {
  stripe: "Stripe",
  lemonsqueezy: "Lemon Squeezy",
  paddle: "Paddle",
  appstore: "App Store",
  postgres: "Postgres / Supabase",
  mixpanel: "Mixpanel",
  ga4: "Google Analytics 4",
  googleads: "Google Ads",
};

/** Sources that always carry revenue. Postgres carries revenue only when a subscription table is mapped (see `isRevenueSource`). */
export const REVENUE_SOURCE_TYPES: SourceType[] = ["stripe", "lemonsqueezy", "paddle", "appstore"];

export function isRevenueSource(row: { type: string; meta: unknown }): boolean {
  if (REVENUE_SOURCE_TYPES.includes(row.type as SourceType)) return true;
  return row.type === "postgres" && Boolean((row.meta as { hasSubscriptions?: boolean } | null)?.hasSubscriptions);
}

/** Identifier safe to interpolate into SQL: optional schema, lowercase/underscore names. */
export function isSqlIdentifier(s: string): boolean {
  return /^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$/.test(s);
}

export interface RevenueAdapter {
  fetchRevenue(credentials: unknown): Promise<NormalizedRevenueData & { hasProducts: boolean }>;
}
/** What the founder allowed the source to read (see domain/eventSettings). Null = never asked = everything. */
export type ReadOpts = { events?: EventSettings | null };

export interface AnalyticsAdapter {
  fetchSignals(credentials: unknown, now?: Date, opts?: ReadOpts): Promise<Partial<AnalyticsSignals>>;
}

export function toInterval(s: string | null | undefined): "day" | "week" | "month" | "year" {
  const v = (s ?? "month").toLowerCase();
  if (v.startsWith("day")) return "day";
  if (v.startsWith("week")) return "week";
  if (v.startsWith("year") || v === "annual" || v === "annually") return "year";
  return "month";
}

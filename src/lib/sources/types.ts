import type { AnalyticsSignals, NormalizedRevenueData } from "../domain/metrics";

export type SourceType = "stripe" | "lemonsqueezy" | "paddle" | "ga4";

/** Either a Connect OAuth grant (platform key + Stripe-Account header) or a founder-pasted restricted read-only key. */
export type StripeCredentials = { stripeUserId: string; accessToken?: string; refreshToken?: string; restrictedKey?: string };
export type ApiKeyCredentials = { apiKey: string; storeId?: string };
export type Ga4Credentials = { propertyId: string; serviceAccountJson: string };

export const SOURCE_LABEL: Record<SourceType, string> = {
  stripe: "Stripe",
  lemonsqueezy: "Lemon Squeezy",
  paddle: "Paddle",
  ga4: "Google Analytics 4",
};

export const REVENUE_SOURCE_TYPES: SourceType[] = ["stripe", "lemonsqueezy", "paddle"];

export interface RevenueAdapter {
  fetchRevenue(credentials: unknown): Promise<NormalizedRevenueData & { hasProducts: boolean }>;
}
export interface AnalyticsAdapter {
  fetchSignals(credentials: unknown, now?: Date): Promise<Partial<AnalyticsSignals>>;
}

export function toInterval(s: string | null | undefined): "day" | "week" | "month" | "year" {
  const v = (s ?? "month").toLowerCase();
  if (v.startsWith("day")) return "day";
  if (v.startsWith("week")) return "week";
  if (v.startsWith("year") || v === "annual" || v === "annually") return "year";
  return "month";
}

import { lemonSqueezyAdapter } from "./lemonsqueezy";
import { paddleAdapter } from "./paddle";
import { stripeAdapter } from "./stripe";
import { appStoreAdapter } from "./appstore";
import { postgresAnalyticsAdapter, postgresRevenueAdapter } from "./postgres";
import { mixpanelAdapter } from "./mixpanel";
import { ga4Adapter } from "./ga4";
import type { AnalyticsAdapter, RevenueAdapter, SourceType } from "./types";

export function revenueAdapter(type: SourceType): RevenueAdapter | null {
  switch (type) {
    case "stripe":
      return stripeAdapter;
    case "lemonsqueezy":
      return lemonSqueezyAdapter;
    case "paddle":
      return paddleAdapter;
    case "appstore":
      return appStoreAdapter;
    case "postgres":
      return postgresRevenueAdapter;
    default:
      return null;
  }
}

export function analyticsAdapter(type: SourceType): AnalyticsAdapter | null {
  switch (type) {
    case "ga4":
      return ga4Adapter;
    case "mixpanel":
      return mixpanelAdapter;
    case "postgres":
      return postgresAnalyticsAdapter;
    default:
      return null;
  }
}

/** Order in which analytics sources fill a gap the snippet leaves. */
export const ANALYTICS_SOURCE_TYPES: SourceType[] = ["postgres", "mixpanel", "ga4"];

export * from "./types";

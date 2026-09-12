import { lemonSqueezyAdapter } from "./lemonsqueezy";
import { paddleAdapter } from "./paddle";
import { stripeAdapter } from "./stripe";
import type { RevenueAdapter, SourceType } from "./types";

export function revenueAdapter(type: SourceType): RevenueAdapter | null {
  switch (type) {
    case "stripe":
      return stripeAdapter;
    case "lemonsqueezy":
      return lemonSqueezyAdapter;
    case "paddle":
      return paddleAdapter;
    default:
      return null;
  }
}

export * from "./types";

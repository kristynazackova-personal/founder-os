/** Product events (PRD V1 §7). Recorded in `product_events` for our own analytics. */
export type ProductEventName =
  | "app_connected"
  | "source_connected"
  | "diagnosis_viewed"
  | "pricing_started"
  | "pricing_completed"
  | "pricing_page_copied"
  | "checkout_enabled"
  | "checkout_live"
  | "first_purchase"
  | "snippet_installed"
  | "stage_changed"
  | "plan_unlocked";

export const PRODUCT_EVENTS: ProductEventName[] = [
  "app_connected",
  "source_connected",
  "diagnosis_viewed",
  "pricing_started",
  "pricing_completed",
  "pricing_page_copied",
  "checkout_enabled",
  "checkout_live",
  "first_purchase",
  "snippet_installed",
  "stage_changed",
  "plan_unlocked",
];

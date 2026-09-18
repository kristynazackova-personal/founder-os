/**
 * Billing for Founder OS itself.
 *
 * - Wrapped-checkout founders: free until $500 lifetime revenue through us,
 *   then $39/mo auto-unlock.
 * - Stripe-connected founders (no wrapped revenue): $29/mo after a 14-day
 *   trial that starts when Stripe is connected.
 *
 * The state is derived, never stored, from a few facts.
 */
export const WRAPPED_FREE_UNTIL_CENTS = 50_000;
export const WRAPPED_PLAN_CENTS = 3_900;
export const CONNECTED_PLAN_CENTS = 2_900;
export const CONNECTED_TRIAL_DAYS = 14;

export type BillingFacts = {
  lifetimeWrappedRevenueCents: number;
  /** When the first external revenue source (Stripe / LS / Paddle) was connected. */
  connectedSourceSince: Date | null;
  /** The founder pays us (Stripe subscription active). */
  subscriptionActive: boolean;
  now?: Date;
};

export type BillingState =
  | { status: "free"; track: "wrapped"; remainingCents: number; planCents: number; message: string }
  | { status: "free"; track: "none"; remainingCents: number; planCents: number; message: string }
  | { status: "trial"; track: "connected"; trialEndsAt: Date; daysLeft: number; planCents: number; message: string }
  | { status: "unlock_required"; track: "wrapped" | "connected"; planCents: number; message: string }
  | { status: "active"; track: "wrapped" | "connected"; planCents: number; message: string };

export function billingState(f: BillingFacts): BillingState {
  const now = f.now ?? new Date();
  const wrappedTrack = f.lifetimeWrappedRevenueCents > 0;
  const track = wrappedTrack ? "wrapped" : f.connectedSourceSince ? "connected" : "none";
  const planCents = track === "connected" ? CONNECTED_PLAN_CENTS : WRAPPED_PLAN_CENTS;

  if (f.subscriptionActive) {
    return { status: "active", track: track === "none" ? "wrapped" : track, planCents, message: `Your Founder OS plan is active at $${planCents / 100}/mo.` };
  }

  if (track === "wrapped" || track === "none") {
    const remaining = Math.max(0, WRAPPED_FREE_UNTIL_CENTS - f.lifetimeWrappedRevenueCents);
    if (remaining > 0) {
      return {
        status: "free",
        track,
        remainingCents: remaining,
        planCents,
        message: `Free until you've made $500 through checkout. $${(remaining / 100).toFixed(0)} to go - we only charge when you get paid.`,
      };
    }
    return { status: "unlock_required", track: "wrapped", planCents, message: "You've passed $500 in revenue through checkout. Founder OS is now $39/mo." };
  }

  // connected track
  const trialEndsAt = new Date(f.connectedSourceSince!.getTime() + CONNECTED_TRIAL_DAYS * 86_400_000);
  if (now < trialEndsAt) {
    const daysLeft = Math.ceil((trialEndsAt.getTime() - now.getTime()) / 86_400_000);
    return { status: "trial", track: "connected", trialEndsAt, daysLeft, planCents, message: `Trial: ${daysLeft} day${daysLeft === 1 ? "" : "s"} left, then $29/mo.` };
  }
  return { status: "unlock_required", track: "connected", planCents, message: "Your 14-day trial has ended. Founder OS is $29/mo for Stripe-connected apps." };
}

/** Did the lifetime total cross the unlock threshold with this purchase? */
export function crossedUnlockThreshold(beforeCents: number, afterCents: number): boolean {
  return beforeCents < WRAPPED_FREE_UNTIL_CENTS && afterCents >= WRAPPED_FREE_UNTIL_CENTS;
}

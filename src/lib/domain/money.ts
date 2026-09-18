/**
 * Money helpers. Every amount in the system is an integer number of minor
 * units (cents) in a named currency. Reporting normalises to USD with a
 * coarse fixed table - good enough for stage placement and benchmarks, and
 * never used to move money.
 */

export const TAKE_RATE_BPS = 600; // 6%
export const TAKE_RATE_FIXED_CENTS = 50; // + 50¢

/** Approximate USD per unit of currency. Reporting only. */
const FX_TO_USD: Record<string, number> = {
  usd: 1,
  eur: 1.09,
  gbp: 1.27,
  czk: 0.043,
  cad: 0.73,
  aud: 0.66,
  chf: 1.12,
  pln: 0.25,
  sek: 0.095,
  nok: 0.093,
  dkk: 0.146,
  inr: 0.012,
  brl: 0.18,
  jpy: 0.0067,
};

export function toUsdCents(amountCents: number, currency: string): number {
  const rate = FX_TO_USD[currency.toLowerCase()] ?? 1;
  return Math.round(amountCents * rate);
}

/** Platform fee on a wrapped-checkout purchase: 6% + 50¢, never above the amount. */
export function platformFeeCents(amountCents: number): number {
  if (amountCents <= 0) return 0;
  const fee = Math.round((amountCents * TAKE_RATE_BPS) / 10_000) + TAKE_RATE_FIXED_CENTS;
  return Math.min(fee, amountCents);
}

/** Convert a recurring price to its monthly equivalent in cents. */
export function monthlyEquivalentCents(
  amountCents: number,
  interval: "day" | "week" | "month" | "year",
  intervalCount = 1,
): number {
  const count = Math.max(1, intervalCount);
  switch (interval) {
    case "day":
      return Math.round((amountCents * 30) / count);
    case "week":
      return Math.round((amountCents * 52) / 12 / count);
    case "month":
      return Math.round(amountCents / count);
    case "year":
      return Math.round(amountCents / 12 / count);
  }
}

export function formatMoney(cents: number, currency = "usd"): string {
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const sym = currency.toLowerCase() === "usd" ? "$" : currency.toLowerCase() === "eur" ? "€" : currency.toLowerCase() === "gbp" ? "£" : `${currency.toUpperCase()} `;
  const sign = cents < 0 ? "-" : "";
  const body = frac === 0 ? whole.toLocaleString("en-US") : `${whole.toLocaleString("en-US")}.${String(frac).padStart(2, "0")}`;
  return `${sign}${sym}${body}`;
}

export function formatPercent(fraction: number | null, digits = 0): string {
  if (fraction === null || !Number.isFinite(fraction)) return "—";
  return `${(fraction * 100).toFixed(digits)}%`;
}

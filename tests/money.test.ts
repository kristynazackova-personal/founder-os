import { describe, expect, it } from "vitest";
import { platformFeeCents, monthlyEquivalentCents, formatMoney, toUsdCents } from "@/lib/domain/money";

describe("platformFeeCents", () => {
  it("charges 6% + 50¢", () => {
    expect(platformFeeCents(10_000)).toBe(650);
    expect(platformFeeCents(1_900)).toBe(164);
  });
  it("never exceeds the amount", () => {
    expect(platformFeeCents(30)).toBe(30);
    expect(platformFeeCents(0)).toBe(0);
  });
});

describe("monthlyEquivalentCents", () => {
  it("normalises intervals", () => {
    expect(monthlyEquivalentCents(12_000, "year")).toBe(1_000);
    expect(monthlyEquivalentCents(1_000, "month")).toBe(1_000);
    expect(monthlyEquivalentCents(300, "week")).toBe(1_300);
    expect(monthlyEquivalentCents(6_000, "month", 3)).toBe(2_000);
  });
});

describe("formatting", () => {
  it("formats money", () => {
    expect(formatMoney(140_000)).toBe("$1,400");
    expect(formatMoney(1_999)).toBe("$19.99");
    expect(formatMoney(500, "eur")).toBe("€5");
  });
  it("converts currencies coarsely", () => {
    expect(toUsdCents(1000, "USD")).toBe(1000);
    expect(toUsdCents(1000, "eur")).toBe(1090);
  });
});

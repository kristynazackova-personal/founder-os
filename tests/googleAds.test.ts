import { describe, expect, it } from "vitest";
import { adRowsFromGoogleAds, campaignSpendQuery, microsToCents, normalizeCustomerId } from "@/lib/domain/googleAds";
import { summarizeCampaigns } from "@/lib/domain/campaigns";

describe("Google Ads", () => {
  it("converts micros of account currency to cents", () => {
    expect(microsToCents(1_000_000)).toBe(100); // one unit
    expect(microsToCents("12_500_000".replace(/_/g, ""))).toBe(1_250);
    expect(microsToCents(4_499_999)).toBe(450);
    expect(microsToCents(undefined)).toBe(0);
    expect(microsToCents("not a number")).toBe(0);
  });

  it("accepts a customer id however the founder pasted it", () => {
    expect(normalizeCustomerId("123-456-7890")).toBe("1234567890");
    expect(normalizeCustomerId(" 123 456 7890 ")).toBe("1234567890");
    expect(normalizeCustomerId("1234567890")).toBe("1234567890");
    expect(normalizeCustomerId("12345")).toBeNull(); // too short
    expect(normalizeCustomerId("12345678901")).toBeNull(); // too long
    expect(normalizeCustomerId("G-ABC1234")).toBeNull(); // a GA4 measurement id, not an ads account
    expect(normalizeCustomerId("")).toBeNull();
  });

  it("builds a dated GAQL query", () => {
    const q = campaignSpendQuery(new Date("2026-08-13T00:00:00Z"), new Date("2026-09-12T00:00:00Z"));
    expect(q).toContain("FROM campaign");
    expect(q).toContain("metrics.cost_micros");
    expect(q).toContain("WHERE segments.date BETWEEN '2026-08-13' AND '2026-09-12'");
  });

  it("sums rows per campaign and names an unnamed one", () => {
    const rows = adRowsFromGoogleAds([
      { campaign: { id: "1", name: "App CZ" }, metrics: { clicks: "400", impressions: "9000", costMicros: "120000000" } },
      { campaign: { id: "1", name: "App CZ" }, metrics: { clicks: "10", impressions: "100", costMicros: "5000000" } },
      { campaign: { id: "2", name: "  " }, metrics: { clicks: "1", impressions: "2", costMicros: "1000000" } },
    ]);
    expect(rows[0]).toEqual({ campaign: "App CZ", clicks: 410, impressions: 9_100, costCents: 12_500 });
    expect(rows[1].campaign).toBe("2");
  });

  it("feeds the summariser so CAC and payback compute from real spend", () => {
    const ads = adRowsFromGoogleAds([{ campaign: { name: "App CZ" }, metrics: { clicks: "400", costMicros: "120000000" } }]);
    const { rows } = summarizeCampaigns(ads, [{ campaign: "App CZ", event: "first_open", users: 40 }, { campaign: "App CZ", event: "purchase", users: 2 }], {
      monthlyRevenuePerPayingCents: 2_349,
      adSource: "googleads",
    });
    expect(rows[0].spendSource).toBe("googleads");
    expect(rows[0].costPerInstallCents).toBe(300);
    expect(rows[0].cacCents).toBe(6_000);
    expect(rows[0].paybackMonths).toBe(2.6);
  });

  it("a reported figure always beats a typed one", () => {
    const { rows } = summarizeCampaigns(
      [{ campaign: "App CZ", clicks: 1, impressions: 1, costCents: 12_000 }],
      [{ campaign: "App CZ", event: "first_open", users: 10 }],
      { monthlyRevenuePerPayingCents: null, adSource: "googleads", manualSpend: [{ campaign: "App CZ", amountCents: 99_900, updatedAt: new Date() }] },
    );
    expect(rows[0].spendCents).toBe(12_000);
    expect(rows[0].spendSource).toBe("googleads");
  });
});

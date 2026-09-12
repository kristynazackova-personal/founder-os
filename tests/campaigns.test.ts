import { describe, expect, it } from "vitest";
import { pickAdRows, summarizeCampaigns, UNATTRIBUTED_CAMPAIGN } from "@/lib/domain/campaigns";
import { parseAmount } from "@/lib/services/adSpend";
import { campaignAdRowsFromReport, campaignEventRowsFromReport } from "@/lib/sources/ga4";

describe("summarizeCampaigns", () => {
  it("joins spend to attributed events and computes unit costs and payback", () => {
    const { rows, total } = summarizeCampaigns(
      [
        { campaign: "App CZ", clicks: 400, impressions: 9000, costCents: 12_000 },
        { campaign: "App US", clicks: 100, impressions: 3000, costCents: 8_000 },
        { campaign: "(not set)", clicks: 0, impressions: 0, costCents: 0 },
      ],
      [
        { campaign: "App CZ", event: "first_open", users: 40 },
        { campaign: "App CZ", event: "trial_start", users: 8 },
        { campaign: "App CZ", event: "purchase", users: 2 },
        { campaign: "App US", event: "first_open", users: 10 },
        { campaign: "(not set)", event: "first_open", users: 500 },
      ],
      { monthlyRevenuePerPayingCents: 1_500 },
    );
    expect(rows.map((r) => r.campaign)).toEqual(["App CZ", "App US", UNATTRIBUTED_CAMPAIGN]);
    expect(rows[2].installs).toBe(500); // organic first_open under "(not set)" is kept, last
    const cz = rows[0];
    expect(cz.costPerInstallCents).toBe(300);
    expect(cz.costPerTrialCents).toBe(1_500);
    expect(cz.cacCents).toBe(6_000);
    expect(cz.paybackMonths).toBe(4);
    const us = rows[1];
    expect(us.costPerInstallCents).toBe(800);
    expect(us.cacCents).toBeNull();
    expect(us.paybackMonths).toBeNull();
    expect(total.spendCents).toBe(20_000);
    expect(total.installs).toBe(550);
    expect(total.cacCents).toBe(10_000);
    expect(total.spendCents).toBe(20_000); // the (not set) ad row had no cost
  });
  it("keeps spend GA4 files under (not set) as an unattributed row instead of dropping it", () => {
    const { rows, total } = summarizeCampaigns([{ campaign: "(not set)", clicks: 90, impressions: 1000, costCents: 4_500 }], [{ campaign: "(not set)", event: "first_open", users: 30 }], { monthlyRevenuePerPayingCents: null });
    expect(rows).toHaveLength(1);
    expect(rows[0].campaign).toBe(UNATTRIBUTED_CAMPAIGN);
    expect(rows[0].costPerInstallCents).toBe(150);
    expect(total.spendCents).toBe(4_500);
  });
  it("leaves every cost unknown when no spend was reported, instead of claiming $0", () => {
    const { rows, total } = summarizeCampaigns([], [{ campaign: "(not set)", event: "first_open", users: 34 }, { campaign: "(not set)", event: "purchase", users: 1 }], { monthlyRevenuePerPayingCents: 2_349 });
    expect(rows).toHaveLength(1);
    expect(rows[0].installs).toBe(34);
    expect(rows[0].paid).toBe(1);
    expect(rows[0].spendCents).toBe(0);
    expect(rows[0].costPerInstallCents).toBeNull();
    expect(rows[0].cacCents).toBeNull();
    expect(rows[0].paybackMonths).toBeNull();
    expect(total.cacCents).toBeNull();
  });
  it("has no payback without a known price", () => {
    const { rows } = summarizeCampaigns([{ campaign: "A", clicks: 1, impressions: 1, costCents: 100 }], [{ campaign: "A", event: "purchase", users: 1 }], { monthlyRevenuePerPayingCents: null });
    expect(rows[0].cacCents).toBe(100);
    expect(rows[0].paybackMonths).toBeNull();
  });
});

describe("GA4 campaign reports", () => {
  it("parses ad rows (cost as decimal → cents) and event rows", () => {
    expect(campaignAdRowsFromReport({ rows: [{ dimensionValues: [{ value: "App CZ" }], metricValues: [{ value: "400" }, { value: "9000" }, { value: "120.5" }] }] })).toEqual([{ campaign: "App CZ", clicks: 400, impressions: 9000, costCents: 12_050 }]);
    expect(campaignEventRowsFromReport({ rows: [{ dimensionValues: [{ value: "App CZ" }, { value: "first_open" }], metricValues: [{ value: "40" }] }] })).toEqual([{ campaign: "App CZ", event: "first_open", users: 40 }]);
    expect(campaignAdRowsFromReport({})).toEqual([]);
  });
});

describe("pickAdRows", () => {
  const row = (campaign: string, costCents: number, clicks = 0) => ({ campaign, clicks, impressions: 0, costCents });

  it("prefers the session-scoped attempt when it carries cost", () => {
    const got = pickAdRows([
      { scope: "session", rows: [row("App CZ", 12_000, 400)] },
      { scope: "firstUser", rows: [row("(not set)", 0)] },
    ]);
    expect(got.scope).toBe("session");
    expect(got.ads[0].campaign).toBe("App CZ");
  });

  it("skips a zero-cost attempt — GA4 answers a wrong-scope request with blanks and a 200", () => {
    const got = pickAdRows([
      { scope: "session", rows: [row("(not set)", 0)] },
      { scope: "firstUser", rows: [row("App CZ", 9_900, 120)] },
    ]);
    expect(got.scope).toBe("firstUser");
    expect(got.ads[0].costCents).toBe(9_900);
  });

  it("keeps unattributed spend the dimension did report, and the summariser gives it a real cost per install", () => {
    const got = pickAdRows([{ scope: "session", rows: [row("(not set)", 45_000, 900)] }]);
    expect(got.scope).toBe("session");
    const { rows } = summarizeCampaigns(got.ads, [{ campaign: "(not set)", event: "first_open", users: 30 }], { monthlyRevenuePerPayingCents: null });
    expect(rows[0].campaign).toBe(UNATTRIBUTED_CAMPAIGN);
    expect(rows[0].costPerInstallCents).toBe(1_500);
  });

  it("reports no spend when no dimension has any", () => {
    const got = pickAdRows([{ scope: "session", rows: [row("(not set)", 0)] }]);
    expect(got.scope).toBe("total");
    expect(got.ads).toEqual([row("(not set)", 0)]);
  });
});

describe("manual spend", () => {
  const at = new Date("2026-09-12T00:00:00Z");

  it("fills spend GA4 never reported, and gives the funnel a real CAC", () => {
    const { rows, total } = summarizeCampaigns([], [{ campaign: "(not set)", event: "first_open", users: 34 }, { campaign: "(not set)", event: "purchase", users: 2 }], {
      monthlyRevenuePerPayingCents: 2_349,
      manualSpend: [{ campaign: "", amountCents: 45_000, updatedAt: at }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].campaign).toBe(UNATTRIBUTED_CAMPAIGN);
    expect(rows[0].spendSource).toBe("manual");
    expect(rows[0].costPerInstallCents).toBe(1_324);
    expect(rows[0].cacCents).toBe(22_500);
    expect(rows[0].paybackMonths).toBe(9.6);
    expect(total.spendCents).toBe(45_000);
  });

  it("never overrides a campaign GA4 does report, and adds its own named rows", () => {
    const { rows } = summarizeCampaigns(
      [{ campaign: "App CZ", clicks: 400, impressions: 0, costCents: 12_000 }],
      [{ campaign: "App CZ", event: "first_open", users: 40 }],
      { monthlyRevenuePerPayingCents: null, manualSpend: [{ campaign: "App CZ", amountCents: 99_900, updatedAt: at }, { campaign: "App US", amountCents: 8_000, updatedAt: at }] },
    );
    const cz = rows.find((r) => r.campaign === "App CZ")!;
    const us = rows.find((r) => r.campaign === "App US")!;
    expect(cz.spendCents).toBe(12_000);
    expect(cz.spendSource).toBe("ga4");
    expect(us.spendCents).toBe(8_000);
    expect(us.spendSource).toBe("manual");
  });

  it("ignores a zero or unparseable amount", () => {
    const { total } = summarizeCampaigns([], [{ campaign: "(not set)", event: "first_open", users: 5 }], { monthlyRevenuePerPayingCents: null, manualSpend: [{ campaign: "", amountCents: 0, updatedAt: at }] });
    expect(total.spendCents).toBe(0);
    expect(total.cacCents).toBeNull();
  });
});

describe("parseAmount", () => {
  it("reads what a founder is likely to type", () => {
    expect(parseAmount("450")).toBe(45_000);
    expect(parseAmount("450.50")).toBe(45_050);
    expect(parseAmount("$1,299.99")).toBe(129_999);
    expect(parseAmount("1,5")).toBe(150); // comma as a decimal separator
    expect(parseAmount("1.299,99")).toBe(129_999); // European grouping
    expect(parseAmount("12,500")).toBe(1_250_000); // three trailing digits group thousands
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("-5")).toBeNull();
  });
});

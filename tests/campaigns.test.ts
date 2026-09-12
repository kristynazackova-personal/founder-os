import { describe, expect, it } from "vitest";
import { summarizeCampaigns } from "@/lib/domain/campaigns";
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
    expect(rows.map((r) => r.campaign)).toEqual(["App CZ", "App US"]);
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
    expect(total.installs).toBe(50);
    expect(total.cacCents).toBe(10_000);
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

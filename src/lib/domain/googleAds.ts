/**
 * Google Ads: the authoritative record of what was spent. GA4 only shows ad
 * cost when its Google Ads link actually delivers it, which it does not for
 * app campaigns, so this is the source that always has the number.
 *
 * Pure: the GAQL query, the customer id rules, and the response shape.
 */
import type { CampaignAdRow } from "./campaigns";

/** Cost arrives in micros of the account currency: 1,000,000 micros = one unit. */
export function microsToCents(micros: number | string | null | undefined): number {
  const n = typeof micros === "string" ? Number(micros) : (micros ?? 0);
  return Number.isFinite(n) ? Math.round(n / 10_000) : 0;
}

/** Customer ids are ten digits; founders copy them with dashes ("123-456-7890") or spaces. */
export function normalizeCustomerId(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  return digits.length === 10 ? digits : null;
}

export function gaqlDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Spend per campaign over a window. `campaign` rows carry the metrics
 * segmented by nothing else, so one row per campaign is returned. Campaigns
 * with no activity in the window are omitted by the API itself.
 */
export function campaignSpendQuery(from: Date, to: Date): string {
  return [
    "SELECT campaign.id, campaign.name, metrics.clicks, metrics.impressions, metrics.cost_micros",
    "FROM campaign",
    `WHERE segments.date BETWEEN '${gaqlDate(from)}' AND '${gaqlDate(to)}'`,
    "ORDER BY metrics.cost_micros DESC",
  ].join(" ");
}

export type GoogleAdsRow = {
  campaign?: { id?: string; name?: string };
  metrics?: { clicks?: string | number; impressions?: string | number; costMicros?: string | number };
};

const int = (v: string | number | null | undefined): number => {
  const n = typeof v === "string" ? Number(v) : (v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** One CampaignAdRow per campaign, summed in case the API splits a campaign across rows. */
export function adRowsFromGoogleAds(rows: GoogleAdsRow[]): CampaignAdRow[] {
  const byCampaign = new Map<string, CampaignAdRow>();
  for (const r of rows) {
    const campaign = r.campaign?.name?.trim() || r.campaign?.id || "(unnamed campaign)";
    const row = byCampaign.get(campaign) ?? { campaign, clicks: 0, impressions: 0, costCents: 0 };
    row.clicks += int(r.metrics?.clicks);
    row.impressions += int(r.metrics?.impressions);
    row.costCents += microsToCents(r.metrics?.costMicros);
    byCampaign.set(campaign, row);
  }
  return [...byCampaign.values()].sort((a, b) => b.costCents - a.costCents);
}

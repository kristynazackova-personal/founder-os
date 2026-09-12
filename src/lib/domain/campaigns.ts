/**
 * Paid campaigns: ad spend from GA4's Google Ads link joined to the app
 * events GA4 attributes to the same first-touch campaign. Pure — the GA4
 * adapter parses reports into these rows, this file only does arithmetic.
 *
 * Cost is in the GA4 property's currency (Google reports it as a decimal);
 * we keep minor units and label it as the property's currency in the UI.
 */
export type CampaignAdRow = { campaign: string; clicks: number; impressions: number; costCents: number };
export type CampaignEventRow = { campaign: string; event: string; users: number };

export type CampaignSummary = {
  campaign: string;
  spendCents: number;
  clicks: number;
  installs: number;
  signups: number;
  trials: number;
  paid: number;
  /** spend ÷ installs, null without installs */
  costPerInstallCents: number | null;
  costPerTrialCents: number | null;
  /** spend ÷ paid — customer acquisition cost */
  cacCents: number | null;
  /** cac ÷ monthly revenue per paying customer, null when either is unknown */
  paybackMonths: number | null;
};

export const CAMPAIGN_FUNNEL_EVENTS = ["first_open", "sign_up", "trial_start", "purchase"] as const;

/** GA4's bucket for spend or users it can't tie to a named campaign at this scope — kept as one row, never dropped. */
export const UNATTRIBUTED_CAMPAIGN = "Unattributed (no campaign name)";

const UNSET = new Set(["", "(not set)", "(direct)", "(none)", "(organic)"]);
export function isUnsetCampaign(name: string | null | undefined): boolean {
  return UNSET.has((name ?? "").trim().toLowerCase());
}

function ratio(cents: number, n: number): number | null {
  return n > 0 ? Math.round(cents / n) : null;
}

/**
 * One row per campaign with spend, clicks or attributed events, plus one
 * "Unattributed" row for whatever GA4 reports under "(not set)" — App
 * campaign cost often lands there at first-touch scope, and organic
 * installs always do. Named campaigns first, then by spend.
 */
export function summarizeCampaigns(ads: CampaignAdRow[], events: CampaignEventRow[], opts: { monthlyRevenuePerPayingCents: number | null }): { rows: CampaignSummary[]; total: CampaignSummary } {
  const map = new Map<string, CampaignSummary>();
  const get = (campaign: string) => {
    let row = map.get(campaign);
    if (!row) {
      row = { campaign, spendCents: 0, clicks: 0, installs: 0, signups: 0, trials: 0, paid: 0, costPerInstallCents: null, costPerTrialCents: null, cacCents: null, paybackMonths: null };
      map.set(campaign, row);
    }
    return row;
  };
  const name = (campaign: string) => (isUnsetCampaign(campaign) ? UNATTRIBUTED_CAMPAIGN : campaign);
  for (const a of ads) {
    if (a.costCents === 0 && a.clicks === 0) continue;
    const row = get(name(a.campaign));
    row.spendCents += a.costCents;
    row.clicks += a.clicks;
  }
  for (const e of events) {
    if (e.users === 0) continue;
    const row = get(name(e.campaign));
    if (e.event === "first_open") row.installs += e.users;
    else if (e.event === "sign_up") row.signups += e.users;
    else if (e.event === "trial_start") row.trials += e.users;
    else if (e.event === "purchase") row.paid += e.users;
  }
  const finish = (row: CampaignSummary): CampaignSummary => {
    row.costPerInstallCents = ratio(row.spendCents, row.installs);
    row.costPerTrialCents = ratio(row.spendCents, row.trials);
    row.cacCents = ratio(row.spendCents, row.paid);
    const price = opts.monthlyRevenuePerPayingCents;
    row.paybackMonths = row.cacCents !== null && price && price > 0 ? Math.round((row.cacCents / price) * 10) / 10 : null;
    return row;
  };
  const rows = [...map.values()]
    .map(finish)
    .sort((a, b) => Number(a.campaign === UNATTRIBUTED_CAMPAIGN) - Number(b.campaign === UNATTRIBUTED_CAMPAIGN) || b.spendCents - a.spendCents || b.installs - a.installs);
  const total = finish(
    rows.reduce(
      (t, r) => ({ ...t, spendCents: t.spendCents + r.spendCents, clicks: t.clicks + r.clicks, installs: t.installs + r.installs, signups: t.signups + r.signups, trials: t.trials + r.trials, paid: t.paid + r.paid }),
      { campaign: "All campaigns", spendCents: 0, clicks: 0, installs: 0, signups: 0, trials: 0, paid: 0, costPerInstallCents: null, costPerTrialCents: null, cacCents: null, paybackMonths: null } as CampaignSummary,
    ),
  );
  return { rows, total };
}

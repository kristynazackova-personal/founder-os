import type { Stage } from "./stages";

/**
 * Peer bands. Until we have n >= 50 merchants in a stage cell we show
 * absolute benchmarks compiled from public indie-SaaS data (Indie Hackers,
 * Baremetrics open startups, Lovable Build Economy survey). Every band says
 * where it comes from.
 */
export const PEER_BAND_MIN_N = 50;

export type Band = { metric: string; low: string; median: string; high: string; note: string };

const STATIC_BANDS: Record<Stage, Band[]> = {
  0: [
    { metric: "Days from launch to first price", low: "3", median: "21", high: "60+", note: "Public indie launch data; most apps that never charge stall here." },
  ],
  1: [
    { metric: "Checkout view → purchase", low: "1%", median: "3%", high: "8%", note: "Self-serve SaaS, low-touch, public benchmarks." },
    { metric: "Days from checkout live to first payment", low: "2", median: "14", high: "45", note: "Indie SaaS public timelines." },
  ],
  2: [
    { metric: "Signup → paid, 30d", low: "2%", median: "5%", high: "12%", note: "Freemium / free-trial indie apps." },
    { metric: "MRR at 10 customers", low: "$90", median: "$250", high: "$600", note: "Depends on price point; median price ~$25/mo." },
  ],
  3: [
    { metric: "Monthly churn", low: "3%", median: "6%", high: "12%", note: "Early-stage B2C/prosumer SaaS; under 5% is good, over 8% needs fixing first." },
    { metric: "MoM MRR growth", low: "3%", median: "9%", high: "20%", note: "Indie SaaS under $5K MRR." },
  ],
};

export type PeerCell = { stage: Stage; n: number; churnMedian: number | null; growthMedian: number | null };

export function bandsForStage(stage: Stage, cell?: PeerCell | null): { source: "peers" | "public"; n: number; bands: Band[] } {
  if (cell && cell.n >= PEER_BAND_MIN_N) {
    const bands: Band[] = [];
    if (cell.churnMedian !== null) bands.push({ metric: "Monthly churn (peers)", low: "", median: `${(cell.churnMedian * 100).toFixed(1)}%`, high: "", note: `${cell.n} apps at this stage on Founder OS.` });
    if (cell.growthMedian !== null) bands.push({ metric: "MoM MRR growth (peers)", low: "", median: `${(cell.growthMedian * 100).toFixed(0)}%`, high: "", note: `${cell.n} apps at this stage on Founder OS.` });
    if (bands.length) return { source: "peers", n: cell.n, bands };
  }
  return { source: "public", n: cell?.n ?? 0, bands: STATIC_BANDS[stage] };
}

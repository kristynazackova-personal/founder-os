import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { bandsForStage, type PeerCell } from "../domain/benchmarks";
import type { Stage } from "../domain/stages";
import type { Metrics } from "../domain/metrics";

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Latest assessment per app in a stage cell, excluding low-confidence placements. */
export async function peerCell(stage: Stage): Promise<PeerCell> {
  const db = await getDb();
  const rows = (await db.execute(sql`
    select distinct on (app_id) app_id, stage, confidence, metrics
    from assessments
    order by app_id, computed_at desc
  `)) as unknown as { rows?: Array<{ stage: number; confidence: string; metrics: Metrics }> } | Array<{ stage: number; confidence: string; metrics: Metrics }>;
  const list = Array.isArray(rows) ? rows : (rows.rows ?? []);
  const cell = list.filter((r) => r.stage === stage && r.confidence !== "low");
  const churn = cell.map((r) => r.metrics.churn30d).filter((v): v is number => typeof v === "number");
  const growth = cell.map((r) => r.metrics.momGrowth).filter((v): v is number => typeof v === "number");
  return { stage, n: cell.length, churnMedian: median(churn), growthMedian: median(growth) };
}

export async function bandsFor(stage: Stage) {
  try {
    return bandsForStage(stage, await peerCell(stage));
  } catch {
    return bandsForStage(stage, null);
  }
}

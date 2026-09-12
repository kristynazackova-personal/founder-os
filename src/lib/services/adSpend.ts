import { and, eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import type { AdSpend, App } from "../db/schema";
import type { ManualSpend } from "../domain/campaigns";

/** ALL-CAMPAIGNS row: one figure covering every campaign, stored under the empty name. */
export const ALL_CAMPAIGNS = "";

export async function listAdSpend(appId: string): Promise<AdSpend[]> {
  const db = await getDb();
  return db.select().from(schema.adSpend).where(eq(schema.adSpend.appId, appId));
}

export function toManualSpend(rows: AdSpend[]): ManualSpend[] {
  return rows.map((r) => ({ campaign: r.campaign, amountCents: r.amountCents, updatedAt: r.updatedAt }));
}

/** Upsert one campaign's spend. An amount of zero removes the row, so clearing the box is how you delete it. */
export async function saveAdSpend(app: App, campaign: string, amountCents: number | null): Promise<void> {
  const db = await getDb();
  const name = campaign.trim().slice(0, 200);
  if (amountCents === null || amountCents <= 0) {
    await db.delete(schema.adSpend).where(and(eq(schema.adSpend.appId, app.id), eq(schema.adSpend.campaign, name)));
    return;
  }
  await db
    .insert(schema.adSpend)
    .values({ appId: app.id, campaign: name, amountCents })
    .onConflictDoUpdate({ target: [schema.adSpend.appId, schema.adSpend.campaign], set: { amountCents, updatedAt: new Date() } });
}

/**
 * An amount as a founder actually types it → minor units. Handles both
 * separator conventions: "1,299.99" and "1.299,99" both mean the same
 * money, and a lone comma with two digits after it ("1,5") is a decimal.
 * Returns null for anything that isn't a non-negative number.
 */
export function parseAmount(raw: string): number | null {
  if (raw.includes("-")) return null; // spend is never negative; a minus is a typo, not a value to strip
  const cleaned = raw.replace(/[^0-9.,]/g, "");
  if (!cleaned) return null;
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  let normalised: string;
  if (lastComma >= 0 && lastDot >= 0) {
    // Whichever separator comes last is the decimal point; the other groups thousands.
    normalised = lastComma > lastDot ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned.replace(/,/g, "");
  } else if (lastComma >= 0) {
    const decimals = cleaned.length - lastComma - 1;
    // One comma with one or two trailing digits is a decimal comma; anything else groups thousands.
    normalised = cleaned.indexOf(",") === lastComma && decimals > 0 && decimals <= 2 ? cleaned.replace(",", ".") : cleaned.replace(/,/g, "");
  } else {
    normalised = cleaned;
  }
  const n = Number(normalised);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

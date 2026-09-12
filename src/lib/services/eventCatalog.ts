import { and, eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import type { App } from "../db/schema";
import { decryptJson } from "../crypto";
import { EVENT_SETTINGS_KEY, parseEventSettings, type EventSettings } from "../domain/eventSettings";
import { listGa4Events } from "../sources/ga4";
import { probeMixpanel } from "../sources/mixpanel";
import type { Ga4Credentials, MixpanelCredentials, SourceType } from "../sources";

/** Sources with an event vocabulary the founder can pick from. Postgres is a table mapping, not events. */
export const EVENT_SOURCE_TYPES: SourceType[] = ["ga4", "mixpanel"];
export function isEventSource(type: string): type is "ga4" | "mixpanel" {
  return EVENT_SOURCE_TYPES.includes(type as SourceType);
}

export type CatalogEvent = { name: string; count: number | null };

/** Every event the source has ever collected (GA4: all-time counts; Mixpanel: names only). Throws on a read error. */
export async function listSourceEvents(app: App, type: "ga4" | "mixpanel"): Promise<CatalogEvent[]> {
  const db = await getDb();
  const [row] = await db.select().from(schema.revenueSources).where(and(eq(schema.revenueSources.appId, app.id), eq(schema.revenueSources.type, type))).limit(1);
  if (!row) return [];
  if (type === "ga4") return listGa4Events(decryptJson(row.credentialsEnc) as Ga4Credentials);
  const res = await probeMixpanel(decryptJson(row.credentialsEnc) as MixpanelCredentials);
  if (!res.ok) throw new Error(res.error);
  return res.events.map((name) => ({ name, count: null }));
}

export async function getEventSettings(appId: string, type: SourceType): Promise<EventSettings | null> {
  const db = await getDb();
  const [row] = await db.select({ meta: schema.revenueSources.meta }).from(schema.revenueSources).where(and(eq(schema.revenueSources.appId, appId), eq(schema.revenueSources.type, type))).limit(1);
  return row ? parseEventSettings(row.meta) : null;
}

/** Merge the settings into the row's meta (other keys untouched). */
export async function saveEventSettings(appId: string, type: SourceType, settings: EventSettings): Promise<void> {
  const db = await getDb();
  const [row] = await db.select({ id: schema.revenueSources.id, meta: schema.revenueSources.meta }).from(schema.revenueSources).where(and(eq(schema.revenueSources.appId, appId), eq(schema.revenueSources.type, type))).limit(1);
  if (!row) return;
  await db.update(schema.revenueSources).set({ meta: { ...(row.meta ?? {}), [EVENT_SETTINGS_KEY]: settings } }).where(eq(schema.revenueSources.id, row.id));
}

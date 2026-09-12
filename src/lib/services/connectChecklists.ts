import { and, eq } from "drizzle-orm";
import { getDb, schema } from "../db";

export async function getChecklist(appId: string, source: string): Promise<string[]> {
  const db = await getDb();
  const [row] = await db.select({ done: schema.connectChecklists.done }).from(schema.connectChecklists).where(and(eq(schema.connectChecklists.appId, appId), eq(schema.connectChecklists.source, source))).limit(1);
  return row?.done ?? [];
}

export async function setChecklistStep(appId: string, source: string, step: string, done: boolean): Promise<string[]> {
  const db = await getDb();
  const current = await getChecklist(appId, source);
  const next = done ? [...new Set([...current, step])] : current.filter((s) => s !== step);
  await db
    .insert(schema.connectChecklists)
    .values({ appId, source, done: next })
    .onConflictDoUpdate({ target: [schema.connectChecklists.appId, schema.connectChecklists.source], set: { done: next, updatedAt: new Date() } });
  return next;
}

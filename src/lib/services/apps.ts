import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import type { App } from "../db/schema";
import { shortId } from "../crypto";
import { track } from "../track";

export const PLATFORMS = ["lovable", "bolt", "replit", "base44", "other"] as const;
export type Platform = (typeof PLATFORMS)[number];
export const PLATFORM_LABEL: Record<Platform, string> = { lovable: "Lovable", bolt: "Bolt", replit: "Replit", base44: "Base44", other: "Other" };

export async function createApp(userId: string, input: { name: string; url: string | null; platform: Platform; projectLink: string | null; launchedAt: Date | null }): Promise<App> {
  const db = await getDb();
  const [app] = await db
    .insert(schema.apps)
    .values({ userId, name: input.name, url: input.url, platform: input.platform, projectLink: input.projectLink, launchedAt: input.launchedAt, siteKey: `fos_${shortId(14)}` })
    .returning();
  await track("app_connected", { userId, appId: app.id, props: { platform: input.platform, hasUrl: Boolean(input.url) } });
  return app;
}

export async function listApps(userId: string): Promise<App[]> {
  const db = await getDb();
  return db.select().from(schema.apps).where(eq(schema.apps.userId, userId)).orderBy(desc(schema.apps.createdAt));
}

export async function getAppForUser(appId: string, userId: string): Promise<App | null> {
  if (!/^[0-9a-f-]{36}$/i.test(appId)) return null;
  const db = await getDb();
  const [app] = await db.select().from(schema.apps).where(and(eq(schema.apps.id, appId), eq(schema.apps.userId, userId))).limit(1);
  return app ?? null;
}

export async function getAppById(appId: string): Promise<App | null> {
  const db = await getDb();
  const [app] = await db.select().from(schema.apps).where(eq(schema.apps.id, appId)).limit(1);
  return app ?? null;
}

export async function getAppBySiteKey(siteKey: string): Promise<App | null> {
  const db = await getDb();
  const [app] = await db.select().from(schema.apps).where(eq(schema.apps.siteKey, siteKey)).limit(1);
  return app ?? null;
}

export async function updateApp(appId: string, patch: Partial<Pick<App, "name" | "url" | "platform" | "projectLink" | "launchedAt" | "activationEvent" | "checkoutMode" | "lastStage" | "lastConfidence" | "snippetInstalledAt" | "firstPurchaseAt">>): Promise<void> {
  const db = await getDb();
  await db.update(schema.apps).set(patch).where(eq(schema.apps.id, appId));
}

import { and, eq } from "drizzle-orm";
import { getDb, schema } from "../db";

/** Fields a draft may keep, per source. Everything else (keys, secrets, passwords) is dropped. */
export const DRAFT_FIELDS: Record<string, string[]> = {
  stripe: [],
  lemonsqueezy: ["storeId"],
  paddle: [],
  ga4: ["propertyId"],
  appstore: ["issuerId", "keyId", "vendorNumber"],
  mixpanel: ["projectId", "region", "serviceUser", "signupEvent", "activationEvent", "visitorEvent"],
  postgres: ["connectionString", "usersTable", "usersCreatedAt", "subsTable", "subsCustomer", "subsStartedAt", "subsEndedAt", "subsPlan", "priceMap"],
};

/** Strip the password from a connection string so the draft keeps host, user and database only. */
export function redactConnectionString(value: string): string {
  try {
    const u = new URL(value.trim());
    if (!/^postgres(ql)?:$/.test(u.protocol)) return "";
    u.password = "";
    return u.toString();
  } catch {
    return "";
  }
}

export function sanitizeDraft(source: string, raw: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of DRAFT_FIELDS[source] ?? []) {
    const v = (raw[key] ?? "").trim().slice(0, 300);
    if (!v) continue;
    out[key] = key === "connectionString" ? redactConnectionString(v) : v;
    if (!out[key]) delete out[key];
  }
  return out;
}

async function row(appId: string, source: string) {
  const db = await getDb();
  const [r] = await db.select().from(schema.connectChecklists).where(and(eq(schema.connectChecklists.appId, appId), eq(schema.connectChecklists.source, source))).limit(1);
  return r ?? null;
}

export async function getChecklist(appId: string, source: string): Promise<string[]> {
  return (await row(appId, source))?.done ?? [];
}

export async function getDraft(appId: string, source: string): Promise<Record<string, string>> {
  return (await row(appId, source))?.draft ?? {};
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

export async function saveDraft(appId: string, source: string, raw: Record<string, string>): Promise<Record<string, string>> {
  const db = await getDb();
  const draft = sanitizeDraft(source, raw);
  await db
    .insert(schema.connectChecklists)
    .values({ appId, source, draft })
    .onConflictDoUpdate({ target: [schema.connectChecklists.appId, schema.connectChecklists.source], set: { draft, updatedAt: new Date() } });
  return draft;
}

export async function clearDraft(appId: string, source: string): Promise<void> {
  const db = await getDb();
  await db.update(schema.connectChecklists).set({ draft: {}, updatedAt: new Date() }).where(and(eq(schema.connectChecklists.appId, appId), eq(schema.connectChecklists.source, source)));
}

import { and, eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import { decryptJson, encryptJson } from "../crypto";

/** Non-secret fields a draft keeps in the clear, per source. */
export const DRAFT_FIELDS: Record<string, string[]> = {
  stripe: [],
  lemonsqueezy: ["storeId"],
  paddle: [],
  ga4: ["propertyId"],
  appstore: ["issuerId", "keyId", "vendorNumber"],
  mixpanel: ["projectId", "region", "serviceUser", "signupEvent", "activationEvent", "visitorEvent"],
  postgres: ["connectionString", "usersTable", "usersCreatedAt", "subsTable", "subsCustomer", "subsStartedAt", "subsEndedAt", "subsPlan", "priceMap"],
};

/** Secret fields a draft keeps encrypted. They are used when the founder finishes and never shown. */
export const SECRET_FIELDS: Record<string, string[]> = {
  stripe: ["apiKey"],
  lemonsqueezy: ["apiKey"],
  paddle: ["apiKey"],
  ga4: ["serviceAccountJson"],
  appstore: ["privateKey"],
  mixpanel: ["serviceSecret"],
  postgres: ["connectionString"],
};

/** Strip the password from a connection string so the clear draft keeps host, user and database only. */
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

export function pickSecrets(source: string, raw: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of SECRET_FIELDS[source] ?? []) {
    const v = (raw[key] ?? "").trim();
    if (!v) continue;
    // A connection string without a password is not a secret worth keeping.
    if (key === "connectionString") {
      try {
        if (!new URL(v).password) continue;
      } catch {
        continue;
      }
    }
    out[key] = v.slice(0, 20_000);
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

export type DraftView = { fields: Record<string, string>; secretsOnFile: string[] };

/** What the form may see: clear fields plus the NAMES of secrets on file (never their values). */
export async function getDraft(appId: string, source: string): Promise<DraftView> {
  const r = await row(appId, source);
  let secretsOnFile: string[] = [];
  if (r?.draftSecretsEnc) {
    try {
      secretsOnFile = Object.keys(decryptJson<Record<string, string>>(r.draftSecretsEnc));
    } catch {
      secretsOnFile = [];
    }
  }
  return { fields: r?.draft ?? {}, secretsOnFile };
}

/** Server-side only: the decrypted secrets, to complete a connect when the founder left the field blank. */
export async function getDraftSecrets(appId: string, source: string): Promise<Record<string, string>> {
  const r = await row(appId, source);
  if (!r?.draftSecretsEnc) return {};
  try {
    return decryptJson<Record<string, string>>(r.draftSecretsEnc);
  } catch {
    return {};
  }
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

/** Save a draft. Secrets left blank keep whatever was on file; secrets provided replace it. */
export async function saveDraft(appId: string, source: string, raw: Record<string, string>): Promise<DraftView> {
  const db = await getDb();
  const draft = sanitizeDraft(source, raw);
  const existing = await getDraftSecrets(appId, source);
  const secrets = { ...existing, ...pickSecrets(source, raw) };
  const draftSecretsEnc = Object.keys(secrets).length ? encryptJson(secrets) : null;
  await db
    .insert(schema.connectChecklists)
    .values({ appId, source, draft, draftSecretsEnc })
    .onConflictDoUpdate({ target: [schema.connectChecklists.appId, schema.connectChecklists.source], set: { draft, draftSecretsEnc, updatedAt: new Date() } });
  return { fields: draft, secretsOnFile: Object.keys(secrets) };
}

export async function clearDraft(appId: string, source: string): Promise<void> {
  const db = await getDb();
  await db.update(schema.connectChecklists).set({ draft: {}, draftSecretsEnc: null, updatedAt: new Date() }).where(and(eq(schema.connectChecklists.appId, appId), eq(schema.connectChecklists.source, source)));
}

/** Fill blank secret fields of a submission from the draft on file. */
export async function withDraftSecrets(appId: string, source: string, formData: FormData): Promise<Record<string, string>> {
  const raw: Record<string, string> = {};
  for (const [k, v] of formData.entries()) if (typeof v === "string") raw[k] = v;
  const onFile = await getDraftSecrets(appId, source);
  for (const key of SECRET_FIELDS[source] ?? []) {
    const typed = (raw[key] ?? "").trim();
    if (!typed && onFile[key]) raw[key] = onFile[key];
    // A connection string typed without a password falls back to the full one on file.
    if (key === "connectionString" && typed && onFile[key]) {
      try {
        if (!new URL(typed).password && redactConnectionString(onFile[key]) === redactConnectionString(typed)) raw[key] = onFile[key];
      } catch {
        /* keep typed */
      }
    }
  }
  return raw;
}

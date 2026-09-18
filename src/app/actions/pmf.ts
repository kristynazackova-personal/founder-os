"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { getAppForUser } from "@/lib/services/apps";
import { PMF_FIELDS, type PmfFieldKey } from "@/lib/domain/pmfDoc";
import { generateDoc, rewriteDoc, saveEdit } from "@/lib/services/pmfDocs";

export type PmfFormState = { error?: string; ok?: string } | undefined;

/**
 * Every action revalidates the page. Without it the new version is written
 * and the founder is shown the old one, which is exactly the bug the connect
 * checklist had.
 */
function done(appId: string): void {
  revalidatePath(`/app/${appId}/pmf`);
}

// The second argument is React's previous form state, which this action does
// not read: the signature comes from useActionState, not from us.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function generatePmfAction(appId: string, _prev: PmfFormState): Promise<PmfFormState> {
  const user = await requireUser();
  const app = await getAppForUser(appId, user.id);
  if (!app) return { error: "App not found." };
  try {
    const doc = await generateDoc(app, { awaitModel: true });
    done(app.id);
    return { ok: `Version ${doc.version} written.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not fill the framework." };
  }
}

export async function savePmfAction(appId: string, _prev: PmfFormState, formData: FormData): Promise<PmfFormState> {
  const user = await requireUser();
  const app = await getAppForUser(appId, user.id);
  if (!app) return { error: "App not found." };
  const values: Partial<Record<PmfFieldKey, string>> = {};
  for (const field of PMF_FIELDS) {
    const raw = formData.get(field.key);
    if (typeof raw !== "string") continue;
    values[field.key] = raw.trim().slice(0, 2_000);
  }
  if (Object.keys(values).length === 0) return { error: "Nothing to save." };
  try {
    const doc = await saveEdit(app.id, values);
    done(app.id);
    return { ok: `Saved as version ${doc.version}.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save." };
  }
}

export async function rewritePmfAction(appId: string, _prev: PmfFormState, formData: FormData): Promise<PmfFormState> {
  const user = await requireUser();
  const app = await getAppForUser(appId, user.id);
  if (!app) return { error: "App not found." };
  const { doc, error } = await rewriteDoc(app, String(formData.get("comment") ?? ""));
  if (error || !doc) return { error: error ?? "Could not rewrite." };
  done(app.id);
  return { ok: `Rewritten as version ${doc.version}.` };
}

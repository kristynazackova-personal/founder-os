"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { getAppForUser } from "@/lib/services/apps";
import type { PmfFieldKey } from "@/lib/domain/pmfDoc";
import { asFrameworkId, frameworkOf } from "@/lib/domain/pmfFrameworks";
import { generateDoc, generateTable, rewriteDoc, saveEdit, saveTable } from "@/lib/services/pmfDocs";
import { rowsFromForm, readTable } from "@/lib/domain/pmfTable";

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
export async function generatePmfAction(appId: string, framework: string, _prev: PmfFormState): Promise<PmfFormState> {
  const user = await requireUser();
  const app = await getAppForUser(appId, user.id);
  if (!app) return { error: "App not found." };
  try {
    const doc = await generateDoc(app, asFrameworkId(framework), { awaitModel: true });
    done(app.id);
    return { ok: `Version ${doc.version} written.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not fill the framework." };
  }
}

export async function savePmfAction(appId: string, framework: string, _prev: PmfFormState, formData: FormData): Promise<PmfFormState> {
  const user = await requireUser();
  const app = await getAppForUser(appId, user.id);
  if (!app) return { error: "App not found." };
  const f = frameworkOf(framework);
  const values: Partial<Record<PmfFieldKey, string>> = {};
  for (const field of f.fields) {
    const raw = formData.get(field.key);
    if (typeof raw !== "string") continue;
    values[field.key] = raw.trim().slice(0, 2_000);
  }
  if (Object.keys(values).length === 0) return { error: "Nothing to save." };
  try {
    const doc = await saveEdit(app.id, f.id, values);
    done(app.id);
    return { ok: `Saved as version ${doc.version}.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save." };
  }
}

export async function rewritePmfAction(appId: string, framework: string, _prev: PmfFormState, formData: FormData): Promise<PmfFormState> {
  const user = await requireUser();
  const app = await getAppForUser(appId, user.id);
  if (!app) return { error: "App not found." };
  const { doc, error } = await rewriteDoc(app, asFrameworkId(framework), String(formData.get("comment") ?? ""));
  if (error || !doc) return { error: error ?? "Could not rewrite." };
  done(app.id);
  return { ok: `Rewritten as version ${doc.version}.` };
}

/** Derive this table's columns from the answers above it, then draft rows. */
// The second argument is React's previous form state, which this action does
// not read: the signature comes from useActionState, not from us.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function generateTableAction(appId: string, framework: string, field: string, _prev: PmfFormState): Promise<PmfFormState> {
  const user = await requireUser();
  const app = await getAppForUser(appId, user.id);
  if (!app) return { error: "App not found." };
  const { table, error } = await generateTable(app, asFrameworkId(framework), field);
  if (error || !table) return { error: error ?? "Could not build the table." };
  done(app.id);
  return { ok: `${table.columns.length} columns and ${table.rows.length} suggested rows.` };
}

/**
 * Save edited rows. The columns are NOT taken from the form - they come from
 * the stored table, so a row can never be saved against a column set the
 * founder was not looking at.
 */
export async function saveTableAction(appId: string, framework: string, field: string, _prev: PmfFormState, formData: FormData): Promise<PmfFormState> {
  const user = await requireUser();
  const app = await getAppForUser(appId, user.id);
  if (!app) return { error: "App not found." };
  const stored = readTable(String(formData.get("__columns") ?? ""));
  const rows = rowsFromForm(stored.columns, formData.entries());
  try {
    const table = await saveTable(app, asFrameworkId(framework), field, rows);
    done(app.id);
    return { ok: `Saved ${table.rows.length} row${table.rows.length === 1 ? "" : "s"}.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the table." };
  }
}

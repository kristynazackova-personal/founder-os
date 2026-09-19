"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { getAppForUser, updateApp } from "@/lib/services/apps";
import { normalizeUrl, sameUrl } from "@/lib/domain/url";
import type { PmfFieldKey } from "@/lib/domain/pmfDoc";
import { asFrameworkId, frameworkOf } from "@/lib/domain/pmfFrameworks";
import { chooseSegmentation, generateDoc, generateRows, generateTable, prefillGoalStage, proposeSegmentations, rewriteDoc, saveEdit, saveTable } from "@/lib/services/pmfDocs";
import { parseSegmentations, type SegmentationOption } from "@/lib/domain/pmfSegmentations";
import { rowsFromForm, readTable } from "@/lib/domain/pmfTable";

export type PmfFormState = { error?: string; ok?: string } | undefined;

/** Carries the alternatives back to the client, which is where they live. */
export type SegmentationsState = { error?: string; options?: SegmentationOption[] } | undefined;

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
  if (!table) return { error: error ?? "Could not build the table." };
  done(app.id);
  // The columns are kept even when the row call fails, so this reports both.
  if (error) return { error: `${table.columns.length} columns, but no rows: ${error}` };
  return { ok: `${table.columns.length} columns and ${table.rows.length} suggested rows.` };
}

/** Draft rows against the columns already stored, without re-deriving them. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function generateRowsAction(appId: string, framework: string, field: string, _prev: PmfFormState): Promise<PmfFormState> {
  const user = await requireUser();
  const app = await getAppForUser(appId, user.id);
  if (!app) return { error: "App not found." };
  const { table, error } = await generateRows(app, asFrameworkId(framework), field);
  if (error || !table) return { error: error ?? "Could not suggest rows." };
  done(app.id);
  return { ok: `${table.rows.length} suggested rows.` };
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

/**
 * Prefill stage 1 from the founder's website and/or an uploaded business case.
 *
 * Separate from every other generator on purpose: it is the only one allowed
 * to answer rather than ask, and it writes stage 1 and nothing else.
 */
export async function prefillPmfAction(appId: string, framework: string, _prev: PmfFormState, formData: FormData): Promise<PmfFormState> {
  const user = await requireUser();
  const app = await getAppForUser(appId, user.id);
  if (!app) return { error: "App not found." };

  const raw = formData.get("document");
  const file = raw instanceof File && raw.size > 0 ? raw : null;
  const useWebsite = formData.get("use_website") === "on";
  const typed = String(formData.get("website_url") ?? "").trim();
  const websiteUrl = useWebsite ? normalizeUrl(typed) : null;

  if (useWebsite && typed && !websiteUrl) return { error: `"${typed}" is not a web address I can read.` };
  if (!websiteUrl && !file) return { error: "Give a website address, choose a document, or both." };

  try {
    const res = await prefillGoalStage(app, asFrameworkId(framework), { websiteUrl, file });

    // Changing the address here only changes THIS run, unless they ask for it
    // to stick. Quietly rewriting a business setting from a side panel is how
    // a founder loses a URL they did not know they were editing.
    let saved = "";
    if (websiteUrl && formData.get("save_url") === "on" && !sameUrl(websiteUrl, app.url)) {
      await updateApp(app.id, { url: websiteUrl });
      revalidatePath(`/app/${appId}`, "layout");
      saved = ` Saved ${websiteUrl} as this business's website.`;
    }
    done(appId);
    if (res.error && res.filled.length === 0 && res.asked.length === 0) return { error: res.error };
    const wrote = res.filled.length > 0 ? `Filled ${res.filled.length} field${res.filled.length === 1 ? "" : "s"} from ${res.sources}.` : `Read ${res.sources}.`;
    const asked = res.asked.length > 0 ? ` It could not tell ${res.asked.join(", ")} from that, so it asked instead.` : "";
    // A partial failure is still worth reporting: one source may have worked
    // and the other not, and the founder should know which they are reading.
    const note = res.error ? ` ${res.error}` : "";
    return { ok: `${wrote}${asked}${note}${saved} Edit anything that is wrong, then save.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Prefill failed." };
  }
}

/**
 * Propose several whole ways to split the market. Writes nothing - the
 * alternatives come back to the page and only the chosen one is stored.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function proposeSegmentationsAction(appId: string, framework: string, field: string, _prev: SegmentationsState): Promise<SegmentationsState> {
  const user = await requireUser();
  const app = await getAppForUser(appId, user.id);
  if (!app) return { error: "App not found." };
  const { options, error } = await proposeSegmentations(app, asFrameworkId(framework), field);
  if (error || options.length === 0) return { error: error ?? "Could not propose segmentations." };
  return { options };
}

/**
 * Adopt one of them as the table.
 *
 * The option travels back through the form rather than being held server
 * side. It is the founder's own content either way, and it is re-parsed here
 * with the same tolerant parser that read it out of the model, so a mangled
 * payload is rejected rather than stored.
 */
export async function chooseSegmentationAction(appId: string, framework: string, field: string, _prev: PmfFormState, formData: FormData): Promise<PmfFormState> {
  const user = await requireUser();
  const app = await getAppForUser(appId, user.id);
  if (!app) return { error: "App not found." };

  let parsed: SegmentationOption[] = [];
  try {
    parsed = parseSegmentations(JSON.parse(String(formData.get("__segmentation") ?? "")));
  } catch {
    return { error: "That segmentation could not be read. Ask for them again." };
  }
  const option = parsed[0];
  if (!option) return { error: "That segmentation could not be read. Ask for them again." };

  const { table, error } = await chooseSegmentation(app, asFrameworkId(framework), field, option);
  if (error || !table) return { error: error ?? "Could not use that segmentation." };
  done(app.id);
  return { ok: `Using "${option.axis}" - ${table.rows.length} rows.` };
}

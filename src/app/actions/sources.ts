"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getAppForUser } from "@/lib/services/apps";
import { connectAppStore, connectGa4, connectLemonSqueezy, connectMixpanel, connectPaddle, connectPostgres, connectStripeKey, removeSource } from "@/lib/services/sources";
import { clearDraft, saveDraft, setChecklistStep, withDraftSecrets } from "@/lib/services/connectChecklists";
import { isEventSource, saveEventSettings } from "@/lib/services/eventCatalog";
import { eventSettingsFromForm } from "@/lib/domain/eventSettings";
import { runAssessment } from "@/lib/services/diagnosis";
import type { SourceType } from "@/lib/sources";
import { isSourceType } from "@/components/connect/guides";
import type { FormState } from "./apps";

/** A failed attempt still keeps the non-secret fields, so nothing typed so far is lost. */
async function keepDraft(appId: string, source: string, data: Record<string, string>): Promise<void> {
  await saveDraft(appId, source, data).catch(() => undefined);
}

async function afterConnect(appId: string, source?: string) {
  const user = await requireUser();
  const app = await getAppForUser(appId, user.id);
  if (app) await runAssessment(app).catch(() => undefined);
  if (app && source) await clearDraft(app.id, source).catch(() => undefined);
  revalidatePath(`/app/${appId}`, "layout");
}

export async function connectStripeKeyAction(appId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const app = await getAppForUser(appId, user.id);
  if (!app) return { error: "App not found." };
  const data = await withDraftSecrets(app.id, "stripe", formData);
  const res = await connectStripeKey(app, String(data["apiKey"] ?? ""));
  if (!res.ok) {
    await keepDraft(appId, "stripe", data);
    return { error: res.error };
  }
  await afterConnect(appId, "stripe");
  redirect(`/app/${appId}/connect/stripe?connected=1`);
}

export async function connectLemonSqueezyAction(appId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const app = await getAppForUser(appId, user.id);
  if (!app) return { error: "App not found." };
  const data = await withDraftSecrets(app.id, "lemonsqueezy", formData);
  const res = await connectLemonSqueezy(app, String(data["apiKey"] ?? ""), String(data["storeId"] ?? "") || null);
  if (!res.ok) {
    await keepDraft(appId, "lemonsqueezy", data);
    return { error: res.error };
  }
  await afterConnect(appId, "lemonsqueezy");
  redirect(`/app/${appId}/connect/lemonsqueezy?connected=1`);
}

export async function connectPaddleAction(appId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const app = await getAppForUser(appId, user.id);
  if (!app) return { error: "App not found." };
  const data = await withDraftSecrets(app.id, "paddle", formData);
  const res = await connectPaddle(app, String(data["apiKey"] ?? ""));
  if (!res.ok) {
    await keepDraft(appId, "paddle", data);
    return { error: res.error };
  }
  await afterConnect(appId, "paddle");
  redirect(`/app/${appId}/connect/paddle?connected=1`);
}

export async function connectGa4Action(appId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const app = await getAppForUser(appId, user.id);
  if (!app) return { error: "App not found." };
  const data = await withDraftSecrets(app.id, "ga4", formData);
  const res = await connectGa4(app, String(data["propertyId"] ?? ""), String(data["serviceAccountJson"] ?? ""));
  if (!res.ok) {
    await keepDraft(appId, "ga4", data);
    return { error: res.error };
  }
  await afterConnect(appId, "ga4");
  redirect(`/app/${appId}/connect/ga4/events?connected=1`);
}

const f = (data: Record<string, string>, k: string) => data[k] ?? "";

export async function connectAppStoreAction(appId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const app = await getAppForUser(appId, user.id);
  if (!app) return { error: "App not found." };
  const data = await withDraftSecrets(app.id, "appstore", formData);
  const res = await connectAppStore(app, { issuerId: f(data, "issuerId"), keyId: f(data, "keyId"), privateKey: f(data, "privateKey"), vendorNumber: f(data, "vendorNumber") });
  if (!res.ok) {
    await keepDraft(appId, "appstore", data);
    return { error: res.error };
  }
  await afterConnect(appId, "appstore");
  redirect(`/app/${appId}/connect/appstore?connected=1${res.found ? "" : "&empty=1"}`);
}

export async function connectMixpanelAction(appId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const app = await getAppForUser(appId, user.id);
  if (!app) return { error: "App not found." };
  const data = await withDraftSecrets(app.id, "mixpanel", formData);
  const res = await connectMixpanel(app, { projectId: f(data, "projectId"), serviceUser: f(data, "serviceUser"), serviceSecret: f(data, "serviceSecret"), region: f(data, "region"), signupEvent: f(data, "signupEvent"), activationEvent: f(data, "activationEvent"), visitorEvent: f(data, "visitorEvent") });
  if (!res.ok) {
    await keepDraft(appId, "mixpanel", data);
    return { error: res.error };
  }
  await afterConnect(appId, "mixpanel");
  redirect(`/app/${appId}/connect/mixpanel/events?connected=1`);
}

export async function connectPostgresAction(appId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const app = await getAppForUser(appId, user.id);
  if (!app) return { error: "App not found." };
  const data = await withDraftSecrets(app.id, "postgres", formData);
  const res = await connectPostgres(app, {
    connectionString: f(data, "connectionString"),
    usersTable: f(data, "usersTable"),
    usersCreatedAt: f(data, "usersCreatedAt"),
    subsTable: f(data, "subsTable"),
    subsCustomer: f(data, "subsCustomer"),
    subsStartedAt: f(data, "subsStartedAt"),
    subsEndedAt: f(data, "subsEndedAt"),
    subsPlan: f(data, "subsPlan"),
    priceMap: f(data, "priceMap"),
  });
  if (!res.ok) {
    await keepDraft(appId, "postgres", data);
    return { error: res.error };
  }
  await afterConnect(appId, "postgres");
  redirect(`/app/${appId}/connect/postgres?connected=1&signups=${res.signups30d}${res.subscriptions !== null ? `&subs=${res.subscriptions}` : ""}`);
}

export async function disconnectSourceAction(appId: string, type: SourceType): Promise<void> {
  const user = await requireUser();
  const app = await getAppForUser(appId, user.id);
  if (!app) return;
  await removeSource(app.id, type);
  await afterConnect(appId);
  redirect(`/app/${appId}/connect/${type}?disconnected=1`);
}

export async function toggleConnectStepAction(appId: string, source: string, step: string, done: boolean): Promise<void> {
  const user = await requireUser();
  const app = await getAppForUser(appId, user.id);
  if (!app || !isSourceType(source) || !/^[a-z-]{1,40}$/.test(step)) return;
  await setChecklistStep(app.id, source, step, done);
}

/** "Save for later": keeps the non-secret fields of a half-finished setup. */
export async function saveConnectDraftAction(appId: string, source: string, formData: FormData): Promise<void> {
  const user = await requireUser();
  const app = await getAppForUser(appId, user.id);
  if (!app || !isSourceType(source)) return;
  const raw: Record<string, string> = {};
  for (const [k, v] of formData.entries()) if (typeof v === "string") raw[k] = v;
  await saveDraft(app.id, source, raw);
  redirect(`/app/${appId}/connect/${source}?draft=1`);
}

/** Which events the source may read, and from when. Editable any time from the connection's settings. */
export async function saveEventSettingsAction(appId: string, source: string, formData: FormData): Promise<void> {
  const user = await requireUser();
  const app = await getAppForUser(appId, user.id);
  if (!app || !isEventSource(source)) return;
  const settings = eventSettingsFromForm({
    mode: formData.get("mode") === null ? null : String(formData.get("mode")),
    selected: formData.getAll("events").map(String),
    history: formData.get("history") === null ? null : String(formData.get("history")),
  });
  await saveEventSettings(app.id, source, settings);
  await runAssessment(app).catch(() => undefined);
  revalidatePath(`/app/${appId}`, "layout");
  redirect(`/app/${appId}/connect/${source}?events=saved`);
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getAppForUser } from "@/lib/services/apps";
import { connectAppStore, connectGa4, connectLemonSqueezy, connectMixpanel, connectPaddle, connectPostgres, connectStripeKey, removeSource } from "@/lib/services/sources";
import { clearDraft, saveDraft, setChecklistStep } from "@/lib/services/connectChecklists";
import { runAssessment } from "@/lib/services/diagnosis";
import type { SourceType } from "@/lib/sources";
import { isSourceType } from "@/components/connect/guides";
import type { FormState } from "./apps";

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
  const res = await connectStripeKey(app, String(formData.get("apiKey") ?? ""));
  if (!res.ok) return { error: res.error };
  await afterConnect(appId, "stripe");
  redirect(`/app/${appId}/connect/stripe?connected=1`);
}

export async function connectLemonSqueezyAction(appId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const app = await getAppForUser(appId, user.id);
  if (!app) return { error: "App not found." };
  const res = await connectLemonSqueezy(app, String(formData.get("apiKey") ?? ""), String(formData.get("storeId") ?? "") || null);
  if (!res.ok) return { error: res.error };
  await afterConnect(appId, "lemonsqueezy");
  redirect(`/app/${appId}/connect/lemonsqueezy?connected=1`);
}

export async function connectPaddleAction(appId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const app = await getAppForUser(appId, user.id);
  if (!app) return { error: "App not found." };
  const res = await connectPaddle(app, String(formData.get("apiKey") ?? ""));
  if (!res.ok) return { error: res.error };
  await afterConnect(appId, "paddle");
  redirect(`/app/${appId}/connect/paddle?connected=1`);
}

export async function connectGa4Action(appId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const app = await getAppForUser(appId, user.id);
  if (!app) return { error: "App not found." };
  const res = await connectGa4(app, String(formData.get("propertyId") ?? ""), String(formData.get("serviceAccountJson") ?? ""));
  if (!res.ok) return { error: res.error };
  await afterConnect(appId, "ga4");
  redirect(`/app/${appId}/connect/ga4?connected=1`);
}

const f = (formData: FormData, k: string) => String(formData.get(k) ?? "");

export async function connectAppStoreAction(appId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const app = await getAppForUser(appId, user.id);
  if (!app) return { error: "App not found." };
  const res = await connectAppStore(app, { issuerId: f(formData, "issuerId"), keyId: f(formData, "keyId"), privateKey: f(formData, "privateKey"), vendorNumber: f(formData, "vendorNumber") });
  if (!res.ok) return { error: res.error };
  await afterConnect(appId, "appstore");
  redirect(`/app/${appId}/connect/appstore?connected=1${res.found ? "" : "&empty=1"}`);
}

export async function connectMixpanelAction(appId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const app = await getAppForUser(appId, user.id);
  if (!app) return { error: "App not found." };
  const res = await connectMixpanel(app, { projectId: f(formData, "projectId"), serviceUser: f(formData, "serviceUser"), serviceSecret: f(formData, "serviceSecret"), region: f(formData, "region"), signupEvent: f(formData, "signupEvent"), activationEvent: f(formData, "activationEvent"), visitorEvent: f(formData, "visitorEvent") });
  if (!res.ok) return { error: res.error };
  await afterConnect(appId, "mixpanel");
  redirect(`/app/${appId}/connect/mixpanel?connected=1`);
}

export async function connectPostgresAction(appId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const app = await getAppForUser(appId, user.id);
  if (!app) return { error: "App not found." };
  const res = await connectPostgres(app, {
    connectionString: f(formData, "connectionString"),
    usersTable: f(formData, "usersTable"),
    usersCreatedAt: f(formData, "usersCreatedAt"),
    subsTable: f(formData, "subsTable"),
    subsCustomer: f(formData, "subsCustomer"),
    subsStartedAt: f(formData, "subsStartedAt"),
    subsEndedAt: f(formData, "subsEndedAt"),
    subsPlan: f(formData, "subsPlan"),
    priceMap: f(formData, "priceMap"),
  });
  if (!res.ok) return { error: res.error };
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

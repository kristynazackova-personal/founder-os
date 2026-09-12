"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getAppForUser } from "@/lib/services/apps";
import { connectGa4, connectLemonSqueezy, connectPaddle, removeSource } from "@/lib/services/sources";
import { runAssessment } from "@/lib/services/diagnosis";
import type { SourceType } from "@/lib/sources";
import type { FormState } from "./apps";

async function afterConnect(appId: string) {
  const user = await requireUser();
  const app = await getAppForUser(appId, user.id);
  if (app) await runAssessment(app).catch(() => undefined);
  revalidatePath(`/app/${appId}`, "layout");
}

export async function connectLemonSqueezyAction(appId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const app = await getAppForUser(appId, user.id);
  if (!app) return { error: "App not found." };
  const res = await connectLemonSqueezy(app, String(formData.get("apiKey") ?? ""), String(formData.get("storeId") ?? "") || null);
  if (!res.ok) return { error: res.error };
  await afterConnect(appId);
  redirect(`/app/${appId}/connect?connected=1`);
}

export async function connectPaddleAction(appId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const app = await getAppForUser(appId, user.id);
  if (!app) return { error: "App not found." };
  const res = await connectPaddle(app, String(formData.get("apiKey") ?? ""));
  if (!res.ok) return { error: res.error };
  await afterConnect(appId);
  redirect(`/app/${appId}/connect?connected=1`);
}

export async function connectGa4Action(appId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const app = await getAppForUser(appId, user.id);
  if (!app) return { error: "App not found." };
  const res = await connectGa4(app, String(formData.get("propertyId") ?? ""), String(formData.get("serviceAccountJson") ?? ""));
  if (!res.ok) return { error: res.error };
  await afterConnect(appId);
  redirect(`/app/${appId}/connect?connected=1`);
}

export async function disconnectSourceAction(appId: string, type: SourceType): Promise<void> {
  const user = await requireUser();
  const app = await getAppForUser(appId, user.id);
  if (!app) return;
  await removeSource(app.id, type);
  await afterConnect(appId);
}

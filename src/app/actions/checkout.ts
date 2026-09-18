"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { getAppForUser } from "@/lib/services/apps";
import { createPlansFromPricing, setCheckoutMode } from "@/lib/services/checkout";
import { getBillingState } from "@/lib/services/billing";
import type { FormState } from "./apps";

export async function createPlansAction(appId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const app = await getAppForUser(appId, user.id);
  if (!app) return { error: "App not found." };
  const mode = String(formData.get("mode")) === "live" ? "live" : "test";
  if (mode === "live") {
    const billing = await getBillingState(user);
    if (billing.status === "unlock_required") return { error: "Your free allowance is used up - unlock Founder OS on the Billing page to publish live plans." };
  }
  const res = await createPlansFromPricing(app, mode);
  if (!res.ok) return { error: res.error };
  revalidatePath(`/app/${appId}`, "layout");
  return { ok: true };
}

export async function setModeAction(appId: string, mode: "test" | "live"): Promise<void> {
  const user = await requireUser();
  const app = await getAppForUser(appId, user.id);
  if (!app) return;
  await setCheckoutMode(app, mode);
  revalidatePath(`/app/${appId}`, "layout");
}

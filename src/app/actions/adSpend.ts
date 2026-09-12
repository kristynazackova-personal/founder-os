"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { getAppForUser } from "@/lib/services/apps";
import { parseAmount, saveAdSpend } from "@/lib/services/adSpend";

/** Save (or clear, with a zero/empty amount) the spend the founder typed for one campaign. */
export async function saveAdSpendAction(appId: string, formData: FormData): Promise<void> {
  const user = await requireUser();
  const app = await getAppForUser(appId, user.id);
  if (!app) return;
  const campaign = String(formData.get("campaign") ?? "");
  await saveAdSpend(app, campaign, parseAmount(String(formData.get("amount") ?? "")));
  revalidatePath(`/app/${appId}/attribution`);
}

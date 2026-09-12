"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { getAppForUser } from "@/lib/services/apps";
import { runAssessment } from "@/lib/services/diagnosis";

export async function refreshDiagnosisAction(appId: string): Promise<void> {
  const user = await requireUser();
  const app = await getAppForUser(appId, user.id);
  if (!app) return;
  await runAssessment(app);
  revalidatePath(`/app/${appId}`, "layout");
}

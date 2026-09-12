"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createBillingCheckout, getBillingState } from "@/lib/services/billing";

export async function startBillingCheckoutAction(): Promise<void> {
  const user = await requireUser();
  const state = await getBillingState(user);
  const res = await createBillingCheckout(user, state);
  if (!res.ok) redirect(`/billing?error=${encodeURIComponent(res.error)}`);
  redirect(res.url);
}

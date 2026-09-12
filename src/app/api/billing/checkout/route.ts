import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createBillingCheckout, getBillingState } from "@/lib/services/billing";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const state = await getBillingState(user);
  const res = await createBillingCheckout(user, state);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.redirect(res.url, { status: 303 });
}

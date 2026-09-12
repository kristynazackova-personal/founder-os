import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getAppForUser } from "@/lib/services/apps";
import { upsertSource } from "@/lib/services/sources";
import { runAssessment } from "@/lib/services/diagnosis";
import { exchangeStripeCode } from "@/lib/sources/stripe";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));
  const jar = await cookies();
  const expected = jar.get("fos_stripe_state")?.value ?? "";
  jar.delete("fos_stripe_state");
  const state = request.nextUrl.searchParams.get("state") ?? "";
  const appId = state.split(".")[0] ?? "";
  const back = (msg?: string) => NextResponse.redirect(new URL(`/app/${appId || ""}/connect/stripe?${msg ? `error=${encodeURIComponent(msg)}` : "stripe=connected"}`, request.url));
  if (!state || state !== expected) return back("Stripe connection expired or was tampered with. Try again.");
  const app = await getAppForUser(appId, user.id);
  if (!app) return NextResponse.redirect(new URL("/app", request.url));
  const err = request.nextUrl.searchParams.get("error_description") ?? request.nextUrl.searchParams.get("error");
  if (err) return back(`Stripe said: ${err}`);
  const code = request.nextUrl.searchParams.get("code");
  if (!code) return back("Stripe returned no authorization code.");
  try {
    const creds = await exchangeStripeCode(code);
    await upsertSource(app, "stripe", creds, creds.stripeUserId, { scope: "read_only" });
    await runAssessment(app).catch(() => undefined);
    return back();
  } catch (e) {
    return back(`Could not finish connecting Stripe: ${e instanceof Error ? e.message : String(e)}`);
  }
}

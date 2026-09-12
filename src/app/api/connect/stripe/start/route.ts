import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getAppForUser } from "@/lib/services/apps";
import { env, stripeConnectConfigured } from "@/lib/env";
import { randomToken } from "@/lib/crypto";
import { stripeOAuthUrl } from "@/lib/sources/stripe";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));
  const appId = request.nextUrl.searchParams.get("app") ?? "";
  const app = await getAppForUser(appId, user.id);
  if (!app) return NextResponse.redirect(new URL("/app", request.url));
  if (!stripeConnectConfigured()) return NextResponse.redirect(new URL(`/app/${app.id}/connect?error=${encodeURIComponent("Stripe Connect is not configured.")}`, request.url));
  const state = `${app.id}.${randomToken(16)}`;
  const jar = await cookies();
  jar.set("fos_stripe_state", state, { httpOnly: true, sameSite: "lax", secure: env.isProd, path: "/", maxAge: 600 });
  return NextResponse.redirect(stripeOAuthUrl(state, `${env.appUrl}/api/connect/stripe/callback`));
}

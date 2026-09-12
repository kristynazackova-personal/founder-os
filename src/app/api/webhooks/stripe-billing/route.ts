import { handleBillingWebhook } from "@/lib/services/billing";

/** Stripe webhooks for Founder OS's own subscriptions (not founders' checkout). */
export async function POST(request: Request) {
  const raw = await request.text();
  const res = await handleBillingWebhook(raw, request.headers.get("stripe-signature"));
  return Response.json(res.body, { status: res.status });
}

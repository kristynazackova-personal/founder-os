import { handleCheckoutWebhook } from "@/lib/services/checkoutWebhooks";

/** Merchant-of-record webhooks: /api/webhooks/dodo, /api/webhooks/polar, /api/webhooks/mock */
export async function POST(request: Request, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  const raw = await request.text();
  const outcome = await handleCheckoutWebhook(provider, raw, request.headers);
  return Response.json(outcome.body, { status: outcome.status });
}

import { env } from "../env";
import { headersFrom, secretBytes, verify } from "../webhooks/standardWebhooks";
import {
  jsonFetch,
  metaString,
  WebhookVerificationError,
  type CheckoutMode,
  type CheckoutProvider,
  type CreateCheckoutInput,
  type CreateCheckoutResult,
  type CreateProductInput,
  type CreateProductResult,
  type WebhookEvent,
} from "./provider";

/**
 * Polar (merchant of record, fallback provider). Written against the v1 API:
 * POST /v1/products, POST /v1/checkouts, POST /v1/refunds; Standard Webhooks
 * (Polar's raw secret is used as the key bytes). Sandbox host = test mode.
 */
const HOST: Record<CheckoutMode, string> = { test: "https://sandbox-api.polar.sh/v1", live: "https://api.polar.sh/v1" };

function auth() {
  if (!env.polarAccessToken) throw new Error("POLAR_ACCESS_TOKEN is not set");
  return { Authorization: `Bearer ${env.polarAccessToken}`, "Content-Type": "application/json" };
}

type PolarOrder = {
  id: string;
  amount?: number;
  net_amount?: number;
  total_amount?: number;
  currency: string;
  customer?: { id?: string; email?: string };
  subscription_id?: string | null;
  product_id?: string | null;
  metadata?: Record<string, unknown>;
  created_at?: string;
  billing_reason?: string;
  refunded_amount?: number;
};
type PolarSubscription = {
  id: string;
  amount?: number;
  currency?: string;
  recurring_interval?: string;
  customer?: { id?: string; email?: string };
  product_id?: string | null;
  metadata?: Record<string, unknown>;
  started_at?: string | null;
  created_at?: string;
  canceled_at?: string | null;
  ended_at?: string | null;
  status?: string;
};
type PolarWebhook = { type: string; data: PolarOrder | PolarSubscription };

export class PolarProvider implements CheckoutProvider {
  readonly name = "polar" as const;

  async createProduct(input: CreateProductInput): Promise<CreateProductResult> {
    const res = await jsonFetch<{ id: string; prices?: Array<{ id: string }> }>(`${HOST[input.mode]}/products`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({
        name: input.name,
        description: input.description ?? null,
        recurring_interval: input.model === "subscription" ? (input.interval ?? "month") : null,
        prices: [{ amount_type: "fixed", price_amount: input.amountCents, price_currency: input.currency.toLowerCase() }],
        organization_id: env.polarOrganizationId || undefined,
        metadata: input.metadata,
      }),
    });
    return { productId: res.id, priceId: res.prices?.[0]?.id ?? null };
  }

  async createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
    const res = await jsonFetch<{ id: string; url: string }>(`${HOST[input.mode]}/checkouts`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ products: [input.productId], success_url: input.successUrl, customer_email: input.customerEmail, metadata: input.metadata }),
    });
    return { url: res.url, sessionId: res.id };
  }

  async parseWebhook(rawBody: string, headers: Headers): Promise<WebhookEvent[]> {
    if (!env.polarWebhookSecret) throw new WebhookVerificationError("POLAR_WEBHOOK_SECRET is not set");
    const v = verify(secretBytes(env.polarWebhookSecret), rawBody, headersFrom(headers));
    if (!v.ok) throw new WebhookVerificationError(v.reason);
    const evt = JSON.parse(rawBody) as PolarWebhook;
    const id = v.id;
    const meta = metaString(evt.data.metadata);
    const mode: CheckoutMode = meta.fos_mode === "live" ? "live" : "test";
    switch (evt.type) {
      case "order.paid": {
        const o = evt.data as PolarOrder;
        return [
          {
            type: "payment_succeeded",
            id,
            paymentId: o.id,
            subscriptionId: o.subscription_id ?? null,
            customerId: o.customer?.id ?? null,
            customerEmail: o.customer?.email ?? null,
            productId: o.product_id ?? null,
            amountCents: o.net_amount ?? o.amount ?? o.total_amount ?? 0,
            currency: (o.currency ?? "usd").toLowerCase(),
            occurredAt: o.created_at ? new Date(o.created_at) : new Date(),
            metadata: meta,
            mode,
          },
        ];
      }
      case "subscription.active": {
        const s = evt.data as PolarSubscription;
        const interval = s.recurring_interval === "year" ? "year" : "month";
        return [
          {
            type: "subscription_active",
            id,
            subscriptionId: s.id,
            customerId: s.customer?.id ?? null,
            customerEmail: s.customer?.email ?? null,
            productId: s.product_id ?? null,
            amountCents: s.amount ?? 0,
            currency: (s.currency ?? "usd").toLowerCase(),
            interval,
            startedAt: new Date(s.started_at ?? s.created_at ?? Date.now()),
            metadata: meta,
            mode,
          },
        ];
      }
      case "subscription.canceled":
      case "subscription.revoked": {
        const s = evt.data as PolarSubscription;
        return [{ type: "subscription_canceled", id, subscriptionId: s.id, canceledAt: new Date(s.ended_at ?? s.canceled_at ?? Date.now()), mode }];
      }
      case "order.refunded": {
        const o = evt.data as PolarOrder;
        return [{ type: "refund", id, paymentId: o.id, amountCents: o.refunded_amount ?? null, mode }];
      }
      default:
        return [{ type: "ignored", id, rawType: evt.type }];
    }
  }

  async refund(paymentId: string, mode: CheckoutMode): Promise<void> {
    await jsonFetch(`${HOST[mode]}/refunds`, { method: "POST", headers: auth(), body: JSON.stringify({ order_id: paymentId, reason: "customer_request" }) });
  }
}

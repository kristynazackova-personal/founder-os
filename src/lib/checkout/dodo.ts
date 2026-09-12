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
 * Dodo Payments (merchant of record). Written against the 2026 REST API:
 * POST /products, POST /checkouts, POST /refunds; Standard Webhooks.
 * Test and live are separate hosts, selected by the checkout mode.
 */
const HOST: Record<CheckoutMode, string> = { test: "https://test.dodopayments.com", live: "https://live.dodopayments.com" };

function auth() {
  if (!env.dodoApiKey) throw new Error("DODO_API_KEY is not set");
  return { Authorization: `Bearer ${env.dodoApiKey}`, "Content-Type": "application/json" };
}

const INTERVAL_TO_DODO: Record<"month" | "year", string> = { month: "Month", year: "Year" };
const DODO_TO_INTERVAL: Record<string, "month" | "year" | "week" | "day"> = { Month: "month", Year: "year", Week: "week", Day: "day" };

type DodoPayment = {
  payment_id: string;
  total_amount: number;
  currency: string;
  customer?: { customer_id?: string; email?: string };
  subscription_id?: string | null;
  metadata?: Record<string, unknown>;
  created_at?: string;
  product_cart?: Array<{ product_id: string }>;
  status?: string;
};
type DodoSubscription = {
  subscription_id: string;
  recurring_pre_tax_amount: number;
  currency: string;
  customer?: { customer_id?: string; email?: string };
  metadata?: Record<string, unknown>;
  created_at?: string;
  payment_frequency_interval?: string;
  product_id?: string;
  status?: string;
  cancelled_at?: string | null;
};
type DodoRefund = { refund_id: string; payment_id: string; amount?: number | null };
type DodoWebhook = { type: string; timestamp?: string; data: (DodoPayment | DodoSubscription | DodoRefund) & { payload_type?: string } };

export class DodoProvider implements CheckoutProvider {
  readonly name = "dodo" as const;

  async createProduct(input: CreateProductInput): Promise<CreateProductResult> {
    const price =
      input.model === "subscription"
        ? {
            type: "recurring_price",
            currency: input.currency.toUpperCase(),
            price: input.amountCents,
            discount: 0,
            purchasing_power_parity: false,
            tax_inclusive: false,
            payment_frequency_count: 1,
            payment_frequency_interval: INTERVAL_TO_DODO[input.interval ?? "month"],
            subscription_period_count: 1,
            subscription_period_interval: INTERVAL_TO_DODO[input.interval ?? "month"],
            trial_period_days: 0,
          }
        : { type: "one_time_price", currency: input.currency.toUpperCase(), price: input.amountCents, discount: 0, purchasing_power_parity: false, tax_inclusive: false };
    const res = await jsonFetch<{ product_id: string }>(`${HOST[input.mode]}/products`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ name: input.name, description: input.description ?? null, tax_category: "saas", price, metadata: input.metadata }),
    });
    return { productId: res.product_id, priceId: null };
  }

  async createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
    const res = await jsonFetch<{ session_id: string; checkout_url: string }>(`${HOST[input.mode]}/checkouts`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({
        product_cart: [{ product_id: input.productId, quantity: 1 }],
        return_url: input.successUrl,
        customer: input.customerEmail ? { email: input.customerEmail } : undefined,
        metadata: input.metadata,
      }),
    });
    return { url: res.checkout_url, sessionId: res.session_id };
  }

  async parseWebhook(rawBody: string, headers: Headers): Promise<WebhookEvent[]> {
    if (!env.dodoWebhookSecret) throw new WebhookVerificationError("DODO_WEBHOOK_SECRET is not set");
    const v = verify(secretBytes(env.dodoWebhookSecret), rawBody, headersFrom(headers));
    if (!v.ok) throw new WebhookVerificationError(v.reason);
    const evt = JSON.parse(rawBody) as DodoWebhook;
    const id = v.id;
    const meta = metaString((evt.data as { metadata?: unknown }).metadata);
    const mode: CheckoutMode = meta.fos_mode === "live" ? "live" : "test";
    switch (evt.type) {
      case "payment.succeeded": {
        const p = evt.data as DodoPayment;
        return [
          {
            type: "payment_succeeded",
            id,
            paymentId: p.payment_id,
            subscriptionId: p.subscription_id ?? null,
            customerId: p.customer?.customer_id ?? null,
            customerEmail: p.customer?.email ?? null,
            productId: p.product_cart?.[0]?.product_id ?? null,
            amountCents: p.total_amount,
            currency: (p.currency ?? "usd").toLowerCase(),
            occurredAt: p.created_at ? new Date(p.created_at) : new Date(),
            metadata: meta,
            mode,
          },
        ];
      }
      case "subscription.active":
      case "subscription.renewed": {
        const s = evt.data as DodoSubscription;
        return [
          {
            type: "subscription_active",
            id,
            subscriptionId: s.subscription_id,
            customerId: s.customer?.customer_id ?? null,
            customerEmail: s.customer?.email ?? null,
            productId: s.product_id ?? null,
            amountCents: s.recurring_pre_tax_amount,
            currency: (s.currency ?? "usd").toLowerCase(),
            interval: DODO_TO_INTERVAL[s.payment_frequency_interval ?? "Month"] ?? "month",
            startedAt: s.created_at ? new Date(s.created_at) : new Date(),
            metadata: meta,
            mode,
          },
        ];
      }
      case "subscription.cancelled":
      case "subscription.expired":
      case "subscription.failed": {
        const s = evt.data as DodoSubscription;
        return [{ type: "subscription_canceled", id, subscriptionId: s.subscription_id, canceledAt: s.cancelled_at ? new Date(s.cancelled_at) : new Date(), mode }];
      }
      case "refund.succeeded": {
        const r = evt.data as DodoRefund;
        return [{ type: "refund", id, paymentId: r.payment_id, amountCents: r.amount ?? null, mode }];
      }
      default:
        return [{ type: "ignored", id, rawType: evt.type }];
    }
  }

  async refund(paymentId: string, mode: CheckoutMode): Promise<void> {
    await jsonFetch(`${HOST[mode]}/refunds`, { method: "POST", headers: auth(), body: JSON.stringify({ payment_id: paymentId, reason: "requested_by_customer" }) });
  }
}

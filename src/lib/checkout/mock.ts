import { shortId } from "../crypto";
import { env } from "../env";
import { headersFrom, secretBytes, sign, verify } from "../webhooks/standardWebhooks";
import {
  metaString,
  WebhookVerificationError,
  type CheckoutMode,
  type CheckoutProvider,
  type CreateCheckoutResult,
  type CreateProductInput,
  type CreateProductResult,
  type WebhookEvent,
} from "./provider";

/**
 * Mock merchant of record. No keys, no network: checkout links open a page
 * in this app where a payment is simulated, and the simulation posts a
 * signed webhook through the same ingest path the real providers use.
 */
export type MockWebhookPayload = {
  type: "payment.succeeded" | "subscription.active" | "subscription.cancelled" | "refund.succeeded";
  data: {
    payment_id?: string;
    subscription_id?: string | null;
    customer_id?: string;
    customer_email?: string | null;
    product_id?: string | null;
    amount?: number;
    currency?: string;
    interval?: "month" | "year";
    metadata?: Record<string, string>;
    occurred_at?: string;
  };
};

export function signMockWebhook(payload: MockWebhookPayload): { body: string; headers: Record<string, string> } {
  const body = JSON.stringify(payload);
  const id = `msg_${shortId(16)}`;
  const timestamp = Math.floor(Date.now() / 1000);
  return { body, headers: { "webhook-id": id, "webhook-timestamp": String(timestamp), "webhook-signature": sign(secretBytes(env.mockWebhookSecret), id, timestamp, body), "content-type": "application/json" } };
}

export class MockProvider implements CheckoutProvider {
  readonly name = "mock" as const;

  async createProduct(input: CreateProductInput): Promise<CreateProductResult> {
    void input;
    return { productId: `mockprod_${shortId(12)}`, priceId: null };
  }

  async createCheckout(): Promise<CreateCheckoutResult> {
    const sessionId = `mocksess_${shortId(16)}`;
    return { url: `${env.appUrl}/pay/mock/${sessionId}`, sessionId };
  }

  async parseWebhook(rawBody: string, headers: Headers): Promise<WebhookEvent[]> {
    const v = verify(secretBytes(env.mockWebhookSecret), rawBody, headersFrom(headers));
    if (!v.ok) throw new WebhookVerificationError(v.reason);
    const evt = JSON.parse(rawBody) as MockWebhookPayload;
    const meta = metaString(evt.data.metadata);
    const mode: CheckoutMode = meta.fos_mode === "live" ? "live" : "test";
    const occurredAt = evt.data.occurred_at ? new Date(evt.data.occurred_at) : new Date();
    switch (evt.type) {
      case "payment.succeeded":
        return [
          {
            type: "payment_succeeded",
            id: v.id,
            paymentId: evt.data.payment_id!,
            subscriptionId: evt.data.subscription_id ?? null,
            customerId: evt.data.customer_id ?? null,
            customerEmail: evt.data.customer_email ?? null,
            productId: evt.data.product_id ?? null,
            amountCents: evt.data.amount ?? 0,
            currency: evt.data.currency ?? "usd",
            occurredAt,
            metadata: meta,
            mode,
          },
        ];
      case "subscription.active":
        return [
          {
            type: "subscription_active",
            id: v.id,
            subscriptionId: evt.data.subscription_id!,
            customerId: evt.data.customer_id ?? null,
            customerEmail: evt.data.customer_email ?? null,
            productId: evt.data.product_id ?? null,
            amountCents: evt.data.amount ?? 0,
            currency: evt.data.currency ?? "usd",
            interval: evt.data.interval ?? "month",
            startedAt: occurredAt,
            metadata: meta,
            mode,
          },
        ];
      case "subscription.cancelled":
        return [{ type: "subscription_canceled", id: v.id, subscriptionId: evt.data.subscription_id!, canceledAt: occurredAt, mode }];
      case "refund.succeeded":
        return [{ type: "refund", id: v.id, paymentId: evt.data.payment_id!, amountCents: evt.data.amount ?? null, mode }];
    }
  }

  async refund(): Promise<void> {
    /* nothing to do: the simulation records the refund through a webhook */
  }
}

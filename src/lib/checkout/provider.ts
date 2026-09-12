/**
 * The internal checkout interface (PRD V1 §6): create product, create
 * checkout, webhook ingest, refund. Providers are interchangeable; the
 * founder never sees which merchant of record sits behind it.
 */
export type CheckoutMode = "test" | "live";
export type ProviderName = "dodo" | "polar" | "mock";

export type CreateProductInput = {
  name: string;
  description?: string;
  model: "subscription" | "one_time";
  interval: "month" | "year" | null;
  amountCents: number;
  currency: string;
  mode: CheckoutMode;
  metadata: Record<string, string>;
};
export type CreateProductResult = { productId: string; priceId: string | null };

export type CreateCheckoutInput = {
  productId: string;
  priceId: string | null;
  mode: CheckoutMode;
  successUrl: string;
  customerEmail?: string;
  metadata: Record<string, string>;
};
export type CreateCheckoutResult = { url: string; sessionId: string };

export type WebhookEvent =
  | {
      type: "payment_succeeded";
      id: string;
      paymentId: string;
      subscriptionId: string | null;
      customerId: string | null;
      customerEmail: string | null;
      productId: string | null;
      amountCents: number;
      currency: string;
      occurredAt: Date;
      metadata: Record<string, string>;
      mode: CheckoutMode;
    }
  | {
      type: "subscription_active";
      id: string;
      subscriptionId: string;
      customerId: string | null;
      customerEmail: string | null;
      productId: string | null;
      amountCents: number;
      currency: string;
      interval: "month" | "year" | "week" | "day";
      startedAt: Date;
      metadata: Record<string, string>;
      mode: CheckoutMode;
    }
  | { type: "subscription_canceled"; id: string; subscriptionId: string; canceledAt: Date; mode: CheckoutMode }
  | { type: "refund"; id: string; paymentId: string; amountCents: number | null; mode: CheckoutMode }
  | { type: "ignored"; id: string; rawType: string };

export interface CheckoutProvider {
  readonly name: ProviderName;
  createProduct(input: CreateProductInput): Promise<CreateProductResult>;
  createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult>;
  /** Verifies the signature and normalises. Throws `WebhookVerificationError` on a bad signature. */
  parseWebhook(rawBody: string, headers: Headers): Promise<WebhookEvent[]>;
  refund(paymentId: string, mode: CheckoutMode): Promise<void>;
}

export class WebhookVerificationError extends Error {}
export class ProviderError extends Error {
  constructor(message: string, public readonly status?: number, public readonly body?: unknown) {
    super(message);
  }
}

export function metaString(meta: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (meta && typeof meta === "object") for (const [k, v] of Object.entries(meta as Record<string, unknown>)) if (v != null) out[k] = String(v);
  return out;
}

export async function jsonFetch<T>(url: string, init: RequestInit & { expect?: number[] } = {}): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* keep text */
  }
  if (!res.ok) throw new ProviderError(`${init.method ?? "GET"} ${url} → ${res.status}`, res.status, body);
  return body as T;
}

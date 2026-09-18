import { env } from "../env";
import { DodoProvider } from "./dodo";
import { MockProvider } from "./mock";
import { PolarProvider } from "./polar";
import type { CheckoutProvider, ProviderName } from "./provider";

const providers: Partial<Record<ProviderName, CheckoutProvider>> = {};

export function getProvider(name: ProviderName = env.checkoutProvider): CheckoutProvider {
  if (!providers[name]) {
    providers[name] = name === "dodo" ? new DodoProvider() : name === "polar" ? new PolarProvider() : new MockProvider();
  }
  return providers[name]!;
}

export function isProviderName(s: string): s is ProviderName {
  return s === "dodo" || s === "polar" || s === "mock";
}

/** Which providers are usable with the current environment. */
export function providerStatus(): { active: ProviderName; configured: boolean; note: string } {
  const active = env.checkoutProvider;
  if (active === "dodo") return { active, configured: Boolean(env.dodoApiKey && env.dodoWebhookSecret), note: "Dodo Payments (merchant of record)" };
  if (active === "polar") return { active, configured: Boolean(env.polarAccessToken && env.polarWebhookSecret), note: "Polar (merchant of record)" };
  return { active, configured: true, note: "Simulated payments - no money moves. Set CHECKOUT_PROVIDER=dodo or polar for real checkout." };
}

export * from "./provider";

/** Environment access in one place. Everything is optional except in production. */
export const env = {
  appUrl: (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  sessionSecret: process.env.SESSION_SECRET ?? "dev-session-secret-change-me",
  encryptionKey: process.env.ENCRYPTION_KEY ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  isProd: process.env.NODE_ENV === "production",

  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeConnectClientId: process.env.STRIPE_CONNECT_CLIENT_ID ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  stripePriceWrapped39: process.env.STRIPE_PRICE_WRAPPED_39 ?? "",
  stripePriceConnected29: process.env.STRIPE_PRICE_CONNECTED_29 ?? "",

  checkoutProvider: (process.env.CHECKOUT_PROVIDER ?? "mock") as "dodo" | "polar" | "mock",
  dodoApiKey: process.env.DODO_API_KEY ?? "",
  dodoWebhookSecret: process.env.DODO_WEBHOOK_SECRET ?? "",
  polarAccessToken: process.env.POLAR_ACCESS_TOKEN ?? "",
  polarOrganizationId: process.env.POLAR_ORGANIZATION_ID ?? "",
  polarWebhookSecret: process.env.POLAR_WEBHOOK_SECRET ?? "",
  mockWebhookSecret: process.env.MOCK_WEBHOOK_SECRET ?? "mock-secret",
};

export function stripeConnectConfigured(): boolean {
  return Boolean(env.stripeSecretKey && env.stripeConnectClientId);
}

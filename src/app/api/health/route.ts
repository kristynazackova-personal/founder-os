import { sql } from "drizzle-orm";
import { dbStatus, getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { googleAdsConfigured } from "@/lib/sources/googleads";

export const dynamic = "force-dynamic";

/** Deployment health. Never includes secrets; the DB error is the driver's message, which names the host at most. */
export async function GET(request: Request) {
  const status = dbStatus();
  let db: "ok" | "error" = "ok";
  let error: string | null = null;
  try {
    const conn = await getDb();
    await conn.execute(sql`select 1`);
  } catch (err) {
    db = "error";
    error = (err instanceof Error ? `${err.name}: ${err.message}` : String(err)).replace(/:\/\/[^@\s]+@/g, "://***@").slice(0, 500);
  }
  return Response.json(
    {
      ok: db === "ok",
      db,
      driver: status.driver,
      databaseUrlSet: status.configured,
      error: error ?? status.lastError,
      appUrl: env.appUrl,
      // The host the request actually arrived on, so a new custom domain can
      // be checked against the service it resolves to and against APP_URL.
      requestHost: (() => {
        try {
          return new URL(request.url).host;
        } catch {
          return null;
        }
      })(),
      checkoutProvider: env.checkoutProvider,
      encryptionKeySet: Boolean(env.encryptionKey),
      sessionSecretSet: env.sessionSecret !== "dev-session-secret-change-me",
      // Booleans only — whether the deployment can offer Google Ads at all,
      // which is otherwise only discoverable by trying to connect an account.
      googleAdsConfigured: googleAdsConfigured(),
      googleAdsApiVersion: env.googleAdsApiVersion,
      node: process.version,
      commit: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? process.env.GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    },
    { status: db === "ok" ? 200 : 503 },
  );
}

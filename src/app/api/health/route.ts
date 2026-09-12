import { sql } from "drizzle-orm";
import { dbStatus, getDb } from "@/lib/db";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Deployment health. Never includes secrets; the DB error is the driver's message, which names the host at most. */
export async function GET() {
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
      checkoutProvider: env.checkoutProvider,
      encryptionKeySet: Boolean(env.encryptionKey),
      sessionSecretSet: env.sessionSecret !== "dev-session-secret-change-me",
      node: process.version,
      commit: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? process.env.GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    },
    { status: db === "ok" ? 200 : 503 },
  );
}

import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";
import { env } from "../env";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export type DbDriver = "neon-http" | "postgres" | "pglite";

const MIGRATIONS = path.join(process.cwd(), "drizzle");

type Holder = { promise: Promise<Db> | null; driver: DbDriver | null; lastError: string | null };
const g = globalThis as unknown as { __fosDb?: Holder };
const holder: Holder = g.__fosDb ?? { promise: null, driver: null, lastError: null };
g.__fosDb = holder;

/** Neon's HTTP driver only speaks to Neon hosts; every other Postgres goes over the wire protocol with `pg`. */
export function pickDriver(databaseUrl: string): DbDriver {
  if (!databaseUrl) return "pglite";
  try {
    const host = new URL(databaseUrl).hostname;
    return /\.neon\.tech$/i.test(host) ? "neon-http" : "postgres";
  } catch {
    return "postgres";
  }
}

async function connect(): Promise<Db> {
  const driver = pickDriver(env.databaseUrl);
  holder.driver = driver;
  const autoMigrate = process.env.DB_AUTO_MIGRATE !== "false";

  if (driver === "neon-http") {
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    const { migrate } = await import("drizzle-orm/neon-http/migrator");
    const db = drizzle(neon(env.databaseUrl), { schema });
    if (autoMigrate) await migrate(db, { migrationsFolder: MIGRATIONS });
    return db as unknown as Db;
  }

  if (driver === "postgres") {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const url = new URL(env.databaseUrl);
    // TLS follows the URL: `sslmode=require|verify-*` (Neon, Supabase, RDS) turns it on with the
    // managed provider's certificate accepted; no sslmode (Railway's internal URL) stays plain.
    // DATABASE_SSL=true|false overrides either way.
    const sslmode = url.searchParams.get("sslmode");
    const override = process.env.DATABASE_SSL;
    const wantsTls = override === "true" || (override !== "false" && Boolean(sslmode) && sslmode !== "disable");
    const ssl = wantsTls ? { rejectUnauthorized: false } : false;
    const pool = new Pool({ connectionString: env.databaseUrl, ssl, max: 5 });
    const db = drizzle(pool, { schema });
    if (autoMigrate) await migrate(db, { migrationsFolder: MIGRATIONS });
    return db as unknown as Db;
  }

  // Zero-setup local database: embedded Postgres (PGlite) persisted in ./.data.
  if (env.isProd && process.env.ALLOW_PGLITE_IN_PRODUCTION !== "true") {
    throw new Error("DATABASE_URL is not set. Production needs a Postgres database (Railway Postgres or Neon); the embedded database is for local development only.");
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dataDir = process.env.PGLITE_DATA_DIR ?? path.join(process.cwd(), ".data", "pglite");
  const client = process.env.PGLITE_MEMORY === "1" ? new PGlite() : new PGlite(dataDir);
  const db = drizzle(client, { schema });
  if (autoMigrate) await migrate(db, { migrationsFolder: MIGRATIONS });
  return db as unknown as Db;
}

/** The one database handle. Migrations run once per process before first use. */
export function getDb(): Promise<Db> {
  if (!holder.promise) {
    holder.promise = connect()
      .then((db) => {
        holder.lastError = null;
        return db;
      })
      .catch((err) => {
        holder.promise = null;
        holder.lastError = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        console.error("[db] connection failed", err);
        throw err;
      });
  }
  return holder.promise;
}

/** For /api/health: which driver is configured and the last connection error, if any. */
export function dbStatus(): { driver: DbDriver; configured: boolean; lastError: string | null } {
  return { driver: pickDriver(env.databaseUrl), configured: Boolean(env.databaseUrl), lastError: holder.lastError };
}

export { schema };

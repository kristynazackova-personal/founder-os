import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";
import { env } from "../env";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const MIGRATIONS = path.join(process.cwd(), "drizzle");

type Holder = { promise: Promise<Db> | null };
const g = globalThis as unknown as { __fosDb?: Holder };
const holder: Holder = g.__fosDb ?? { promise: null };
g.__fosDb = holder;

async function connect(): Promise<Db> {
  if (env.databaseUrl) {
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    const { migrate } = await import("drizzle-orm/neon-http/migrator");
    const sql = neon(env.databaseUrl);
    const db = drizzle(sql, { schema });
    if (process.env.DB_AUTO_MIGRATE !== "false") await migrate(db, { migrationsFolder: MIGRATIONS });
    return db as unknown as Db;
  }
  // Zero-setup local database: embedded Postgres (PGlite) persisted in ./.data.
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dataDir = process.env.PGLITE_DATA_DIR ?? path.join(process.cwd(), ".data", "pglite");
  const client = process.env.PGLITE_MEMORY === "1" ? new PGlite() : new PGlite(dataDir);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db as unknown as Db;
}

/** The one database handle. Migrations run once per process before first use. */
export function getDb(): Promise<Db> {
  if (!holder.promise) {
    holder.promise = connect().catch((err) => {
      holder.promise = null;
      throw err;
    });
  }
  return holder.promise;
}

export { schema };

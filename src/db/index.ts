import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type DB = PostgresJsDatabase<typeof schema>;

const g = globalThis as unknown as { __aioDb?: DB };

/**
 * The connection is created lazily on first use, so importing this module never needs DATABASE_URL
 * (Next.js imports route modules at build time to collect page config).
 */
function getDb(): DB {
  if (g.__aioDb) return g.__aioDb;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  // prepare:false keeps it compatible with Supabase's transaction pooler (port 6543)
  const client = postgres(url, { prepare: false, max: process.env.NODE_ENV === "production" ? 5 : 10 });
  const instance = drizzle(client, { schema });
  g.__aioDb = instance;
  return instance;
}

export const db = new Proxy({} as DB, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export * as t from "./schema";

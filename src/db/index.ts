import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { databaseUrl } from "@/lib/env";

export type DB = PostgresJsDatabase<typeof schema>;

type Conn = { db: DB; client: postgres.Sql; lastUsed: number };
const g = globalThis as unknown as { __aioConn?: Conn };

const isProd = process.env.NODE_ENV === "production";
/**
 * On serverless (Vercel) the instance is suspended between requests while Supabase's pooler drops
 * idle sockets. A query on such a dead socket hangs forever, so a client idle longer than this is
 * discarded and a fresh one is opened (costs one quick reconnect after a pause).
 */
const MAX_IDLE_MS = isProd ? 4_000 : 10 * 60_000;

function createConn(url: string): Conn {
  const client = postgres(url, {
    // prepare:false keeps it compatible with Supabase's transaction pooler (port 6543)
    prepare: false,
    // Supavisor (port 6543) hangs on pipelined queries in transaction mode: once more queries run at
    // once than there are connections, postgres.js pipelines them and their answers never arrive –
    // pages with many parallel queries then spun until the function timed out. One query per
    // connection, and enough connections that a page's parallel queries rarely have to wait.
    max_pipeline: 1,
    max: 10,
    idle_timeout: isProd ? 3 : 0, // seconds – close idle sockets ourselves before the pooler does
    max_lifetime: isProd ? 60 : null,
    connect_timeout: 10,
    // backstop: a pooler that stops answering rejects the query instead of hanging the page
    query_timeout: 20,
  });
  return { client, db: drizzle(client, { schema }), lastUsed: Date.now() };
}

/**
 * The connection is created lazily on first use, so importing this module never needs DATABASE_URL
 * (Next.js imports route modules at build time to collect page config).
 */
function getDb(): DB {
  const now = Date.now();
  let conn = g.__aioConn;
  if (conn && now - conn.lastUsed > MAX_IDLE_MS) {
    // graceful: a still-running query of another request gets up to 5 s, dead sockets are then destroyed
    conn.client.end({ timeout: 5 }).catch(() => {});
    conn = undefined;
  }
  if (!conn) {
    const url = databaseUrl();
    if (!url) throw new Error("DATABASE_URL is not set");
    conn = createConn(url);
    g.__aioConn = conn;
  }
  conn.lastUsed = now;
  return conn.db;
}

export const db = new Proxy({} as DB, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export * as t from "./schema";

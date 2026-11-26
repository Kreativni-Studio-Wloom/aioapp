import postgres from "postgres";
import { appOrigin, databaseUrl, describeDbUrl, supabaseKey, supabaseUrl } from "@/lib/env";
import { aiEnabled } from "@/lib/ai";

/**
 * Public diagnostics without secrets: is the DB configured, reachable and migrated?
 * Hosts, users and passwords are never returned.
 */
export async function GET() {
  const url = databaseUrl();
  const d = describeDbUrl(url);
  const db: Record<string, unknown> = {
    configured: d.set,
    parseable: d.set ? d.parseable !== false : null,
    port: "port" in d ? d.port || null : null,
    passwordSet: "passwordSet" in d ? d.passwordSet : null,
    passwordIsPlaceholder: "passwordIsPlaceholder" in d ? d.passwordIsPlaceholder : null,
    supabasePooler: "host" in d ? String(d.host).endsWith("pooler.supabase.com") : null,
  };

  if (url && d.parseable !== false) {
    const sql = postgres(url, { prepare: false, max: 1, connect_timeout: 8, idle_timeout: 1 });
    try {
      const [{ users }] = await sql<{ users: number }[]>`select count(*)::int as users from users`;
      db.reachable = true;
      db.migrated = true;
      db.users = users;
    } catch (e) {
      const err = e as { code?: string; message?: string };
      const msg = err.message ?? "";
      db.reachable = !/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|CONNECT_TIMEOUT|getaddrinfo/i.test(`${err.code} ${msg}`);
      db.migrated = err.code === "42P01" ? false : null;
      db.errorCode = err.code ?? null;
      db.problem =
        err.code === "28P01" || /password authentication failed/i.test(msg)
          ? "Špatné heslo k databázi"
          : /tenant or user not found/i.test(msg)
            ? "Špatný uživatel/projekt v connection stringu (musí být postgres.<project-ref>)"
            : err.code === "42P01"
              ? "Tabulky neexistují – spusť npm run db:setup:prod"
              : !db.reachable
                ? "Databázový server není dosažitelný (host/port)"
                : "Jiná chyba – viz Vercel → Logs";
    } finally {
      await sql.end({ timeout: 1 }).catch(() => {});
    }
  }

  const ok = db.reachable === true && db.migrated === true && !!supabaseUrl() && !!supabaseKey();
  return Response.json(
    { ok, db, auth: { supabaseUrl: supabaseUrl() ?? null, publishableKey: !!supabaseKey() }, appUrl: appOrigin() ?? null, ai: aiEnabled(), push: !!process.env.VAPID_PRIVATE_KEY, cron: !!process.env.CRON_SECRET },
    { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}

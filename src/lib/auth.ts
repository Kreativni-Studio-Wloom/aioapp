import { redirect } from "next/navigation";
import { cache } from "react";
import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db, t } from "@/db";
import { supabaseConfigured, supabaseServer } from "@/lib/supabase";

/** Sign-in and registration are handled by Supabase Auth; app data is keyed by our own `users` row (matched by e-mail). */

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export type SessionUser = { id: string; email: string; name: string | null };

export function registrationOpen() {
  return process.env.ALLOW_REGISTRATION !== "false";
}

/**
 * The app's user row for a Supabase identity. Created on first sign-in (with an empty profile),
 * unless registration is closed and the instance already has an owner.
 */
export async function ensureAppUser(email: string, name?: string | null): Promise<SessionUser | null> {
  const normalized = email.trim().toLowerCase();
  const [row] = await db
    .select({ id: t.users.id, email: t.users.email, name: t.users.name })
    .from(t.users)
    .where(eq(sql`lower(${t.users.email})`, normalized))
    .limit(1);
  if (row) return row;
  if (!registrationOpen()) {
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(t.users);
    if (count > 0) return null;
  }
  const [created] = await db
    .insert(t.users)
    .values({ email: normalized, name: name?.trim() || null, passwordHash: "" })
    .onConflictDoNothing()
    .returning({ id: t.users.id, email: t.users.email, name: t.users.name });
  if (!created) return ensureAppUser(normalized, name); // created concurrently
  await db.insert(t.profiles).values({ userId: created.id }).onConflictDoNothing();
  return created;
}

/** Current user from the Supabase session cookie, or null. Cached per request. */
export const getUser = cache(async (): Promise<SessionUser | null> => {
  if (!supabaseConfigured()) return null;
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const email = typeof claims?.email === "string" ? claims.email : null;
  if (!email) return null;
  const meta = (claims?.user_metadata ?? {}) as { name?: string };
  return ensureAppUser(email, meta.name);
});

/** Use in server components and server actions. Redirects to /login when signed out. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

/** Resolve a user from an `Authorization: Bearer aio_…` API key (for /api/v1 and MCP). */
export async function userFromApiKey(authHeader: string | null): Promise<SessionUser | null> {
  const key = authHeader?.match(/^Bearer\s+(aio_[A-Za-z0-9_-]+)$/)?.[1];
  if (!key) return null;
  const rows = await db
    .select({ id: t.users.id, email: t.users.email, name: t.users.name, keyId: t.apiKeys.id, expiresAt: t.apiKeys.expiresAt })
    .from(t.apiKeys)
    .innerJoin(t.users, eq(t.users.id, t.apiKeys.userId))
    .where(eq(t.apiKeys.keyHash, sha256(key)))
    .limit(1);
  const row = rows[0];
  if (!row || (row.expiresAt && row.expiresAt < new Date())) return null;
  await db.update(t.apiKeys).set({ lastUsedAt: new Date() }).where(eq(t.apiKeys.id, row.keyId));
  return { id: row.id, email: row.email, name: row.name };
}

/** Route handlers: API key first, then session cookie. */
export async function userFromRequest(req: Request): Promise<SessionUser | null> {
  return (await userFromApiKey(req.headers.get("authorization"))) ?? (await getUser());
}

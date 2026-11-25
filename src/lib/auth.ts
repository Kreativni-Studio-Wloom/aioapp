import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { randomBytes, scrypt as _scrypt, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
import { and, eq, gt } from "drizzle-orm";
import { db, t } from "@/db";

const scrypt = promisify(_scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const SESSION_COOKIE = "aio_session";
const SESSION_DAYS = 60;

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize("NFKC"), salt, 64);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [algo, saltB64, keyB64] = stored.split("$");
  if (algo !== "scrypt" || !saltB64 || !keyB64) return false;
  const key = Buffer.from(keyB64, "base64");
  const test = await scrypt(password.normalize("NFKC"), Buffer.from(saltB64, "base64"), key.length);
  return timingSafeEqual(key, test);
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5);
  const ua = (await headers()).get("user-agent")?.slice(0, 300) ?? null;
  await db.insert(t.sessions).values({ id: sha256(token), userId, expiresAt, userAgent: ua });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(t.sessions).where(eq(t.sessions.id, sha256(token)));
  jar.delete(SESSION_COOKIE);
}

export type SessionUser = { id: string; email: string; name: string | null };

/** Current user from the session cookie, or null. Cached per request. */
export const getUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = await db
    .select({ id: t.users.id, email: t.users.email, name: t.users.name })
    .from(t.sessions)
    .innerJoin(t.users, eq(t.users.id, t.sessions.userId))
    .where(and(eq(t.sessions.id, sha256(token)), gt(t.sessions.expiresAt, new Date())))
    .limit(1);
  return rows[0] ?? null;
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

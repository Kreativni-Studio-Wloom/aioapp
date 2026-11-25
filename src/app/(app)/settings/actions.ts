"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import { db, t } from "@/db";
import { hashPassword, requireUser, sha256, verifyPassword, SESSION_COOKIE } from "@/lib/auth";
import { str, toNum, type ActionResult } from "@/lib/utils";

export async function setTheme(theme: "dark" | "light") {
  (await cookies()).set("theme", theme, { path: "/", maxAge: 60 * 60 * 24 * 400, sameSite: "lax" });
  revalidatePath("/", "layout");
}

export async function updateAccount(_: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  await db.update(t.users).set({ name: str(form.get("name")) }).where(eq(t.users.id, user.id));
  const stagnation = toNum(form.get("stagnationSessions"));
  const rest = toNum(form.get("defaultRestSeconds"));
  await db
    .insert(t.profiles)
    .values({ userId: user.id })
    .onConflictDoNothing();
  await db
    .update(t.profiles)
    .set({
      ...(stagnation ? { stagnationSessions: Math.max(2, Math.min(10, Math.round(stagnation))) } : {}),
      ...(rest ? { defaultRestSeconds: Math.max(15, Math.min(600, Math.round(rest))) } : {}),
      updatedAt: new Date(),
    })
    .where(eq(t.profiles.userId, user.id));
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function changePassword(_: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const current = String(form.get("current") ?? "");
  const next = String(form.get("next") ?? "");
  if (next.length < 8) return { ok: false, error: "Nové heslo musí mít alespoň 8 znaků." };
  const [row] = await db.select({ hash: t.users.passwordHash }).from(t.users).where(eq(t.users.id, user.id));
  if (!row || !(await verifyPassword(current, row.hash))) return { ok: false, error: "Současné heslo nesedí." };
  await db.update(t.users).set({ passwordHash: await hashPassword(next) }).where(eq(t.users.id, user.id));
  // sign out other devices
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) await db.delete(t.sessions).where(and(eq(t.sessions.userId, user.id), ne(t.sessions.id, sha256(token))));
  return { ok: true };
}

export async function createApiKey(name: string): Promise<ActionResult<{ key: string }>> {
  const user = await requireUser();
  const key = `aio_${randomBytes(24).toString("base64url")}`;
  await db.insert(t.apiKeys).values({ userId: user.id, name: name.trim() || "API klíč", keyHash: sha256(key), prefix: key.slice(0, 10) });
  revalidatePath("/settings");
  return { ok: true, data: { key } };
}

export async function deleteApiKey(id: string) {
  const user = await requireUser();
  await db.delete(t.apiKeys).where(and(eq(t.apiKeys.id, id), eq(t.apiKeys.userId, user.id)));
  revalidatePath("/settings");
}

export async function signOutOtherDevices() {
  const user = await requireUser();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) await db.delete(t.sessions).where(and(eq(t.sessions.userId, user.id), ne(t.sessions.id, sha256(token))));
  revalidatePath("/settings");
}

export async function savePushSubscription(sub: { endpoint: string; keys: { p256dh: string; auth: string } }) {
  const user = await requireUser();
  await db
    .insert(t.pushSubscriptions)
    .values({ userId: user.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth })
    .onConflictDoUpdate({ target: t.pushSubscriptions.endpoint, set: { userId: user.id, p256dh: sub.keys.p256dh, auth: sub.keys.auth } });
  return { ok: true };
}

export async function removePushSubscription(endpoint: string) {
  const user = await requireUser();
  await db.delete(t.pushSubscriptions).where(and(eq(t.pushSubscriptions.endpoint, endpoint), eq(t.pushSubscriptions.userId, user.id)));
}

export async function sendTestPush(): Promise<ActionResult> {
  const user = await requireUser();
  const { sendPush } = await import("@/lib/push");
  const n = await sendPush(user.id, { title: "AIO", body: "Notifikace fungují ✓", url: "/settings" });
  return n > 0 ? { ok: true } : { ok: false, error: "Žádné zařízení není přihlášené k notifikacím." };
}

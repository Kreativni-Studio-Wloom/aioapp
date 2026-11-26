"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db, t } from "@/db";
import { requireUser, sha256 } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase";
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
  const supabase = await supabaseServer();
  const { error: wrong } = await supabase.auth.signInWithPassword({ email: user.email, password: current });
  if (wrong) return { ok: false, error: "Současné heslo nesedí." };
  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) return { ok: false, error: error.code === "same_password" ? "Nové heslo musí být jiné než současné." : error.message };
  await supabase.auth.signOut({ scope: "others" });
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
  await requireUser();
  await (await supabaseServer()).auth.signOut({ scope: "others" });
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

/**
 * Delete the account and all its data (GDPR art. 17). App tables cascade from `users`; the Supabase Auth
 * identity is removed directly in the `auth` schema (our DB role owns it on Supabase; skipped locally).
 */
export async function deleteAccount(_: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const typed = String(form.get("confirm") ?? "").trim().toLowerCase();
  if (typed !== user.email.toLowerCase()) return { ok: false, error: "Pro potvrzení napiš přesně svůj e-mail." };
  await db.transaction(async (tx) => {
    await tx.delete(t.users).where(eq(t.users.id, user.id));
    const [row] = await tx.execute<{ present: boolean }>(sql`select to_regclass('auth.users') is not null as present`);
    if (row?.present) await tx.execute(sql`delete from auth.users where lower(email) = ${user.email.toLowerCase()}`);
  });
  await (await supabaseServer()).auth.signOut().catch(() => {});
  redirect("/login?m=deleted");
}

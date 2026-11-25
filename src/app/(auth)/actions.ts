"use server";

import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, t } from "@/db";
import { createSession, destroySession, hashPassword, verifyPassword } from "@/lib/auth";

export type AuthState = { error?: string } | undefined;

const credentials = z.object({
  email: z.string().trim().toLowerCase().email("Neplatný e-mail"),
  password: z.string().min(8, "Heslo musí mít alespoň 8 znaků").max(200),
});

function safeNext(next: FormDataEntryValue | null) {
  const n = typeof next === "string" ? next : "";
  return n.startsWith("/") && !n.startsWith("//") ? n : "/";
}

export async function login(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = credentials.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: "Zadej platný e-mail a heslo." };
  const [user] = await db.select().from(t.users).where(eq(t.users.email, parsed.data.email)).limit(1);
  // constant-ish time: always run a verification
  const ok = await verifyPassword(parsed.data.password, user?.passwordHash ?? "scrypt$AAAAAAAAAAAAAAAAAAAAAA==$" + "A".repeat(86) + "==");
  if (!user || !ok) return { error: "Nesprávný e-mail nebo heslo." };
  await createSession(user.id);
  redirect(safeNext(form.get("next")));
}

export async function register(_: AuthState, form: FormData): Promise<AuthState> {
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(t.users);
  if (count > 0 && process.env.ALLOW_REGISTRATION === "false") return { error: "Registrace jsou uzavřené." };

  const parsed = credentials.extend({ name: z.string().trim().max(80).optional() }).safeParse({
    email: form.get("email"),
    password: form.get("password"),
    name: form.get("name") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Neplatné údaje." };
  if (form.get("password") !== form.get("password2")) return { error: "Hesla se neshodují." };

  const [exists] = await db.select({ id: t.users.id }).from(t.users).where(eq(t.users.email, parsed.data.email)).limit(1);
  if (exists) return { error: "Účet s tímto e-mailem už existuje." };

  const [user] = await db
    .insert(t.users)
    .values({ email: parsed.data.email, name: parsed.data.name ?? null, passwordHash: await hashPassword(parsed.data.password) })
    .returning({ id: t.users.id });
  await db.insert(t.profiles).values({ userId: user.id });
  await createSession(user.id);
  redirect("/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

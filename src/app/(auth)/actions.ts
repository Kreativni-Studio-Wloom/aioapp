"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db, t } from "@/db";
import { ensureAppUser, registrationOpen } from "@/lib/auth";
import { appOrigin } from "@/lib/env";
import { supabaseConfigured, supabaseServer } from "@/lib/supabase";

export type AuthState = { error?: string; info?: string } | undefined;

const email = z.string().trim().toLowerCase().email("Neplatný e-mail");
const password = z.string().min(8, "Heslo musí mít alespoň 8 znaků").max(200);

const NOT_CONFIGURED: AuthState = { error: "Přihlašování přes Supabase není nastavené (chybí SUPABASE_PUBLISHABLE_KEY)." };

function safeNext(next: FormDataEntryValue | null) {
  const n = typeof next === "string" ? next : "";
  return n.startsWith("/") && !n.startsWith("//") ? n : "/";
}

async function origin() {
  const configured = appOrigin();
  if (configured) return configured;
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
}

function authError(message: string, code?: string): string {
  if (code === "invalid_credentials" || /invalid login credentials/i.test(message)) return "Nesprávný e-mail nebo heslo.";
  if (code === "email_not_confirmed" || /email not confirmed/i.test(message)) return "Nejdřív potvrď e-mail – odkaz ti přišel do schránky.";
  if (code === "over_email_send_rate_limit" || /rate limit/i.test(message)) return "Moc pokusů za krátkou dobu, zkus to za chvíli znovu.";
  if (code === "weak_password" || /password/i.test(message)) return "Heslo je moc slabé – zkus delší nebo složitější.";
  if (code === "signup_disabled") return "Registrace jsou uzavřené.";
  if (code === "same_password") return "Nové heslo musí být jiné než současné.";
  return message || "Něco se nepovedlo, zkus to znovu.";
}

async function registrationClosed() {
  if (registrationOpen()) return false;
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(t.users);
  return count > 0;
}

export async function login(_: AuthState, form: FormData): Promise<AuthState> {
  if (!supabaseConfigured()) return NOT_CONFIGURED;
  const parsed = z.object({ email, password: z.string().min(1).max(200) }).safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: "Zadej platný e-mail a heslo." };

  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user?.email) return { error: authError(error?.message ?? "", error?.code) };

  const user = await ensureAppUser(data.user.email, (data.user.user_metadata as { name?: string })?.name);
  if (!user) {
    await supabase.auth.signOut();
    return { error: "Registrace nových účtů jsou uzavřené." };
  }
  redirect(safeNext(form.get("next")));
}

export async function register(_: AuthState, form: FormData): Promise<AuthState> {
  if (!supabaseConfigured()) return NOT_CONFIGURED;
  if (await registrationClosed()) return { error: "Registrace jsou uzavřené." };

  const parsed = z
    .object({ email, password, name: z.string().trim().max(80).optional() })
    .safeParse({ email: form.get("email"), password: form.get("password"), name: form.get("name") || undefined });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Neplatné údaje." };
  if (form.get("password") !== form.get("password2")) return { error: "Hesla se neshodují." };

  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${await origin()}/auth/callback`,
      data: parsed.data.name ? { name: parsed.data.name } : undefined,
    },
  });
  if (error) return { error: authError(error.message, error.code) };

  // e-mail confirmation turned off in Supabase → signed in right away
  if (data.session && data.user?.email) {
    await ensureAppUser(data.user.email, parsed.data.name);
    redirect("/");
  }
  return { info: `Poslali jsme potvrzovací e-mail na ${parsed.data.email}. Klikni na odkaz v něm a jsi přihlášený.` };
}

export async function forgotPassword(_: AuthState, form: FormData): Promise<AuthState> {
  if (!supabaseConfigured()) return NOT_CONFIGURED;
  const parsed = email.safeParse(form.get("email"));
  if (!parsed.success) return { error: "Zadej platný e-mail." };
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${await origin()}/auth/callback?next=/reset-password`,
  });
  if (error && error.code === "over_email_send_rate_limit") return { error: authError(error.message, error.code) };
  // same answer whether or not the account exists
  return { info: "Pokud účet s tímto e-mailem existuje, přišel ti odkaz pro nastavení nového hesla." };
}

export async function resetPassword(_: AuthState, form: FormData): Promise<AuthState> {
  if (!supabaseConfigured()) return NOT_CONFIGURED;
  const parsed = password.safeParse(form.get("password"));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  if (form.get("password") !== form.get("password2")) return { error: "Hesla se neshodují." };
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) return { error: authError(error.message, error.code) };
  redirect("/");
}

export async function logout() {
  if (supabaseConfigured()) await (await supabaseServer()).auth.signOut();
  redirect("/login");
}

import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { ensureAppUser } from "@/lib/auth";
import { appOrigin } from "@/lib/env";
import { supabaseConfigured, supabaseServer } from "@/lib/supabase";

/**
 * Landing URL for Supabase e-mail links (sign-up confirmation, password reset).
 * Handles both the PKCE `?code=` flow and `?token_hash=&type=` templates.
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const base = appOrigin() ?? url.origin;
  const nextParam = url.searchParams.get("next") ?? "/";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";
  if (!supabaseConfigured()) return NextResponse.redirect(`${base}/login`);

  const supabase = await supabaseServer();
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  const { data, error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { data: { user: null }, error: new Error("missing code") };

  if (error || !data.user?.email) {
    // e.g. link opened in another browser: the e-mail is confirmed but the PKCE verifier is missing
    return NextResponse.redirect(`${base}/login?m=${code && next === "/" && !url.searchParams.get("error") ? "confirmed" : "link"}`);
  }
  await ensureAppUser(data.user.email, (data.user.user_metadata as { name?: string })?.name);
  return NextResponse.redirect(`${base}${next}`);
}

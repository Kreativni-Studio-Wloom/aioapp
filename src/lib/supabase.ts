import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseKey, supabaseUrl } from "@/lib/env";

export class AuthNotConfiguredError extends Error {
  constructor() {
    super("Supabase Auth is not configured (SUPABASE_PUBLISHABLE_KEY / SUPABASE_URL)");
  }
}

export function supabaseConfigured() {
  return !!(supabaseUrl() && supabaseKey());
}

/** Supabase client bound to the request cookies (server components, server actions, route handlers). */
export async function supabaseServer() {
  const url = supabaseUrl();
  const key = supabaseKey();
  if (!url || !key) throw new AuthNotConfiguredError();
  const jar = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll(list) {
        try {
          for (const { name, value, options } of list) jar.set(name, value, options);
        } catch {
          // server components cannot set cookies – the proxy refreshes the session instead
        }
      },
    },
  });
}

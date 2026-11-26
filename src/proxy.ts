import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabaseKey, supabaseUrl } from "@/lib/env";

const PUBLIC = ["/login", "/register", "/forgot-password", "/auth", "/manifest.webmanifest", "/sw.js", "/offline", "/.well-known", "/pravni"];

/**
 * Refreshes the Supabase session cookies on every page request and redirects signed-out visitors
 * to /login. The app user itself is resolved in requireUser().
 */
export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  let res = NextResponse.next({ request: req });
  let signedIn = false;

  const url = supabaseUrl();
  const key = supabaseKey();
  if (url && key) {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll(list, headers) {
          for (const { name, value } of list) req.cookies.set(name, value);
          res = NextResponse.next({ request: req });
          for (const { name, value, options } of list) res.cookies.set(name, value, options);
          for (const [k, v] of Object.entries(headers ?? {})) res.headers.set(k, v);
        },
      },
    });
    const { data } = await supabase.auth.getClaims();
    signedIn = !!data?.claims;
  }

  if (signedIn || PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"))) return res;

  const login = req.nextUrl.clone();
  login.pathname = "/login";
  login.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
  const redirect = NextResponse.redirect(login);
  for (const c of res.cookies.getAll()) redirect.cookies.set(c);
  return redirect;
}

export const config = {
  // skip API (own auth), Next internals and static files
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt|js|json|webmanifest)$).*)"],
};

import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = ["/login", "/register", "/manifest.webmanifest", "/sw.js", "/offline", "/.well-known"];

/** Optimistic check only: real session validation happens in requireUser(). */
export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();
  if (!req.cookies.has("aio_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // skip API (own auth), Next internals and static files
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt|js|json|webmanifest)$).*)"],
};

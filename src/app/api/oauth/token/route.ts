import { CORS, exchangeCode, OAuthError, refreshTokens } from "@/lib/oauth";

async function params(req: Request): Promise<URLSearchParams> {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const j = (await req.json().catch(() => ({}))) as Record<string, string>;
    return new URLSearchParams(j);
  }
  return new URLSearchParams(await req.text());
}

export async function POST(req: Request) {
  const p = await params(req);
  // client_secret_basic: client id may come in the Authorization header
  let clientId = p.get("client_id");
  const basic = req.headers.get("authorization")?.match(/^Basic\s+(.+)$/i)?.[1];
  if (!clientId && basic) clientId = Buffer.from(basic, "base64").toString().split(":")[0] || null;

  const headers = { ...CORS, "Cache-Control": "no-store" };
  try {
    const grant = p.get("grant_type");
    if (grant === "authorization_code") {
      const code = p.get("code");
      const verifier = p.get("code_verifier");
      if (!code || !verifier || !clientId) throw new OAuthError("invalid_request", "code, code_verifier and client_id are required");
      return Response.json(await exchangeCode({ code, verifier, clientId, redirectUri: p.get("redirect_uri") ?? "" }), { headers });
    }
    if (grant === "refresh_token") {
      const rt = p.get("refresh_token");
      if (!rt) throw new OAuthError("invalid_request", "refresh_token is required");
      return Response.json(await refreshTokens({ refreshToken: rt, clientId }), { headers });
    }
    throw new OAuthError("unsupported_grant_type", "Unsupported grant_type");
  } catch (e) {
    if (e instanceof OAuthError) return Response.json({ error: e.code, error_description: e.description }, { status: e.status, headers });
    console.error("oauth token", e);
    return Response.json({ error: "server_error" }, { status: 500, headers });
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

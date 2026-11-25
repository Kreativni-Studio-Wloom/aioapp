import { CORS, registerClient } from "@/lib/oauth";

/** RFC 7591 dynamic client registration (public clients, PKCE). */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  try {
    const c = await registerClient(body);
    return Response.json(
      {
        ...c,
        client_id_issued_at: Math.floor(Date.now() / 1000),
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
      },
      { status: 201, headers: CORS },
    );
  } catch {
    return Response.json({ error: "invalid_redirect_uri", error_description: "redirect_uris must be https (or localhost)" }, { status: 400, headers: CORS });
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

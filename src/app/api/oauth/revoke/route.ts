import { CORS, revokeToken } from "@/lib/oauth";

export async function POST(req: Request) {
  const p = new URLSearchParams(await req.text());
  const token = p.get("token");
  if (token) await revokeToken(token);
  return new Response(null, { status: 200, headers: CORS });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

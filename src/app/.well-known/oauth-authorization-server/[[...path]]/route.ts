import { authServerMetadata, baseUrl, CORS } from "@/lib/oauth";

export function GET(req: Request) {
  return Response.json(authServerMetadata(baseUrl(req)), { headers: CORS });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

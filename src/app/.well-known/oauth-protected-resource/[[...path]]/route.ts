import { baseUrl, CORS, protectedResourceMetadata } from "@/lib/oauth";

export function GET(req: Request) {
  return Response.json(protectedResourceMetadata(baseUrl(req)), { headers: CORS });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

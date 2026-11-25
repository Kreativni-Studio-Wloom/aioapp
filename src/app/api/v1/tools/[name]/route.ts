import { userFromApiKey } from "@/lib/auth";
import { TOOL_MAP } from "@/lib/ai-tools";

/** Run a tool. API key auth only (no cookies) so this endpoint can't be hit via CSRF. */
export async function POST(req: Request, ctx: RouteContext<"/api/v1/tools/[name]">) {
  const user = await userFromApiKey(req.headers.get("authorization"));
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { name } = await ctx.params;
  const def = TOOL_MAP.get(name);
  if (!def) return Response.json({ error: `Unknown tool ${name}` }, { status: 404 });
  const input = await req.json().catch(() => ({}));
  const parsed = def.schema.safeParse(input);
  if (!parsed.success) return Response.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  try {
    return Response.json({ ok: true, data: (await def.run(user.id, parsed.data)) ?? null });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

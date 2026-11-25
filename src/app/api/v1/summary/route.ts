import { userFromRequest } from "@/lib/auth";
import { runTool } from "@/lib/ai-tools";

export async function GET(req: Request) {
  const user = await userFromRequest(req);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json(await runTool(user.id, "get_overview", {}));
}

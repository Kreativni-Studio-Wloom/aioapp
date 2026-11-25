import { userFromRequest } from "@/lib/auth";
import { TOOLS, jsonSchema } from "@/lib/ai-tools";

export async function GET(req: Request) {
  if (!(await userFromRequest(req))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json(TOOLS.map((d) => ({ name: d.name, write: d.write, module: d.module, description: d.description, input: jsonSchema(d) })));
}

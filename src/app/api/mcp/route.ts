/**
 * Minimal stateless MCP server (Streamable HTTP transport, JSON responses).
 * Claude app: Settings → Connectors → Add custom connector → URL below → sign in (OAuth).
 *   URL: https://aioapp.eu/api/mcp   (scripts/Claude Code can use Authorization: Bearer aio_… instead)
 */
import { userFromApiKey } from "@/lib/auth";
import { TOOLS, TOOL_MAP, jsonSchema } from "@/lib/ai-tools";
import { baseUrl, CORS } from "@/lib/oauth";

const SUPPORTED = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

type RpcReq = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };

const ok = (id: RpcReq["id"], result: unknown) => ({ jsonrpc: "2.0", id, result });
const err = (id: RpcReq["id"], code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });

async function handle(userId: string, msg: RpcReq) {
  switch (msg.method) {
    case "initialize": {
      const requested = String(msg.params?.protocolVersion ?? "");
      return ok(msg.id, {
        protocolVersion: SUPPORTED.includes(requested) ? requested : SUPPORTED[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "aio", title: "AIO – osobní tracker", version: "1.0.0" },
        instructions:
          "Tools for the user's personal tracker: training (programs, workouts, progress), nutrition (food log, targets), income (businesses, events, transactions) and portfolio (assets, net worth). Amounts are CZK unless stated. Read before writing; dates are YYYY-MM-DD (Europe/Prague).",
      });
    }
    case "ping":
      return ok(msg.id, {});
    case "tools/list":
      return ok(msg.id, {
        tools: TOOLS.map((d) => ({
          name: d.name,
          description: d.description,
          inputSchema: jsonSchema(d),
          annotations: { readOnlyHint: !d.write, destructiveHint: false, openWorldHint: false },
        })),
      });
    case "tools/call": {
      const name = String(msg.params?.name ?? "");
      const def = TOOL_MAP.get(name);
      if (!def) return err(msg.id, -32602, `Unknown tool: ${name}`);
      const parsed = def.schema.safeParse(msg.params?.arguments ?? {});
      if (!parsed.success) {
        return ok(msg.id, { isError: true, content: [{ type: "text", text: `Invalid arguments: ${parsed.error.message}` }] });
      }
      try {
        const data = await def.run(userId, parsed.data);
        return ok(msg.id, { content: [{ type: "text", text: JSON.stringify(data ?? { ok: true }) }] });
      } catch (e) {
        return ok(msg.id, { isError: true, content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }] });
      }
    }
    default:
      if (msg.id === undefined || msg.method.startsWith("notifications/")) return null; // notification: no response
      return err(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}

export async function POST(req: Request) {
  const user = await userFromApiKey(req.headers.get("authorization"));
  if (!user) {
    return Response.json(err(null, -32001, "Unauthorized – connect via OAuth or use Authorization: Bearer <AIO API key>"), {
      status: 401,
      headers: { ...CORS, "WWW-Authenticate": `Bearer resource_metadata="${baseUrl(req)}/.well-known/oauth-protected-resource/api/mcp"` },
    });
  }
  let body: RpcReq | RpcReq[];
  try {
    body = await req.json();
  } catch {
    return Response.json(err(null, -32700, "Parse error"), { status: 400 });
  }
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((m) => handle(user.id, m)))).filter(Boolean);
    return out.length ? Response.json(out) : new Response(null, { status: 202 });
  }
  const res = await handle(user.id, body);
  return res ? Response.json(res) : new Response(null, { status: 202 });
}

export async function GET() {
  // no server-initiated stream in this stateless server
  return new Response("Method Not Allowed", { status: 405, headers: { ...CORS, Allow: "POST" } });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function DELETE() {
  return new Response(null, { status: 405 });
}

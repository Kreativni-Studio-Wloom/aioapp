import { TOOLS, jsonSchema } from "@/lib/ai-tools";

/** Self-describing API index (public: lists endpoints and tool schemas, no data). */
export async function GET(req: Request) {
  const base = new URL(req.url).origin;
  return Response.json({
    name: "AIO API",
    version: "v1",
    auth: "Authorization: Bearer <API key from Nastavení → API a integrace>",
    endpoints: {
      [`GET ${base}/api/v1/summary`]: "Dnešní přehled všech modulů",
      [`GET ${base}/api/v1/tools`]: "Seznam nástrojů",
      [`POST ${base}/api/v1/tools/{name}`]: "Spuštění nástroje, tělo = JSON vstup",
      [`GET ${base}/api/export`]: "Kompletní export dat (JSON)",
      [`POST ${base}/api/mcp`]: "MCP server (Streamable HTTP) pro Clauda",
    },
    examples: {
      "Zapsat váhu (iOS Zkratky)": { method: "POST", url: `${base}/api/v1/tools/log_body_weight`, body: { weightKg: 82.4 } },
      "Přidat příjem": { method: "POST", url: `${base}/api/v1/tools/add_transaction`, body: { kind: "income", amount: 12400, label: "Tržba event" } },
    },
    tools: TOOLS.map((d) => ({ name: d.name, write: d.write, description: d.description, input: jsonSchema(d) })),
  });
}

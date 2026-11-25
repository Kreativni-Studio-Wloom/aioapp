import type Anthropic from "@anthropic-ai/sdk";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, t } from "@/db";
import { getUser } from "@/lib/auth";
import { AI_MODEL, aiEnabled, anthropic, imageBlock } from "@/lib/ai";
import { anthropicTools, handleToolUse, loadHistory, saveMessage, systemPrompt, type ProposedAction } from "@/lib/assistant";

export const maxDuration = 300;

const Body = z.object({
  conversationId: z.string().uuid().optional(),
  module: z.enum(["general", "workout", "nutrition", "income", "portfolio"]).default("general"),
  message: z.string().min(1).max(20_000),
  image: z.string().startsWith("data:image/").max(8_000_000).optional(),
});

export type ChatEvent =
  | { type: "conversation"; id: string }
  | { type: "text"; text: string }
  | { type: "tool"; name: string }
  | { type: "action"; action: ProposedAction }
  | { type: "error"; message: string }
  | { type: "done" };

const MAX_STEPS = 10;

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!aiEnabled()) return Response.json({ error: "AI není nastavená – doplň ANTHROPIC_API_KEY." }, { status: 400 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: "Neplatný požadavek" }, { status: 400 });
  const { module, message, image } = parsed.data;

  let conversationId = parsed.data.conversationId;
  if (conversationId) {
    const [c] = await db.select({ id: t.aiConversations.id }).from(t.aiConversations).where(and(eq(t.aiConversations.id, conversationId), eq(t.aiConversations.userId, user.id)));
    if (!c) return Response.json({ error: "Konverzace neexistuje" }, { status: 404 });
  } else {
    const [c] = await db
      .insert(t.aiConversations)
      .values({ userId: user.id, module, title: message.slice(0, 60) })
      .returning({ id: t.aiConversations.id });
    conversationId = c.id;
  }
  const convId = conversationId;

  const history = await loadHistory(convId);
  const userContent: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (image) userContent.push(imageBlock(image) as Anthropic.Beta.BetaImageBlockParam);
  userContent.push({ type: "text", text: message });
  await saveMessage(convId, "user", userContent);
  const messages: Anthropic.Beta.BetaMessageParam[] = [...history, { role: "user", content: userContent }];

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: ChatEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      send({ type: "conversation", id: convId });
      try {
        for (let step = 0; step < MAX_STEPS; step++) {
          const s = anthropic().beta.messages.stream(
            {
              model: AI_MODEL,
              max_tokens: 32000,
              system: systemPrompt(module),
              tools: anthropicTools(),
              messages,
              output_config: { effort: "medium" },
              cache_control: { type: "ephemeral" },
              betas: ["server-side-fallback-2026-07-01"],
              fallbacks: "default",
            },
            { signal: req.signal },
          );
          s.on("text", (delta) => send({ type: "text", text: delta }));
          const final = await s.finalMessage();

          messages.push({ role: "assistant", content: final.content as Anthropic.Beta.BetaContentBlockParam[] });
          await saveMessage(convId, "assistant", final.content);

          if (final.stop_reason === "refusal") {
            send({ type: "error", message: "Asistent tento požadavek odmítl." });
            break;
          }
          if (final.stop_reason === "pause_turn") continue;
          if (final.stop_reason !== "tool_use") break;

          const toolUses = final.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
          const results = await Promise.all(
            toolUses.map(async (b) => {
              send({ type: "tool", name: b.name });
              const r = await handleToolUse(user.id, convId, b);
              if (r.action) send({ type: "action", action: r.action });
              return r.result;
            }),
          );
          messages.push({ role: "user", content: results });
          await saveMessage(convId, "user", results);
        }
      } catch (e) {
        if (!req.signal.aborted) {
          console.error("ai chat", e);
          send({ type: "error", message: e instanceof Error ? e.message : "Chyba AI" });
        }
      } finally {
        send({ type: "done" });
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}

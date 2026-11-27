import type Anthropic from "@anthropic-ai/sdk";
import type OpenAI from "openai";
import { and, asc, eq } from "drizzle-orm";
import { db, t } from "@/db";
import { isoDate } from "@/lib/format";
import { TOOLS, TOOL_MAP, jsonSchema, runTool, type ToolDef } from "@/lib/ai-tools";
import { resolveEntityNames } from "@/lib/workout/service";

type BetaMessageParam = Anthropic.Beta.BetaMessageParam;
type BetaContentBlockParam = Anthropic.Beta.BetaContentBlockParam;

export const MODULE_LABEL: Record<string, string> = {
  general: "Asistent",
  workout: "AI trenér",
  nutrition: "Výživa",
  income: "Příjmy",
  portfolio: "Portfolio",
};

const FOCUS: Record<string, string> = {
  general: "Help across all areas of the user's life tracked in the app.",
  workout:
    "You are primarily acting as the user's strength coach. Analyse their training data (progress, stagnation, volume, recovery), explain your reasoning briefly, and when they agree to changes, apply them to their program with the write tools. Prefer evidence-based recommendations (progressive overload, double progression, RPE 7–9, deloads, exercise variation by movement pattern).",
  nutrition: "You are primarily acting as the user's nutrition coach. Use their targets and logs; be concrete (grams, foods common in Czechia).",
  income: "You are primarily acting as the user's financial analyst for their income sources and business events (profit, margins, trends).",
  portfolio: "You are primarily acting as the user's portfolio analyst. Describe and analyse; do not give personalised investment advice or recommend specific securities to buy or sell.",
};

export function systemPrompt(module: string) {
  return `You are the built-in assistant of AIO, a personal tracking app (training, nutrition, income, portfolio). Always reply in Czech, concise and practical, using short paragraphs or bullet lists. Use the tools to read real data before answering questions about the user's data – never invent numbers. Amounts are in CZK unless stated.

Write tools (create/update/log) do not execute immediately: each call creates a proposal card that the user approves in the UI. After proposing, tell the user briefly what you proposed and that they can approve it. Batch related changes (call several write tools in one turn) instead of asking for each one separately. If information is missing for a write (e.g. which event), ask first or look it up with read tools.

Focus: ${FOCUS[module] ?? FOCUS.general}`;
}

export function anthropicTools(): Anthropic.Beta.BetaToolUnion[] {
  return TOOLS.map((d) => ({
    name: d.name,
    description: d.description + (d.write ? " (Creates a proposal the user must approve.)" : ""),
    input_schema: jsonSchema(d),
    eager_input_streaming: true,
  }));
}

export function openaiTools(): OpenAI.Responses.FunctionTool[] {
  return TOOLS.map((d) => ({
    type: "function" as const,
    name: d.name,
    description: d.description + (d.write ? " (Creates a proposal the user must approve.)" : ""),
    parameters: jsonSchema(d) as Record<string, unknown>,
    strict: false,
  }));
}

export async function loadHistory(conversationId: string): Promise<BetaMessageParam[]> {
  const rows = await db.select().from(t.aiMessages).where(eq(t.aiMessages.conversationId, conversationId)).orderBy(asc(t.aiMessages.createdAt));
  const msgs: BetaMessageParam[] = rows.map((r) => ({ role: r.role, content: r.content as BetaContentBlockParam[] }));
  // Repair an interrupted turn: every tool_use must be answered by a tool_result in the next message.
  const out: BetaMessageParam[] = [];
  for (let i = 0; i < msgs.length; i++) {
    out.push(msgs[i]);
    const m = msgs[i];
    if (m.role !== "assistant" || !Array.isArray(m.content)) continue;
    const ids = m.content.filter((b) => b.type === "tool_use").map((b) => (b as { id: string }).id);
    if (!ids.length) continue;
    const next = msgs[i + 1];
    const answered = new Set(
      next && Array.isArray(next.content) ? next.content.filter((b) => b.type === "tool_result").map((b) => (b as { tool_use_id: string }).tool_use_id) : [],
    );
    const missing = ids.filter((id) => !answered.has(id));
    if (missing.length) {
      out.push({
        role: "user",
        content: missing.map((id) => ({ type: "tool_result" as const, tool_use_id: id, content: "Interrupted – not executed.", is_error: true })),
      });
    }
  }
  return out;
}

export async function saveMessage(conversationId: string, role: "user" | "assistant", content: unknown) {
  await db.insert(t.aiMessages).values({ conversationId, role, content });
  await db.update(t.aiConversations).set({ updatedAt: new Date() }).where(eq(t.aiConversations.id, conversationId));
}

export type ProposedAction = { id: string; tool: string; summary: string; status: "pending" | "applied" | "rejected" | "undone" };

/**
 * Approval-card text for a write tool. For workout tools the display labels the model supplied
 * (exerciseName, fromName, toName, programName, dayName, label) are replaced by the real names of the
 * ids the tool will act on, so the card shows what actually changes.
 */
async function summarize(userId: string, def: ToolDef, input: Record<string, unknown>) {
  if (!def.summarize) return def.name;
  if (def.module !== "workout") return def.summarize(input);
  const s = (k: string) => (typeof input[k] === "string" ? (input[k] as string) : undefined);
  const has = (k: string) => k in input || Object.hasOwn(def.schema.shape, k);
  try {
    const names = await resolveEntityNames(userId, {
      programExerciseId: s("programExerciseId"),
      exerciseIds: [s("exerciseId"), s("newExerciseId")].filter((x): x is string => !!x),
      programId: has("programName") ? s("programId") : undefined,
      dayId: has("dayName") ? s("dayId") : undefined,
      workoutId: has("label") ? s("workoutId") : undefined,
    });
    const fixed: Record<string, unknown> = { ...input };
    const current = names.programExercise ?? (s("exerciseId") ? names.exercises[s("exerciseId")!] : undefined);
    if (current && has("exerciseName")) fixed.exerciseName = current;
    if (names.programExercise && has("fromName")) fixed.fromName = names.programExercise;
    const to = s("newExerciseId") ? names.exercises[s("newExerciseId")!] : undefined;
    if (to && has("toName")) fixed.toName = to;
    if (names.program && has("programName")) fixed.programName = names.program;
    if (names.day && has("dayName")) fixed.dayName = names.day;
    if (names.workout && has("label")) fixed.label = names.workout;
    return def.summarize(fixed);
  } catch (e) {
    console.warn("[assistant] summary lookup failed", e);
    return def.summarize(input);
  }
}

/** Execute a tool call from the model. Read tools run; write tools become pending proposals. */
export async function handleToolUse(userId: string, conversationId: string, block: { id: string; name: string; input: unknown }) {
  const def = TOOL_MAP.get(block.name);
  if (!def) return { result: { type: "tool_result" as const, tool_use_id: block.id, content: `Unknown tool ${block.name}`, is_error: true } };

  const parsed = def.schema.safeParse(block.input ?? {});
  if (!parsed.success) {
    return {
      result: {
        type: "tool_result" as const,
        tool_use_id: block.id,
        content: `INVALID_INPUT: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
        is_error: true,
      },
    };
  }

  if (def.write) {
    const summary = await summarize(userId, def, parsed.data as Record<string, unknown>);
    const [row] = await db
      .insert(t.aiActions)
      .values({ userId, conversationId, tool: def.name, input: parsed.data, summary })
      .returning({ id: t.aiActions.id });
    const action: ProposedAction = { id: row.id, tool: def.name, summary, status: "pending" };
    return {
      action,
      result: { type: "tool_result" as const, tool_use_id: block.id, content: `Proposal ${row.id} created ("${summary}") and is waiting for the user's approval in the UI.` },
    };
  }

  try {
    const data = await def.run(userId, parsed.data);
    let text = JSON.stringify(data ?? null);
    if (text.length > 40_000) text = text.slice(0, 40_000) + "…(truncated)";
    return { result: { type: "tool_result" as const, tool_use_id: block.id, content: text } };
  } catch (e) {
    return { result: { type: "tool_result" as const, tool_use_id: block.id, content: `Error: ${e instanceof Error ? e.message : String(e)}`, is_error: true } };
  }
}

/** Apply or reject a pending proposal and leave a note in the conversation so the model knows. */
export async function resolveAction(userId: string, actionId: string, approve: boolean) {
  // Claim the proposal atomically (pending → applied/rejected) so a double click or two tabs can't apply it twice.
  const [a] = await db
    .update(t.aiActions)
    .set({ status: approve ? "applied" : "rejected" })
    .where(and(eq(t.aiActions.id, actionId), eq(t.aiActions.userId, userId), eq(t.aiActions.status, "pending")))
    .returning();
  if (!a) return { ok: false as const, error: "Návrh už není aktivní." };
  if (approve) {
    try {
      await runTool(userId, a.tool, a.input);
    } catch (e) {
      // not applied – release the claim so the user can retry (or reject) it
      await db.update(t.aiActions).set({ status: "pending" }).where(and(eq(t.aiActions.id, a.id), eq(t.aiActions.status, "applied")));
      return { ok: false as const, error: e instanceof Error ? e.message : "Chyba při provádění" };
    }
  }
  if (a.conversationId) {
    await saveMessage(a.conversationId, "user", [
      { type: "text", text: `[Note from the app, ${isoDate()}] The user ${approve ? "APPROVED and applied" : "REJECTED"} proposal ${a.id}: ${a.summary}` },
    ]);
  }
  return { ok: true as const };
}

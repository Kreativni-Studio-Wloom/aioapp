// OpenAI adapter. The app keeps conversations and prompts in the Anthropic block format
// (text / image / document / tool_use / tool_result); this file converts to and from the
// OpenAI Responses API so either provider can continue any conversation.
import type Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";
import { aiModel, type AiContent } from "./ai";

type InputItem = OpenAI.Responses.ResponseInputItem;
type UserPart = OpenAI.Responses.ResponseInputContent;
type AnyBlock = Anthropic.ContentBlockParam | Anthropic.Beta.BetaContentBlockParam;
type AnyMessage =
  | { role: "user" | "assistant"; content: string | AnyBlock[] }
  | { role: "system"; content?: string | Array<{ type: string; text?: string }> };

let _client: OpenAI | null = null;
export function openai() {
  if (!_client) _client = new OpenAI();
  return _client;
}

function toolResultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => (c && typeof c === "object" && "text" in c && typeof c.text === "string" ? c.text : ""))
      .filter(Boolean)
      .join("\n");
  }
  return JSON.stringify(content ?? null);
}

/** Anthropic-style user content block → OpenAI input part (null when it has no equivalent). */
function userPart(b: AnyBlock, docIndex: () => number): UserPart | null {
  switch (b.type) {
    case "text":
      return { type: "input_text", text: b.text };
    case "image": {
      const s = b.source as { type: string; media_type?: string; data?: string; url?: string };
      if (s.type === "base64") return { type: "input_image", detail: "auto", image_url: `data:${s.media_type};base64,${s.data}` };
      if (s.type === "url" && s.url) return { type: "input_image", detail: "auto", image_url: s.url };
      return null;
    }
    case "document": {
      const s = b.source as { type: string; media_type?: string; data?: string };
      if (s.type === "base64" && s.media_type === "application/pdf") {
        return { type: "input_file", filename: `dokument-${docIndex()}.pdf`, file_data: `data:application/pdf;base64,${s.data}` };
      }
      if (s.type === "text" && "data" in s) return { type: "input_text", text: String(s.data) };
      return null;
    }
    default:
      return null;
  }
}

/** Anthropic-format messages → OpenAI Responses input items. */
export function toOpenAIInput(messages: AnyMessage[]): InputItem[] {
  let docs = 0;
  const docIndex = () => ++docs;
  const out: InputItem[] = [];
  for (const m of messages) {
    if (m.role === "system") {
      const text = typeof m.content === "string" ? m.content : (m.content ?? []).map((c) => c.text ?? "").join("\n");
      if (text.trim()) out.push({ role: "developer", content: text });
      continue;
    }
    if (typeof m.content === "string") {
      out.push({ role: m.role, content: m.content });
      continue;
    }
    if (m.role === "user") {
      const parts: UserPart[] = [];
      for (const b of m.content) {
        if (b.type === "tool_result") {
          const text = toolResultText(b.content);
          out.push({ type: "function_call_output", call_id: b.tool_use_id, output: b.is_error ? `ERROR: ${text}` : text });
          continue;
        }
        const p = userPart(b, docIndex);
        if (p) parts.push(p);
      }
      if (parts.length) out.push({ role: "user", content: parts });
      continue;
    }
    // assistant
    let text = "";
    const flush = () => {
      if (text.trim()) out.push({ role: "assistant", content: text });
      text = "";
    };
    for (const b of m.content) {
      if (b.type === "text") text += (text ? "\n\n" : "") + b.text;
      else if (b.type === "tool_use") {
        flush();
        out.push({ type: "function_call", call_id: b.id, name: b.name, arguments: JSON.stringify(b.input ?? {}) });
      }
      // thinking / redacted / server blocks have no OpenAI equivalent – skipped
    }
    flush();
  }
  return out;
}

export type ChatStepResult = {
  /** Assistant content in the Anthropic block format (stored in ai_messages). */
  content: Anthropic.Beta.BetaContentBlockParam[];
  toolUses: { id: string; name: string; input: unknown }[];
  refused: boolean;
};

/** OpenAI response output → Anthropic-style content blocks. */
export function fromOpenAIOutput(output: OpenAI.Responses.ResponseOutputItem[]): ChatStepResult {
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  const toolUses: ChatStepResult["toolUses"] = [];
  let refused = false;
  for (const item of output) {
    if (item.type === "message") {
      for (const c of item.content) {
        if (c.type === "output_text" && c.text) content.push({ type: "text", text: c.text });
        else if (c.type === "refusal") refused = true;
      }
    } else if (item.type === "function_call") {
      let input: unknown = {};
      try {
        input = item.arguments ? JSON.parse(item.arguments) : {};
      } catch {
        input = { _raw: item.arguments };
      }
      content.push({ type: "tool_use", id: item.call_id, name: item.name, input });
      toolUses.push({ id: item.call_id, name: item.name, input });
    }
  }
  return { content, toolUses, refused: refused && !toolUses.length };
}

export async function openaiStructured<S extends z.ZodType>(opts: {
  system: string;
  content: AiContent;
  schema: S;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
}): Promise<z.infer<S>> {
  const input = toOpenAIInput([{ role: "user", content: opts.content }]);
  const res = await openai().responses.parse({
    model: aiModel("openai"),
    instructions: opts.system,
    input,
    max_output_tokens: opts.maxTokens ?? 8000,
    reasoning: { effort: opts.effort ?? "low" },
    text: { format: zodTextFormat(opts.schema, "result") },
    store: false,
  });
  const refused = res.output.some((o) => o.type === "message" && o.content.some((c) => c.type === "refusal"));
  if (refused) throw new Error("AI požadavek odmítla.");
  if (res.output_parsed == null) throw new Error("AI vrátila neplatnou odpověď.");
  return res.output_parsed as z.infer<S>;
}

/** One streamed model turn for the assistant chat. */
export async function openaiChatStep(opts: {
  system: string;
  messages: AnyMessage[];
  tools: OpenAI.Responses.FunctionTool[];
  onText: (delta: string) => void;
  signal?: AbortSignal;
}): Promise<ChatStepResult> {
  const stream = openai().responses.stream(
    {
      model: aiModel("openai"),
      instructions: opts.system,
      input: toOpenAIInput(opts.messages),
      tools: opts.tools,
      max_output_tokens: 32000,
      reasoning: { effort: "medium" },
      store: false,
    },
    { signal: opts.signal },
  );
  stream.on("response.output_text.delta", (e) => opts.onText(e.delta));
  const final = await stream.finalResponse();
  return fromOpenAIOutput(final.output);
}

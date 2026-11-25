import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";

export const AI_MODEL = process.env.AI_MODEL || "claude-opus-5-5";

export function aiEnabled() {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

let _client: Anthropic | null = null;
export function anthropic() {
  if (!_client) _client = new Anthropic();
  return _client;
}

export class AiDisabledError extends Error {
  constructor() {
    super("AI není nastavená – doplň ANTHROPIC_API_KEY do prostředí.");
  }
}

/**
 * One-shot structured extraction. `content` can mix text and images.
 * Returns parsed, schema-validated output.
 */
export async function aiStructured<S extends z.ZodType>(opts: {
  system: string;
  content: Anthropic.ContentBlockParam[] | string;
  schema: S;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
}): Promise<z.infer<S>> {
  if (!aiEnabled()) throw new AiDisabledError();
  const res = await anthropic().messages.parse({
    model: AI_MODEL,
    max_tokens: opts.maxTokens ?? 8000,
    system: opts.system,
    output_config: { format: zodOutputFormat(opts.schema), effort: opts.effort ?? "low" },
    messages: [{ role: "user", content: opts.content }],
  });
  if (res.stop_reason === "refusal") throw new Error("AI požadavek odmítla.");
  if (res.parsed_output == null) throw new Error("AI vrátila neplatnou odpověď.");
  return res.parsed_output as z.infer<S>;
}

/** Turn a data URL (from a file input / camera) into an image content block. */
export function imageBlock(dataUrl: string): Anthropic.ImageBlockParam {
  const m = dataUrl.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/);
  if (!m) throw new Error("Nepodporovaný formát obrázku");
  return { type: "image", source: { type: "base64", media_type: m[1] as "image/jpeg", data: m[2] } };
}

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";

/* ───────────────────────────── Providers ───────────────────────────── */

export const AI_PROVIDERS = ["anthropic", "openai"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];
export const AI_PROVIDER_COOKIE = "ai_provider";

export const PROVIDER_LABEL: Record<AiProvider, string> = { anthropic: "Claude (Anthropic)", openai: "ChatGPT (OpenAI)" };

/** Model per provider. `AI_MODEL` is kept as the Anthropic model for backwards compatibility. */
export function aiModel(provider: AiProvider) {
  return provider === "openai"
    ? process.env.OPENAI_MODEL || "gpt-5.5"
    : process.env.ANTHROPIC_MODEL || process.env.AI_MODEL || "claude-opus-5-5";
}
/** @deprecated use aiModel("anthropic") */
export const AI_MODEL = aiModel("anthropic");

export function providerConfigured(p: AiProvider) {
  return p === "openai" ? !!process.env.OPENAI_API_KEY : !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export function availableProviders(): AiProvider[] {
  return AI_PROVIDERS.filter(providerConfigured);
}

/** True when at least one provider has an API key. */
export function aiEnabled() {
  return availableProviders().length > 0;
}

function isProvider(v: unknown): v is AiProvider {
  return typeof v === "string" && (AI_PROVIDERS as readonly string[]).includes(v);
}

/** Server default: `AI_PROVIDER` env, else the first configured provider (Anthropic first). */
export function defaultProvider(): AiProvider | null {
  const env = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (isProvider(env) && providerConfigured(env)) return env;
  return availableProviders()[0] ?? null;
}

/**
 * Provider to use for the current request: the user's choice from Settings (cookie) when that
 * provider is configured, otherwise the server default. Works in server components, actions and
 * route handlers; outside a request it falls back to the default.
 */
export async function currentProvider(): Promise<AiProvider | null> {
  try {
    const { cookies } = await import("next/headers");
    const v = (await cookies()).get(AI_PROVIDER_COOKIE)?.value;
    if (isProvider(v) && providerConfigured(v)) return v;
  } catch {
    // not in a request scope
  }
  return defaultProvider();
}

export class AiDisabledError extends Error {
  constructor() {
    super("AI není nastavená – doplň ANTHROPIC_API_KEY nebo OPENAI_API_KEY do prostředí.");
  }
}

/* ───────────────────────────── Clients ───────────────────────────── */

let _client: Anthropic | null = null;
export function anthropic() {
  if (!_client) _client = new Anthropic();
  return _client;
}

/* ───────────────────────────── Structured output ───────────────────────────── */

/**
 * Provider-neutral input content. Uses the Anthropic block shape (text / image / PDF document);
 * the OpenAI adapter converts it.
 */
export type AiContent = Anthropic.ContentBlockParam[] | string;

/**
 * One-shot structured extraction. `content` can mix text, images and PDFs.
 * Returns parsed, schema-validated output.
 */
export async function aiStructured<S extends z.ZodType>(opts: {
  system: string;
  content: AiContent;
  schema: S;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
  provider?: AiProvider;
}): Promise<z.infer<S>> {
  const provider = opts.provider ?? (await currentProvider());
  if (!provider || !providerConfigured(provider)) throw new AiDisabledError();

  if (provider === "openai") {
    const { openaiStructured } = await import("./ai-openai");
    return openaiStructured(opts);
  }

  const res = await anthropic().messages.parse({
    model: aiModel("anthropic"),
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

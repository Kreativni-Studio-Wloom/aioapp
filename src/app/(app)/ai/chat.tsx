"use client";

import { useEffect, useRef, useState, useTransition, Fragment, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, Check, ImagePlus, X, Trash2, History } from "lucide-react";
import { Button, Select } from "@/components/ui";
import { Sheet, Spinner } from "@/components/ui/client";
import { cn } from "@/lib/utils";
import type { ProposedAction } from "@/lib/assistant";
import type { ChatEvent } from "@/app/api/ai/chat/route";
import { approveAction, rejectAction, deleteConversation } from "./actions";

export type UiMessage = { id: string; role: "user" | "assistant"; text: string; hasImage?: boolean };

const MODULES = [
  { value: "general", label: "Asistent" },
  { value: "workout", label: "AI trenér" },
  { value: "nutrition", label: "Výživa" },
  { value: "income", label: "Příjmy" },
  { value: "portfolio", label: "Portfolio" },
];

const SUGGESTIONS: Record<string, string[]> = {
  general: ["Jak jsem na tom tento týden?", "Shrň mi tento měsíc ve všech oblastech"],
  workout: ["Projdi můj trénink a navrhni úpravy", "Kde stagnuju a co s tím?", "Bolí mě rameno, uprav mi push day"],
  nutrition: ["Co mám dnes ještě sníst, abych dobral bílkoviny?", "Jak se drží můj příjem vs. cíl za poslední týden?"],
  income: ["Který event byl letos nejvýnosnější?", "Jaký je můj průměrný měsíční čistý příjem?"],
  portfolio: ["Popiš mi alokaci portfolia", "Jak se vyvíjí moje čisté jmění?"],
};

const TOOL_LABEL: Record<string, string> = {
  get_overview: "Načítám přehled",
  get_program: "Čtu program",
  list_programs: "Čtu programy",
  get_recent_workouts: "Čtu tréninky",
  get_exercise_history: "Analyzuji progres",
  get_stagnation: "Hledám stagnaci",
  search_exercises: "Hledám cviky",
  get_alternatives: "Hledám alternativy",
  get_nutrition_day: "Čtu jídelníček",
  get_income_overview: "Počítám příjmy",
  get_portfolio: "Čtu portfolio",
};

/* Minimal markdown: paragraphs, bullet/numbered lists, **bold**, `code`, ### headings */
function inline(s: string) {
  const parts = s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? (
      <strong key={i} className="font-semibold text-fg">
        {p.slice(2, -2)}
      </strong>
    ) : p.startsWith("`") && p.endsWith("`") ? (
      <code key={i} className="rounded bg-bg-elev px-1 text-[0.9em]">
        {p.slice(1, -1)}
      </code>
    ) : (
      <Fragment key={i}>{p}</Fragment>
    ),
  );
}

function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.split("\n");
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const L = list;
    blocks.push(
      L.ordered ? (
        <ol key={blocks.length} className="ml-5 list-decimal space-y-1">
          {L.items.map((it, i) => (
            <li key={i}>{inline(it)}</li>
          ))}
        </ol>
      ) : (
        <ul key={blocks.length} className="ml-5 list-disc space-y-1 marker:text-subtle">
          {L.items.map((it, i) => (
            <li key={i}>{inline(it)}</li>
          ))}
        </ul>
      ),
    );
    list = null;
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const ul = line.match(/^\s*[-*•]\s+(.*)/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)/);
    if (ul || ol) {
      const ordered = !!ol;
      if (!list || list.ordered !== ordered) {
        flush();
        list = { ordered, items: [] };
      }
      list.items.push((ul ?? ol)![1]);
      continue;
    }
    flush();
    if (!line.trim()) continue;
    const h = line.match(/^#{1,4}\s+(.*)/);
    if (h)
      blocks.push(
        <div key={blocks.length} className="pt-1 font-semibold text-fg">
          {inline(h[1])}
        </div>,
      );
    else blocks.push(<p key={blocks.length}>{inline(line)}</p>);
  }
  flush();
  return <div className="space-y-2.5">{blocks}</div>;
}

async function fileToDataUrl(file: File, max = 1280): Promise<string> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

function ActionCard({ action, onChange }: { action: ProposedAction; onChange: (a: ProposedAction) => void }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3 rounded-2xl border border-line-strong bg-bg-elev p-3">
      <div className="min-w-0 flex-1">
        <div className="text-[11px] uppercase tracking-wider text-muted">
          {action.status === "pending" ? "Návrh změny" : action.status === "applied" ? "Provedeno" : "Zamítnuto"}
        </div>
        <div className={cn("text-sm", action.status === "rejected" && "text-muted line-through")}>{action.summary}</div>
        {error && <div className="mt-1 text-xs text-neg">{error}</div>}
      </div>
      {action.status === "pending" ? (
        <div className="flex shrink-0 gap-1.5">
          <Button
            size="icon"
            variant="secondary"
            aria-label="Zamítnout"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await rejectAction(action.id);
                if (r.ok) onChange({ ...action, status: "rejected" });
              })
            }
          >
            <X className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            aria-label="Použít"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await approveAction(action.id);
                if (r.ok) onChange({ ...action, status: "applied" });
                else setError(r.error);
              })
            }
          >
            {pending ? <Spinner /> : <Check className="h-4 w-4" />}
          </Button>
        </div>
      ) : action.status === "applied" ? (
        <Check className="h-4 w-4 shrink-0 text-pos" />
      ) : null}
    </motion.div>
  );
}

export function Chat(props: {
  enabled: boolean;
  module: string;
  conversationId?: string;
  initialMessages: UiMessage[];
  initialActions: ProposedAction[];
  conversations: { id: string; title: string; module: string }[];
}) {
  const router = useRouter();
  const [module, setModule] = useState(props.module);
  const [conversationId, setConversationId] = useState(props.conversationId);
  const [messages, setMessages] = useState<UiMessage[]>(props.initialMessages);
  const [actions, setActions] = useState<ProposedAction[]>(props.initialActions);
  const [input, setInput] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [applyingAll, startApplyAll] = useTransition();

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, actions, status]);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    setError(null);
    setBusy(true);
    setStatus("Přemýšlím");
    const userMsg: UiMessage = { id: crypto.randomUUID(), role: "user", text, hasImage: !!image };
    const asstId = crypto.randomUUID();
    setMessages((m) => [...m, userMsg, { id: asstId, role: "assistant", text: "" }]);
    setInput("");
    const img = image;
    setImage(null);
    abort.current = new AbortController();
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId, module, message: text, image: img ?? undefined }),
        signal: abort.current.signal,
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Chyba serveru");
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const e = JSON.parse(line) as ChatEvent;
          if (e.type === "conversation") {
            if (!conversationId) {
              setConversationId(e.id);
              window.history.replaceState(null, "", `/ai?c=${e.id}`);
            }
          } else if (e.type === "text") {
            setStatus(null);
            setMessages((m) => m.map((x) => (x.id === asstId ? { ...x, text: x.text + e.text } : x)));
          } else if (e.type === "tool") {
            setStatus(TOOL_LABEL[e.name] ?? "Pracuji s daty");
            setMessages((m) => m.map((x) => (x.id === asstId && x.text && !x.text.endsWith("\n\n") ? { ...x, text: x.text + "\n\n" } : x)));
          } else if (e.type === "action") {
            setActions((a) => [...a, e.action]);
          } else if (e.type === "error") {
            setError(e.message);
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      setMessages((m) => m.filter((x) => !(x.id === asstId && !x.text.trim())));
      setBusy(false);
      setStatus(null);
      abort.current = null;
    }
  }

  const pending = actions.filter((a) => a.status === "pending");
  const empty = messages.length === 0;

  return (
    <div className="flex min-h-[calc(100dvh-10rem)] flex-col md:min-h-[calc(100dvh-5rem)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-[28px] font-semibold tracking-tight md:text-3xl">{MODULES.find((m) => m.value === module)?.label ?? "Asistent"}</h1>
        <div className="flex items-center gap-2">
          {empty && !conversationId ? (
            <Select value={module} onChange={(e) => setModule(e.target.value)} className="h-9 w-36 text-sm md:h-9">
              {MODULES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Select>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => router.push(`/ai?module=${module}`)}>
              Nová
            </Button>
          )}
          <Button size="icon" variant="ghost" className="md:hidden" onClick={() => setHistoryOpen(true)} aria-label="Historie">
            <History className="h-5 w-5" />
          </Button>
          {conversationId && (
            <Button
              size="icon"
              variant="ghost"
              aria-label="Smazat konverzaci"
              onClick={async () => {
                await deleteConversation(conversationId);
                router.push(`/ai?module=${module}`);
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {!props.enabled && (
        <div className="mb-4 rounded-2xl border border-dashed border-line-strong p-4 text-sm text-muted">
          AI zatím není zapnutá. Doplň <code className="text-fg-soft">ANTHROPIC_API_KEY</code> nebo <code className="text-fg-soft">OPENAI_API_KEY</code> do proměnných prostředí serveru (lokálně <code>.env.local</code>, na Vercelu v Settings → Environment Variables).
        </div>
      )}

      <div className="flex-1 space-y-5">
        {empty && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pt-6">
            <p className="mb-4 text-sm text-muted">Asistent vidí tvoje data a umí navrhovat změny, které jedním klepnutím schválíš.</p>
            <div className="flex flex-wrap gap-2">
              {(SUGGESTIONS[module] ?? SUGGESTIONS.general).map((s) => (
                <button key={s} onClick={() => send(s)} disabled={!props.enabled} className="rounded-full border border-line-strong px-3.5 py-2 text-left text-sm text-fg-soft transition-colors hover:bg-card disabled:opacity-40">
                  {s}
                </button>
              ))}
            </div>
          </motion.div>
        )}
        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className={cn("flex", m.role === "user" && "justify-end")}>
              {m.role === "user" ? (
                <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-fg px-4 py-2.5 text-[15px] text-inverse">
                  {m.hasImage && <div className="mb-1 text-xs opacity-60">📷 obrázek</div>}
                  {m.text}
                </div>
              ) : (
                <div className="max-w-full text-[15px] leading-relaxed text-fg-soft">
                  <Markdown text={m.text} />
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {status && (
          <div className="flex items-center gap-2 text-sm text-muted">
            <Spinner className="h-3.5 w-3.5" /> {status}…
          </div>
        )}

        {actions.length > 0 && (
          <div className="space-y-2">
            {pending.length > 1 && (
              <div className="flex justify-end">
                <Button
                  size="sm"
                  disabled={applyingAll}
                  onClick={() =>
                    startApplyAll(async () => {
                      for (const a of pending) {
                        const r = await approveAction(a.id);
                        if (r.ok) setActions((all) => all.map((x) => (x.id === a.id ? { ...x, status: "applied" } : x)));
                      }
                    })
                  }
                >
                  {applyingAll ? <Spinner /> : <Check className="h-4 w-4" />} Použít vše ({pending.length})
                </Button>
              </div>
            )}
            {actions.map((a) => (
              <ActionCard key={a.id} action={a} onChange={(n) => setActions((all) => all.map((x) => (x.id === n.id ? n : x)))} />
            ))}
          </div>
        )}
        {error && <div className="text-sm text-neg">{error}</div>}
        <div ref={bottom} className="h-2" />
      </div>

      <div className="sticky bottom-[calc(var(--tabbar-space)+0.875rem)] mt-4 md:bottom-6">
        <AnimatePresence>
          {image && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mb-2 flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image} alt="" className="h-14 w-14 rounded-xl object-cover" />
              <button onClick={() => setImage(null)} className="text-sm text-muted">
                Odebrat
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-end gap-2 rounded-2xl border border-line-strong bg-bg-elev p-2 shadow-[0_8px_30px_rgba(0,0,0,0.25)]"
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) setImage(await fileToDataUrl(f));
              e.target.value = "";
            }}
          />
          <Button type="button" size="icon" variant="ghost" onClick={() => fileRef.current?.click()} aria-label="Přidat obrázek" disabled={!props.enabled}>
            <ImagePlus className="h-5 w-5" />
          </Button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !("ontouchstart" in window)) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            placeholder={props.enabled ? "Napiš zprávu…" : "AI není nastavená"}
            disabled={!props.enabled}
            className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-1 py-2 text-fg outline-none placeholder:text-subtle"
          />
          {busy ? (
            <Button type="button" size="icon" variant="secondary" onClick={() => abort.current?.abort()} aria-label="Zastavit">
              <X className="h-4 w-4" />
            </Button>
          ) : (
            <Button type="submit" size="icon" disabled={!input.trim() || !props.enabled} aria-label="Odeslat">
              <ArrowUp className="h-4 w-4" />
            </Button>
          )}
        </form>
        <p className="mt-1.5 text-center text-[11px] text-subtle">
          Odpovídá umělá inteligence (Claude od Anthropic nebo ChatGPT od OpenAI – podle Nastavení) a může se mýlit. Změny dat provede až po tvém schválení.
        </p>
      </div>

      <Sheet open={historyOpen} onClose={() => setHistoryOpen(false)} title="Konverzace">
        <div className="flex flex-col gap-1">
          {props.conversations.length === 0 && <div className="text-sm text-muted">Zatím žádné.</div>}
          {props.conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                setHistoryOpen(false);
                router.push(`/ai?c=${c.id}`);
              }}
              className="rounded-xl px-3 py-2.5 text-left text-sm hover:bg-card"
            >
              <div className="truncate">{c.title}</div>
              <div className="text-xs text-muted">{MODULES.find((m) => m.value === c.module)?.label}</div>
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}

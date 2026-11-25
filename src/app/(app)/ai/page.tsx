import Link from "next/link";
import { and, asc, desc, eq } from "drizzle-orm";
import { db, t } from "@/db";
import { requireUser } from "@/lib/auth";
import { aiEnabled } from "@/lib/ai";
import { MODULE_LABEL, type ProposedAction } from "@/lib/assistant";
import { dateLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Chat, type UiMessage } from "./chat";

export const metadata = { title: "AI asistent" };

type Block = { type: string; text?: string; content?: unknown };

/** Convert stored API messages into simple chat bubbles (hide tool plumbing & app notes). */
function toUi(rows: { id: string; role: "user" | "assistant"; content: unknown }[]): UiMessage[] {
  const out: UiMessage[] = [];
  for (const r of rows) {
    const blocks = (r.content as Block[]) ?? [];
    const text = blocks
      .filter((b) => b.type === "text" && b.text && !b.text.startsWith("[Note from the app"))
      .map((b) => b.text)
      .join("\n\n");
    const hasImage = blocks.some((b) => b.type === "image");
    if (!text && !hasImage) continue;
    const last = out[out.length - 1];
    if (last && last.role === r.role && r.role === "assistant") last.text += "\n\n" + text;
    else out.push({ id: r.id, role: r.role, text, hasImage });
  }
  return out;
}

export default async function AiPage({ searchParams }: PageProps<"/ai">) {
  const user = await requireUser();
  const sp = await searchParams;
  const requestedModule = typeof sp.module === "string" && sp.module in MODULE_LABEL ? sp.module : "general";
  const cid = typeof sp.c === "string" ? sp.c : undefined;

  const conversations = await db
    .select()
    .from(t.aiConversations)
    .where(eq(t.aiConversations.userId, user.id))
    .orderBy(desc(t.aiConversations.updatedAt))
    .limit(30);

  let current: (typeof conversations)[number] | undefined;
  let messages: UiMessage[] = [];
  let actions: ProposedAction[] = [];
  if (cid) {
    current = conversations.find((c) => c.id === cid);
    if (current) {
      const rows = await db.select().from(t.aiMessages).where(eq(t.aiMessages.conversationId, current.id)).orderBy(asc(t.aiMessages.createdAt));
      messages = toUi(rows);
      actions = (
        await db
          .select()
          .from(t.aiActions)
          .where(and(eq(t.aiActions.conversationId, current.id), eq(t.aiActions.userId, user.id)))
          .orderBy(asc(t.aiActions.createdAt))
      ).map((a) => ({ id: a.id, tool: a.tool, summary: a.summary, status: a.status }));
    }
  }
  const activeModule = current?.module ?? requestedModule;

  return (
    <div className="md:grid md:grid-cols-[220px_1fr] md:gap-8">
      <aside className="hidden md:block">
        <Link href={`/ai?module=${activeModule}`} className="mb-4 flex h-10 items-center justify-center rounded-xl bg-fg text-sm font-medium text-inverse">
          Nová konverzace
        </Link>
        <div className="flex flex-col gap-0.5">
          {conversations.map((c) => (
            <Link
              key={c.id}
              href={`/ai?c=${c.id}`}
              className={cn("rounded-lg px-3 py-2 text-sm transition-colors", c.id === current?.id ? "bg-card text-fg" : "text-muted hover:text-fg")}
            >
              <div className="truncate">{c.title}</div>
              <div className="text-[11px] text-subtle">
                {MODULE_LABEL[c.module] ?? c.module} · {dateLabel(c.updatedAt)}
              </div>
            </Link>
          ))}
        </div>
      </aside>
      <Chat
        key={current?.id ?? `new-${activeModule}`}
        enabled={aiEnabled()}
        module={activeModule}
        conversationId={current?.id}
        initialMessages={messages}
        initialActions={actions}
        conversations={conversations.map((c) => ({ id: c.id, title: c.title, module: c.module }))}
      />
    </div>
  );
}

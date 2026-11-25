import { getUser } from "@/lib/auth";
import { isoDate } from "@/lib/format";
import { listTransactions } from "@/lib/income/service";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Czech-Excel friendly number: decimal comma, no thousands separator. */
const n = (v: number, decimals = 2) => (Math.round(v * 10 ** decimals) / 10 ** decimals).toString().replace(".", ",");

function cell(v: string | number | null | undefined) {
  const s = v == null ? "" : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const sp = new URL(req.url).searchParams;
  const from = sp.get("from") ?? undefined;
  const to = sp.get("to") ?? undefined;
  const kind = sp.get("kind");
  const source = sp.get("source") ?? undefined;
  const rows = await listTransactions(user.id, {
    from: from && DATE.test(from) ? from : undefined,
    to: to && DATE.test(to) ? to : undefined,
    kind: kind === "income" || kind === "expense" ? kind : undefined,
    sourceId: source && (source === "none" || /^[0-9a-f-]{36}$/.test(source)) ? source : undefined,
    eventId: sp.get("event") && /^[0-9a-f-]{36}$/.test(sp.get("event")!) ? sp.get("event")! : undefined,
    category: sp.get("category") ?? undefined,
    limit: 5000,
  });

  const header = ["Datum", "Typ", "Částka", "Měna", "Kurz", "Částka CZK", "Zdroj", "Akce", "Kategorie", "Poznámka"];
  const lines = [header.join(";")];
  for (const r of rows) {
    const sign = r.kind === "expense" ? -1 : 1;
    lines.push(
      [
        r.date,
        r.kind === "income" ? "Příjem" : "Výdaj",
        n(sign * r.amount),
        r.currency,
        n(r.fxRate, 4),
        n(sign * r.amountCzk),
        r.sourceName,
        r.eventName,
        r.category,
        r.note,
      ]
        .map(cell)
        .join(";"),
    );
  }
  const body = "﻿" + lines.join("\r\n") + "\r\n";
  const name = `prijmy-${from ?? "vse"}${to ? `_${to}` : ""}-${isoDate()}.csv`;
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}

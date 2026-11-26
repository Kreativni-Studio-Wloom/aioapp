import { getUser } from "@/lib/auth";
import { isoDate } from "@/lib/format";
import { isValidIsoDate, listTransactions, type TransactionFilter } from "@/lib/income/service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = 5000;
/** Hard safety stop (rows) – far above any realistic personal history. */
const MAX_ROWS = 500_000;

/** Czech-Excel friendly number: decimal comma, no thousands separator. Never formula-escaped. */
const n = (v: number, decimals = 2) => (Math.round(v * 10 ** decimals) / 10 ** decimals).toString().replace(".", ",");

/** Text cell: neutralise spreadsheet formulas (=, +, -, @, tab, CR) and quote when needed. */
function text(v: string | null | undefined) {
  let s = v ?? "";
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return quote(s);
}
const quote = (s: string) => (/[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const sp = new URL(req.url).searchParams;
  const rawFrom = sp.get("from");
  const rawTo = sp.get("to");
  if ((rawFrom && !isValidIsoDate(rawFrom)) || (rawTo && !isValidIsoDate(rawTo))) {
    return new Response("Neplatné datum (očekáváno RRRR-MM-DD)", { status: 400 });
  }
  const from = rawFrom || undefined;
  const to = rawTo || undefined;
  const kind = sp.get("kind");
  const source = sp.get("source");
  const event = sp.get("event");
  const filter: TransactionFilter = {
    from,
    to,
    kind: kind === "income" || kind === "expense" ? kind : undefined,
    sourceId: source && (source === "none" || UUID.test(source)) ? source : undefined,
    eventId: event && UUID.test(event) ? event : undefined,
    category: sp.get("category")?.slice(0, 200) || undefined,
  };

  const header = ["Datum", "Typ", "Částka", "Měna", "Kurz", "Částka CZK", "Zdroj", "Akce", "Kategorie", "Poznámka"];
  const lines = [header.join(";")];
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE) {
    const rows = await listTransactions(user.id, { ...filter, limit: PAGE, offset });
    for (const r of rows) {
      const sign = r.kind === "expense" ? -1 : 1;
      lines.push(
        [
          r.date,
          r.kind === "income" ? "Příjem" : "Výdaj",
          n(sign * r.amount),
          text(r.currency),
          n(r.fxRate, 4),
          n(sign * r.amountCzk),
          text(r.sourceName),
          text(r.eventName),
          text(r.category),
          text(r.note),
        ].join(";"),
      );
    }
    if (rows.length < PAGE) break;
  }
  const body = "﻿" + lines.join("\r\n") + "\r\n";
  // from/to are validated YYYY-MM-DD → the filename is plain ASCII
  const name = `prijmy-${from ?? "vse"}${to ? `_${to}` : ""}-${isoDate()}.csv`;
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}

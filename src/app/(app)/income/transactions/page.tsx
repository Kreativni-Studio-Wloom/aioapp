import Link from "next/link";
import { Download } from "lucide-react";
import { Card, Field, Input, Select, Stat, buttonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { addDays, isoDate, money } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TxKind } from "@/lib/income/constants";
import { addMonths, isValidIsoDate, listSources, listTransactions, monthEnd, sumTransactions } from "@/lib/income/service";
import { IncomeHeader, SignedMoney } from "../_components/bits";
import { TxList } from "../_components/tx-list";

type SP = { from?: string; to?: string; source?: string; kind?: string; category?: string };
type Props = { searchParams: Promise<SP> };

const LIMIT = 300;
const validDate = (s?: string) => (isValidIsoDate(s) ? s : undefined);

export default async function TransactionsPage({ searchParams }: Props) {
  const user = await requireUser();
  const sp = await searchParams;
  const from = validDate(sp.from);
  const to = validDate(sp.to);
  const kind = sp.kind === "income" || sp.kind === "expense" ? (sp.kind as TxKind) : undefined;
  const sourceId = sp.source && (sp.source === "none" || /^[0-9a-f-]{36}$/.test(sp.source)) ? sp.source : undefined;
  const category = sp.category?.trim() || undefined;
  const filter = { from, to, kind, sourceId, category };

  const [items, sum, sources] = await Promise.all([
    listTransactions(user.id, { ...filter, limit: LIMIT }),
    sumTransactions(user.id, filter),
    listSources(user.id, { includeArchived: true }),
  ]);

  const today = isoDate();
  const ym = today.slice(0, 7);
  const y = today.slice(0, 4);
  const presets = [
    { label: "Tento měsíc", from: `${ym}-01`, to: monthEnd(ym) },
    { label: "Minulý měsíc", from: `${addMonths(ym, -1)}-01`, to: monthEnd(addMonths(ym, -1)) },
    { label: "30 dní", from: addDays(today, -29), to: today },
    { label: "Letos", from: `${y}-01-01`, to: `${y}-12-31` },
    { label: "Loni", from: `${Number(y) - 1}-01-01`, to: `${Number(y) - 1}-12-31` },
    { label: "Vše", from: undefined, to: undefined },
  ];
  const qs = (p: Partial<SP>) => {
    const q = new URLSearchParams();
    const merged = { from, to, source: sourceId, kind, category, ...p };
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    return q.toString();
  };
  const exportQs = qs({});

  return (
    <>
      <IncomeHeader
        title="Transakce"
        action={
          <Link href={`/income/export${exportQs ? `?${exportQs}` : ""}`} prefetch={false} className={buttonClass("secondary", "sm")}>
            <Download className="h-4 w-4" /> CSV
          </Link>
        }
      />

      <div className="-mx-4 mb-3 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0">
        <div className="flex w-max gap-1.5">
          {presets.map((p) => {
            const active = p.from === from && p.to === to;
            return (
              <Link
                key={p.label}
                href={`/income/transactions?${qs({ from: p.from, to: p.to })}`}
                className={cn(
                  "flex h-9 items-center rounded-full border px-3.5 text-sm transition-colors",
                  active ? "border-fg bg-fg text-inverse" : "border-line text-fg-soft hover:border-line-strong hover:text-fg",
                )}
              >
                {p.label}
              </Link>
            );
          })}
        </div>
      </div>

      <form method="get" className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5 md:items-end">
        <Field label="Od">
          <Input type="date" name="from" defaultValue={from} />
        </Field>
        <Field label="Do">
          <Input type="date" name="to" defaultValue={to} />
        </Field>
        <Field label="Zdroj">
          <Select name="source" defaultValue={sourceId ?? ""}>
            <option value="">Všechny</option>
            <option value="none">Bez zdroje</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.archived ? " (archiv)" : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Typ">
          <Select name="kind" defaultValue={kind ?? ""}>
            <option value="">Vše</option>
            <option value="income">Příjmy</option>
            <option value="expense">Výdaje</option>
          </Select>
        </Field>
        {category && <input type="hidden" name="category" value={category} />}
        <button type="submit" className={buttonClass("primary", "md", "col-span-2 md:col-span-1")}>
          Filtrovat
        </button>
      </form>

      {category && (
        <p className="mb-3 text-sm text-muted">
          Kategorie: <span className="text-fg">{category}</span> ·{" "}
          <Link href={`/income/transactions?${qs({ category: undefined })}`} className="underline">
            zrušit
          </Link>
        </p>
      )}

      <Card className="mb-3 grid grid-cols-3 gap-3">
        <Stat label="Příjmy" value={money(sum.income)} />
        <Stat label="Výdaje" value={money(sum.expense)} />
        <Stat label="Čistý" value={<SignedMoney value={sum.net} />} sub={`${sum.count} transakcí`} />
      </Card>

      <Card className="py-2 md:py-2">
        <TxList items={items} empty="Žádné transakce pro tento filtr" />
      </Card>
      {sum.count > LIMIT && (
        <p className="mt-3 text-center text-xs text-muted">
          Zobrazeno posledních {LIMIT} z {sum.count}. Zúž filtr nebo stáhni CSV.
        </p>
      )}
    </>
  );
}

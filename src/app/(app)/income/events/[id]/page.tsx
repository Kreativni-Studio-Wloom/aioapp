import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin, Plus } from "lucide-react";
import { Card, SectionTitle, Stat } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { isoDate, money, pct } from "@/lib/format";
import { EVENT_CATEGORIES } from "@/lib/income/constants";
import { IncomeError, getEventStats, listSources } from "@/lib/income/service";
import { IncomeHeader, ShareRow, SignedMoney, eventDates } from "../../_components/bits";
import { DeleteEventButton, EventButton } from "../../_components/forms";
import { AddTxButton } from "../../_components/tx-sheet";
import { TxList } from "../../_components/tx-list";

type Props = { params: Promise<{ id: string }> };

export default async function EventPage({ params }: Props) {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();

  let stats;
  try {
    stats = await getEventStats(user.id, id);
  } catch (e) {
    if (e instanceof IncomeError) notFound();
    throw e;
  }
  const { event, totals, days, profitPerDay, byCategory, transactions } = stats;
  const sources = (await listSources(user.id)).filter((s) => s.type === "business").map((s) => ({ id: s.id, name: s.name }));
  if (!sources.some((s) => s.id === event.sourceId)) sources.push({ id: event.sourceId, name: event.sourceName });

  const today = isoDate();
  // default date for new entries: today while the event runs, otherwise its first day
  const defaultDate = event.startDate <= today && (event.endDate ?? event.startDate) >= today ? today : event.startDate;
  const base = { sourceId: event.sourceId, eventId: event.id, date: defaultDate };
  const incomeCats = byCategory.filter((c) => c.kind === "income");
  const expenseCats = byCategory.filter((c) => c.kind === "expense");

  return (
    <>
      <IncomeHeader
        back="/income/events"
        title={event.name}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-x-1.5">
            <span>{eventDates(event)}</span>
            {event.location && (
              <>
                <span>·</span>
                <MapPin className="h-3.5 w-3.5" />
                <span>{event.location}</span>
              </>
            )}
            <span>·</span>
            <Link href={`/income/sources/${event.sourceId}`} className="underline-offset-2 hover:text-fg hover:underline">
              {event.sourceName}
            </Link>
          </span>
        }
        action={<EventButton event={event} sources={sources} variant="ghost" size="icon" />}
      />
      {event.notes && <p className="-mt-3 mb-5 whitespace-pre-line text-sm text-fg-soft">{event.notes}</p>}

      <Card>
        <div className="text-xs text-muted">Čistý zisk</div>
        <div className="mt-1 text-4xl font-semibold tracking-tight">
          <SignedMoney value={totals.net} />
        </div>
        <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat label="Tržby" value={money(totals.income)} />
          <Stat label="Náklady" value={money(totals.expense)} />
          <Stat label="Marže" value={totals.margin != null ? pct(totals.margin, 0) : "–"} />
          <Stat label="Zisk na den" value={<SignedMoney value={profitPerDay} />} sub={`${days} ${days === 1 ? "den" : days < 5 ? "dny" : "dní"}`} />
        </div>
      </Card>

      <SectionTitle className="mt-8">Rychle přidat</SectionTitle>
      <div className="flex flex-wrap gap-2">
        {EVENT_CATEGORIES.income.slice(0, 1).map((c) => (
          <AddTxButton key={c} defaults={{ ...base, kind: "income", category: c }} variant="primary" size="md">
            <Plus className="h-4 w-4" /> {c}
          </AddTxButton>
        ))}
        {EVENT_CATEGORIES.expense
          .filter((c) => c !== "Ostatní")
          .map((c) => (
            <AddTxButton key={c} defaults={{ ...base, kind: "expense", category: c }} variant="secondary" size="md">
              <Plus className="h-4 w-4" /> {c}
            </AddTxButton>
          ))}
        <AddTxButton defaults={{ ...base, kind: "expense" }} variant="outline" size="md">
          <Plus className="h-4 w-4" /> Jiný
        </AddTxButton>
      </div>

      {byCategory.length > 0 && (
        <div className="mt-8 grid gap-x-6 md:grid-cols-2">
          <div>
            <SectionTitle>Tržby</SectionTitle>
            <Card>
              {incomeCats.length ? (
                incomeCats.map((c) => (
                  <ShareRow key={c.category} label={c.category} value={money(c.total)} share={totals.income ? (c.total / totals.income) * 100 : 0} />
                ))
              ) : (
                <p className="py-4 text-center text-sm text-muted">Žádné tržby</p>
              )}
            </Card>
          </div>
          <div>
            <SectionTitle>Náklady</SectionTitle>
            <Card>
              {expenseCats.length ? (
                expenseCats.map((c) => (
                  <ShareRow
                    key={c.category}
                    label={c.category}
                    value={money(c.total)}
                    share={totals.expense ? (c.total / totals.expense) * 100 : 0}
                    sub={totals.income > 0 ? `${pct((c.total / totals.income) * 100, 0)} tržeb` : undefined}
                  />
                ))
              ) : (
                <p className="py-4 text-center text-sm text-muted">Žádné náklady</p>
              )}
            </Card>
          </div>
        </div>
      )}

      <SectionTitle>Transakce ({transactions.length})</SectionTitle>
      <Card className="py-2 md:py-2">
        <TxList items={transactions} hideSource hideEvent empty="Zatím nic – přidej tržbu nebo náklad" />
      </Card>

      <div className="mt-10 border-t border-line pt-6">
        <DeleteEventButton eventId={event.id} hasTransactions={transactions.length > 0} />
      </div>
    </>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, SectionTitle, Stat } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { money, pct } from "@/lib/format";
import { SOURCE_TYPE_LABEL } from "@/lib/income/constants";
import { IncomeError, getSourceStats, listEvents, listRecurringRules, listSources, listTransactions } from "@/lib/income/service";
import { EventRow, IncomeHeader, SignedMoney } from "../../_components/bits";
import { EventButton, RuleButton, RuleRow, SourceButton, SourceDangerZone } from "../../_components/forms";
import { ChartLegend, MonthlyChart } from "../../_components/monthly-chart";
import { AddTxButton } from "../../_components/tx-sheet";
import { TxList } from "../../_components/tx-list";

type Props = { params: Promise<{ id: string }> };

export default async function SourcePage({ params }: Props) {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();

  let stats;
  try {
    stats = await getSourceStats(user.id, id);
  } catch (e) {
    if (e instanceof IncomeError) notFound();
    throw e;
  }
  const { source, totals, monthly } = stats;
  const isBusiness = source.type === "business";
  const [events, rules, txs, allSources] = await Promise.all([
    isBusiness ? listEvents(user.id, id) : Promise.resolve([]),
    listRecurringRules(user.id, id),
    listTransactions(user.id, { sourceId: id, limit: 50 }),
    listSources(user.id),
  ]);
  const sourceOpts = allSources.map((s) => ({ id: s.id, name: s.name }));
  const businessOpts = allSources.filter((s) => s.type === "business").map((s) => ({ id: s.id, name: s.name }));
  if (!businessOpts.some((s) => s.id === id) && isBusiness) businessOpts.push({ id, name: source.name });

  return (
    <>
      <IncomeHeader
        back="/income/sources"
        title={source.name}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <Badge>{SOURCE_TYPE_LABEL[source.type]}</Badge>
            {source.currency !== "CZK" && <Badge>{source.currency}</Badge>}
            {source.archived && <Badge>Archiv</Badge>}
          </span>
        }
        action={
          <>
            <SourceButton source={source} variant="ghost" size="icon" />
            <AddTxButton defaults={{ sourceId: id }} variant="primary" />
          </>
        }
      />
      {source.notes && <p className="-mt-3 mb-5 whitespace-pre-line text-sm text-fg-soft">{source.notes}</p>}

      <Card className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Příjmy celkem" value={money(totals.income)} />
        <Stat label="Výdaje celkem" value={money(totals.expense)} />
        <Stat label="Čistý zisk" value={<SignedMoney value={totals.net} />} sub={totals.margin != null ? `marže ${pct(totals.margin, 0)}` : undefined} />
        <Stat label="Průměr / měsíc" value={money(stats.avgMonthlyNet12m)} sub="čistého, 12 m" />
      </Card>

      <SectionTitle className="mt-8" action={<ChartLegend />}>
        Posledních 12 měsíců
      </SectionTitle>
      <Card>
        <MonthlyChart data={monthly} height={200} />
      </Card>

      {isBusiness && (
        <>
          <SectionTitle
            action={
              <div className="flex items-center gap-3">
                {events.length > 0 && (
                  <Link href={`/income/events?source=${id}`} className="text-xs text-muted hover:text-fg">
                    Analýza
                  </Link>
                )}
                <EventButton sources={businessOpts} sourceId={id} variant="secondary" />
              </div>
            }
          >
            Akce ({events.length})
          </SectionTitle>
          <Card className="py-2 md:py-2">
            {events.length ? (
              events.slice(0, 12).map((e) => <EventRow key={e.id} e={e} />)
            ) : (
              <p className="py-6 text-center text-sm text-muted">Přidej první akci – festival, trh, catering…</p>
            )}
            {events.length > 12 && (
              <Link href={`/income/events?source=${id}`} className="block py-2 text-center text-sm text-muted hover:text-fg">
                Všechny akce
              </Link>
            )}
          </Card>
        </>
      )}

      <SectionTitle action={<RuleButton sources={sourceOpts} sourceId={id} variant="secondary" />}>Opakované</SectionTitle>
      <Card className="py-1 md:py-1">
        {rules.length ? (
          rules.map((r) => <RuleRow key={r.id} rule={r} sources={sourceOpts} showSource={false} />)
        ) : (
          <p className="py-6 text-center text-sm text-muted">
            {source.type === "rental" ? "Nastav měsíční nájem a zapíše se automaticky." : "Žádná opakovaná pravidla."}
          </p>
        )}
      </Card>

      <SectionTitle
        action={
          <Link href={`/income/transactions?source=${id}`} className="text-xs text-muted hover:text-fg">
            Vše
          </Link>
        }
      >
        Transakce
      </SectionTitle>
      <Card className="py-2 md:py-2">
        <TxList items={txs} hideSource />
      </Card>

      <div className="mt-10 border-t border-line pt-6">
        <SourceDangerZone source={source} />
      </div>
    </>
  );
}

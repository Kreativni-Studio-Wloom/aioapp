import Link from "next/link";
import { Download } from "lucide-react";
import { Card, Delta, Empty, SectionTitle, Stat, buttonClass } from "@/components/ui";
import { AnimatedNumber } from "@/components/ui/client";
import { requireUser } from "@/lib/auth";
import { isoDate, money, pct } from "@/lib/format";
import { SOURCE_TYPE_LABEL } from "@/lib/income/constants";
import { generateRecurring, getOverview } from "@/lib/income/service";
import { EventRow, IncomeHeader, ShareRow, SignedMoney } from "./_components/bits";
import { ChartLegend, MonthlyChart } from "./_components/monthly-chart";
import { PeriodSwitch } from "./_components/nav";
import { AddTxButton } from "./_components/tx-sheet";
import { TxList } from "./_components/tx-list";

type Props = { searchParams: Promise<{ y?: string; m?: string }> };

export default async function IncomePage({ searchParams }: Props) {
  const user = await requireUser();
  const sp = await searchParams;
  await generateRecurring(user.id);

  const month = sp.m && /^\d{4}-\d{2}$/.test(sp.m) ? sp.m : undefined;
  const year = sp.y === "all" ? "all" : sp.y && /^\d{4}$/.test(sp.y) ? Number(sp.y) : undefined;
  // default: current month
  const ov = await getOverview(user.id, month || year ? { month, year } : { month: isoDate().slice(0, 7) });
  const { totals, period, comparison } = ov;
  const exportQs = new URLSearchParams();
  if (period.from) exportQs.set("from", period.from);
  if (period.to) exportQs.set("to", period.to);

  const empty = !ov.hasData;
  const expenseCats = ov.byCategory.filter((c) => c.kind === "expense");
  const expenseTotal = expenseCats.reduce((s, c) => s + c.total, 0);

  return (
    <>
      <IncomeHeader
        title="Příjmy"
        subtitle={period.label}
        action={
          <Link href={`/income/export?${exportQs}`} prefetch={false} className={buttonClass("ghost", "icon")} aria-label="Export CSV" title="Export CSV">
            <Download className="h-4 w-4" />
          </Link>
        }
      />
      <PeriodSwitch kind={period.kind} year={period.year} month={period.month} years={ov.years} />

      {empty ? (
        <Empty
          title="Zatím tu nic není"
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <AddTxButton variant="primary" size="md" />
              <Link href="/income/sources" className={buttonClass("secondary", "md")}>
                Založit zdroj
              </Link>
            </div>
          }
        >
          Založ si zdroje příjmů (podnikání, pronájem, investice…) a zapisuj příjmy i výdaje. Tlačítko + je vždy vpravo dole.
        </Empty>
      ) : (
        <>
          {/* Hero */}
          <Card className="mb-3">
            <div className="text-xs text-muted">Čistý zisk</div>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <AnimatedNumber value={totals.net} preset="money" className={`text-4xl font-semibold tracking-tight ${totals.net < 0 ? "text-neg" : ""}`} />
              {comparison?.netChangePct != null && (
                <span className="text-sm">
                  <Delta value={Math.round(comparison.netChangePct)} suffix=" %" /> <span className="text-muted">vs. {comparison.label}</span>
                </span>
              )}
            </div>
            <div className="mt-5 grid grid-cols-3 gap-3">
              <Stat label="Příjmy" value={money(totals.income)} />
              <Stat label="Výdaje" value={money(totals.expense)} />
              <Stat label="Marže" value={totals.margin != null ? pct(totals.margin, 0) : "–"} />
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Card>
              <Stat
                label={period.kind === "all" ? "Průměr / měsíc" : `Průměr / měsíc ${period.year}`}
                value={money(ov.avgMonthlyNet)}
                sub={`čistého · ${ov.monthsCounted} ${ov.monthsCounted === 1 ? "měsíc" : ov.monthsCounted < 5 ? "měsíce" : "měsíců"}`}
              />
            </Card>
            <Card>
              <Stat label="Průměr / měsíc (12 m)" value={money(ov.avgMonthlyNet12m)} sub="čistého, posledních 12 měsíců" />
            </Card>
            <Card className="col-span-2 md:col-span-1">
              {comparison ? (
                <Stat
                  label={`Meziročně (${comparison.label})`}
                  value={<SignedMoney value={totals.net - comparison.net} />}
                  sub={
                    <>
                      loni čistý {money(comparison.net)}
                      {comparison.incomeChangePct != null && (
                        <>
                          {" · příjmy "}
                          <Delta value={Math.round(comparison.incomeChangePct)} suffix=" %" />
                        </>
                      )}
                    </>
                  }
                />
              ) : (
                <Stat label="Transakcí" value={totals.count.toLocaleString("cs-CZ")} sub="za celé období" />
              )}
            </Card>
          </div>

          <SectionTitle className="mt-8" action={<ChartLegend />}>
            {period.kind === "all" ? "Po měsících" : `Po měsících ${period.year}`}
          </SectionTitle>
          <Card>
            <MonthlyChart data={ov.monthly} highlight={period.month} />
          </Card>

          <div className="mt-8 grid gap-x-6 md:grid-cols-2">
            <div>
              <SectionTitle>Podle zdrojů</SectionTitle>
              <Card>
                {ov.bySource.length ? (
                  ov.bySource.map((s) => (
                    <ShareRow
                      key={s.sourceId ?? "none"}
                      href={s.sourceId ? `/income/sources/${s.sourceId}` : undefined}
                      label={s.name}
                      value={money(s.income)}
                      share={s.pctOfIncome}
                      sub={
                        <>
                          {pct(s.pctOfIncome, 0)} příjmů{s.type && ` · ${SOURCE_TYPE_LABEL[s.type]}`}
                          {s.expense > 0 && (
                            <>
                              {" · čistý "}
                              <SignedMoney value={s.net} />
                            </>
                          )}
                        </>
                      }
                    />
                  ))
                ) : (
                  <p className="py-4 text-center text-sm text-muted">Žádné transakce v období</p>
                )}
              </Card>

              {expenseCats.length > 0 && (
                <>
                  <SectionTitle>Výdaje podle kategorií</SectionTitle>
                  <Card>
                    {expenseCats.slice(0, 8).map((c) => (
                      <ShareRow
                        key={c.category}
                        label={c.category}
                        value={money(c.total)}
                        share={expenseTotal ? (c.total / expenseTotal) * 100 : 0}
                      />
                    ))}
                  </Card>
                </>
              )}
            </div>

            <div>
              {ov.topEvents.length > 0 && (
                <>
                  <SectionTitle
                    action={
                      <Link href="/income/events" className="text-xs text-muted hover:text-fg">
                        Analýza akcí
                      </Link>
                    }
                  >
                    Nejlepší akce
                  </SectionTitle>
                  <Card className="py-2 md:py-2">
                    {ov.topEvents.map((e) => (
                      <EventRow key={e.id} e={e} />
                    ))}
                  </Card>
                </>
              )}

              <SectionTitle
                action={
                  <Link
                    href={`/income/transactions${period.from ? `?from=${period.from}&to=${period.to}` : ""}`}
                    className="text-xs text-muted hover:text-fg"
                  >
                    Vše
                  </Link>
                }
              >
                Poslední transakce
              </SectionTitle>
              <Card className="py-2 md:py-2">
                <TxList items={ov.recent} empty="Žádné transakce v období" />
              </Card>
            </div>
          </div>
        </>
      )}
    </>
  );
}

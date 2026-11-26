import Link from "next/link";
import { after } from "next/server";
import { Card, Empty, PageHeader, SectionTitle, Stat } from "@/components/ui";
import { AnimatedNumber } from "@/components/ui/client";
import { requireUser } from "@/lib/auth";
import { money, pct } from "@/lib/format";
import { getNetWorthHistory, getPortfolioOverview, snapshotNetWorth, startRefreshIfStale } from "@/lib/portfolio/service";
import { NetWorthChart } from "./charts";
import { AddAssetButton, Collapsible, LiabilitiesSection, RefreshButton } from "./overview-client";
import { AllocationBars, HoldingCard, PlText, RebalanceList } from "./parts";

export default async function PortfolioPage() {
  const user = await requireUser();
  // lazily refresh stale prices: wait at most 2.5 s, the rest finishes after the response via after()
  const refresh = await startRefreshIfStale(user.id).catch(() => null);
  if (refresh) {
    const { job } = refresh;
    const done = await Promise.race([job.then(() => true), new Promise<false>((r) => setTimeout(() => r(false), 2500))]);
    // re-snapshot once the background refresh lands so today's net worth uses fresh prices
    if (!done) after(job.then(() => snapshotNetWorth(user.id)).catch((e) => console.error("snapshotNetWorth", e)));
  }
  const overview = await getPortfolioOverview(user.id);
  if (overview.holdings.length || overview.liabilities.length) {
    await snapshotNetWorth(user.id).catch((e) => console.error("snapshotNetWorth", e));
  }
  const history = await getNetWorthHistory(user.id, 3650);
  const o = overview;
  const hasAssets = o.holdings.length > 0;

  return (
    <>
      <PageHeader
        title="Portfolio"
        subtitle={o.pricesAsOf ? `Ceny k ${new Date(o.pricesAsOf).toLocaleString("cs-CZ", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })}` : undefined}
        action={
          <>
            {hasAssets && <RefreshButton asOf={o.pricesAsOf} />}
            <AddAssetButton />
          </>
        }
      />

      {!hasAssets && !o.liabilities.length ? (
        <Empty title="Zatím žádná aktiva" action={<AddAssetButton label="Přidat první aktivum" />}>
          Přidej akcie, ETF, krypto, hotovost nebo nemovitosti – ceny se aktualizují automaticky a čisté jmění se ukládá každý den.
          <div className="mt-3">
            <Link href="/portfolio/import" className="underline underline-offset-4 hover:text-fg">
              nebo importuj CSV
            </Link>
          </div>
        </Empty>
      ) : (
        <>
          <Card className="p-5 md:p-6">
            <div className="text-xs text-muted">Čisté jmění</div>
            <div className="mt-1 text-4xl font-semibold tracking-tight md:text-5xl">
              <AnimatedNumber value={o.netWorthCzk} preset="money" />
            </div>
            <div className="mt-1 text-sm text-muted">
              Aktiva <span className="num text-fg-soft">{money(o.totalCzk)}</span>
              {o.liabilitiesCzk > 0 && (
                <>
                  {" "}
                  · Závazky <span className="num text-fg-soft">−{money(o.liabilitiesCzk)}</span>
                </>
              )}
            </div>
            {o.fxMissing.length > 0 && (
              <p className="mt-2 text-xs text-muted">
                Chybí kurz {o.fxMissing.join(", ")} – tato aktiva nejsou v součtech započtena a dnešní snapshot se neuloží.
              </p>
            )}
            <div className="mt-5">
              <NetWorthChart data={history} />
            </div>
          </Card>

          {hasAssets && (
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              <Card>
                <Stat label="Hodnota portfolia" value={money(o.totalCzk)} />
              </Card>
              <Card>
                <Stat label="Dnes" value={<PlText value={o.dayChangeCzk} />} sub={pct(o.dayChangePct, 2, true)} />
              </Card>
              <Card>
                <Stat label="Investováno" value={money(o.investedCzk)} sub={o.dividendsCzk > 0 ? `Dividendy ${money(o.dividendsCzk)}` : undefined} />
              </Card>
              <Card>
                <Stat
                  label="Nerealizovaný zisk"
                  value={<PlText value={o.unrealizedCzk} />}
                  sub={`${pct(o.unrealizedPct, 1, true)}${o.realizedCzk ? ` · realiz. ${money(o.realizedCzk, "CZK", { sign: true })}` : ""}`}
                />
              </Card>
            </div>
          )}

          {hasAssets && (
            <>
              <SectionTitle>Aktiva</SectionTitle>
              <div className="grid gap-2">
                {o.holdings.map((h) => (
                  <HoldingCard key={h.id} h={h} />
                ))}
              </div>
              {o.archived.length > 0 && (
                <Collapsible title={`Archivované (${o.archived.length})`}>
                  {o.archived.map((h) => (
                    <HoldingCard key={h.id} h={h} />
                  ))}
                </Collapsible>
              )}
            </>
          )}

          {o.allocation.length > 0 && (
            <div className="mt-8 grid gap-3 md:grid-cols-2">
              <div>
                <SectionTitle className="mt-0">Alokace</SectionTitle>
                <Card>
                  <AllocationBars rows={o.allocation} />
                </Card>
              </div>
              <div>
                <SectionTitle className="mt-0">Cílová alokace</SectionTitle>
                <Card>
                  {o.rebalance.length ? (
                    <RebalanceList rows={o.rebalance} />
                  ) : (
                    <p className="text-sm text-muted">Nastav u aktiv cílové procento a uvidíš, co dokoupit nebo prodat při odchylce nad 5 p. b.</p>
                  )}
                </Card>
              </div>
            </div>
          )}

          <SectionTitle>Závazky</SectionTitle>
          <LiabilitiesSection items={o.liabilities} />

          <div className="mt-8 text-center">
            <Link href="/portfolio/import" className="text-sm text-muted underline-offset-4 hover:text-fg hover:underline">
              Import transakcí z CSV
            </Link>
          </div>
        </>
      )}
    </>
  );
}

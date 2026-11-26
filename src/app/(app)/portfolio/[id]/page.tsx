import { notFound } from "next/navigation";
import { Badge, Card, PageHeader, SectionTitle, Stat } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { dateLabel, money, num, pct } from "@/lib/format";
import { CLASS_LABEL } from "@/lib/portfolio/constants";
import { getAsset } from "@/lib/portfolio/service";
import { PriceChart } from "../charts";
import { PlText, TimeTestBadge } from "../parts";
import { AddTxButton, EditAssetButton, TxList } from "./asset-client";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AssetPage({ params }: PageProps<"/portfolio/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const user = await requireUser();
  const detail = await getAsset(user.id, id);
  if (!detail) notFound();
  const { asset: a, transactions, lots, history } = detail;
  const cur = a.currency;
  const priceDecimals = a.lastPrice != null && a.lastPrice < 10 ? 4 : 2;
  const sourceLabel = a.priceSource === "yahoo" ? "Yahoo Finance" : a.priceSource === "coingecko" ? "CoinGecko" : "ruční ocenění";

  return (
    <>
      <PageHeader
        back="/portfolio"
        title={a.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge>{CLASS_LABEL[a.class]}</Badge>
            {a.symbol && <span>{a.symbol}</span>}
            <span>· {cur}</span>
            {a.archived && <Badge tone="solid">Archivováno</Badge>}
          </span>
        }
        action={<EditAssetButton asset={{ id: a.id, name: a.name, symbol: a.symbol, targetPct: a.targetPct, notes: a.notes, archived: a.archived }} />}
      />

      <Card className="p-5 md:p-6">
        <div className="text-xs text-muted">Hodnota</div>
        <div className="num mt-1 text-4xl font-semibold tracking-tight">{a.fxMissing ? money(a.value, cur) : money(a.valueCzk)}</div>
        {a.fxMissing && <p className="mt-1 text-xs text-muted">Kurz {cur}/CZK není k dispozici – hodnota v CZK je neznámá.</p>}
        <div className="mt-1 flex flex-wrap gap-x-3 text-sm text-muted">
          {cur !== "CZK" && <span className="num">{money(a.value, cur)}</span>}
          {a.invested > 0 && <PlText value={a.unrealizedCzk} pctValue={a.plPct} />}
          {!a.manual && a.dayChangeCzk !== 0 && (
            <span>
              dnes <PlText value={a.dayChangeCzk} pctValue={a.dayChangePct} />
            </span>
          )}
        </div>
        <div className="mt-5">
          <PriceChart
            data={history}
            currency={cur}
            avgCost={a.manual ? null : a.avgCost || null}
            label={a.manual ? "Hodnota" : `Cena · ${sourceLabel}`}
          />
        </div>
      </Card>

      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        {!a.manual && (
          <>
            <Card>
              <Stat label="Množství" value={num(a.quantity, 8)} />
            </Card>
            <Card>
              <Stat
                label="Aktuální cena"
                value={a.lastPrice != null ? money(a.lastPrice, cur, { decimals: priceDecimals }) : "—"}
                sub={a.lastPriceAt ? new Date(a.lastPriceAt).toLocaleString("cs-CZ", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }) : undefined}
              />
            </Card>
            <Card>
              <Stat label="Průměrná cena" value={a.avgCost ? money(a.avgCost, cur, { decimals: priceDecimals }) : "—"} />
            </Card>
          </>
        )}
        <Card>
          <Stat label={a.manual ? "Vloženo" : "Investováno"} value={money(a.invested, cur)} sub={cur !== "CZK" ? money(a.investedCzk) : undefined} />
        </Card>
        {a.manual && (
          <Card>
            <Stat label="Poslední ocenění" value={a.lastValuationDate ? dateLabel(a.lastValuationDate, { day: "numeric", month: "numeric", year: "numeric" }) : "—"} />
          </Card>
        )}
        <Card>
          {/* market assets realize profit via sells – legacy "withdrawal" rows are not added to P/L */}
          <Stat
            label="Realizováno"
            value={<PlText value={a.realized + (a.manual ? a.withdrawn : 0)} currency={cur} />}
            sub={a.withdrawn ? `${a.manual ? "z toho výběry" : "výběry (nezapočteny)"} ${money(a.withdrawn, cur)}` : undefined}
          />
        </Card>
        <Card>
          <Stat label="Dividendy / úroky" value={money(a.dividends, cur)} />
        </Card>
        <Card>
          <Stat label="Váha v portfoliu" value={pct(a.weightPct)} sub={a.targetPct != null ? `cíl ${pct(a.targetPct, 0)}` : undefined} />
        </Card>
      </div>

      {lots.length > 0 && (
        <>
          <SectionTitle>Nakoupené loty · časový test</SectionTitle>
          <Card className="py-1">
            {lots.map((l, i) => (
              <div key={i} className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-3 last:border-0">
                <div className="num text-sm">
                  {dateLabel(l.date, { day: "numeric", month: "numeric", year: "numeric" })} · {num(l.quantity, 8)} ks à {money(l.price, cur, { decimals: priceDecimals })}
                </div>
                <TimeTestBadge date={l.timeTestDate} met={l.timeTestMet} />
              </div>
            ))}
            <p className="py-3 text-xs text-subtle">Orientačně (FIFO): příjem z prodeje cenných papírů a kryptoměn držených déle než 3 roky je v ČR osvobozen. Nejde o daňové poradenství.</p>
          </Card>
        </>
      )}

      <SectionTitle action={<AddTxButton assetId={a.id} manual={a.manual} currency={cur} lastPrice={a.lastPrice} />}>Transakce</SectionTitle>
      <TxList items={transactions} manual={a.manual} currency={cur} />

      {a.notes && (
        <>
          <SectionTitle>Poznámka</SectionTitle>
          <Card className="whitespace-pre-wrap text-sm text-fg-soft">{a.notes}</Card>
        </>
      )}
    </>
  );
}

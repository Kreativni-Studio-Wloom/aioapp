/**
 * Portfolio / net-worth service. All DB logic lives here; userId is always the first argument
 * and every query is scoped by it. Returns are JSON-serialisable (dates as ISO strings).
 */
import { and, asc, desc, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { db, t } from "@/db";
import { fxRate } from "@/lib/fx";
import { addDays, isoDate } from "@/lib/format";
import { addTransaction as addIncomeTransaction, createSource as createIncomeSource } from "@/lib/income/service";
import { computePosition, fifoLots, findOversell, manualValueSeries, type Lot, type TxLike } from "./calc";
import {
  CLASS_LABEL,
  INCOME_CATEGORY,
  REBALANCE_THRESHOLD_PP,
  STALE_PRICE_MS,
  type AssetClass,
  type AssetTxType,
  type PriceSource,
} from "./constants";
import { coinHistory, coinPrices, coinSearch, yahooQuote, yahooSearch } from "./providers";

/* ───────────────────────────── Types ───────────────────────────── */

type AssetRow = typeof t.assets.$inferSelect;
type AssetTxRow = typeof t.assetTransactions.$inferSelect;

export type Asset = Omit<AssetRow, "lastPriceAt" | "createdAt" | "userId"> & { lastPriceAt: string | null; createdAt: string };

export type Holding = Asset & {
  manual: boolean;
  quantity: number;
  avgCost: number;
  invested: number;
  value: number;
  unrealized: number;
  plPct: number;
  realized: number;
  dividends: number;
  withdrawn: number;
  fees: number;
  lastValuationDate: string | null;
  /** CZK per 1 unit of asset currency (today); 0 when no rate is known (see fxMissing) */
  fx: number;
  /** no FX rate available for the asset currency → CZK values are unknown (reported as 0) */
  fxMissing: boolean;
  valueCzk: number;
  investedCzk: number;
  unrealizedCzk: number;
  realizedCzk: number;
  dividendsCzk: number;
  prevPrice: number | null;
  dayChangeCzk: number;
  dayChangePct: number;
  /** share of total portfolio value, 0–100 */
  weightPct: number;
  /** last ~30 daily prices */
  sparkline: number[];
};

export type AssetTx = Omit<AssetTxRow, "createdAt" | "userId"> & { createdAt: string };

export type AssetDetail = {
  asset: Holding;
  transactions: AssetTx[];
  lots: Lot[];
  history: { date: string; price: number }[];
};

export type AllocationRow = { class: AssetClass; label: string; valueCzk: number; pct: number };

export type RebalanceRow = {
  assetId: string;
  name: string;
  targetPct: number;
  currentPct: number;
  driftPp: number;
  /** positive = buy for this much CZK, negative = sell */
  actionCzk: number;
  needsAction: boolean;
};

export type Liability = {
  id: string;
  name: string;
  balance: number;
  currency: string;
  interestRate: number | null;
  notes: string | null;
  updatedAt: string;
  balanceCzk: number;
  /** no FX rate available → balanceCzk unknown (reported as 0) */
  fxMissing: boolean;
};

export type PortfolioOverview = {
  totalCzk: number;
  dayChangeCzk: number;
  dayChangePct: number;
  investedCzk: number;
  unrealizedCzk: number;
  unrealizedPct: number;
  realizedCzk: number;
  dividendsCzk: number;
  liabilitiesCzk: number;
  netWorthCzk: number;
  allocation: AllocationRow[];
  rebalance: RebalanceRow[];
  holdings: Holding[];
  archived: Holding[];
  liabilities: Liability[];
  /** oldest price timestamp among market-priced holdings */
  pricesAsOf: string | null;
  /** currencies without any known FX rate – totals exclude those holdings/liabilities */
  fxMissing: string[];
};

export type CreateAssetInput = {
  class: AssetClass;
  name: string;
  symbol?: string | null;
  currency?: string | null;
  priceSource?: PriceSource;
  externalId?: string | null;
  targetPct?: number | null;
  notes?: string | null;
};

export type UpdateAssetInput = Partial<Pick<CreateAssetInput, "name" | "symbol" | "targetPct" | "notes" | "currency">> & { archived?: boolean };

export type AddAssetTxInput = {
  assetId: string;
  type: AssetTxType;
  date: string;
  quantity?: number | null;
  price?: number | null;
  fee?: number | null;
  amount?: number | null;
  note?: string | null;
  /** also record a dividend/withdrawal as income in the income module */
  alsoIncome?: boolean;
};

export type LiabilityInput = {
  id?: string;
  name: string;
  balance: number;
  currency?: string;
  interestRate?: number | null;
  notes?: string | null;
};

/* ───────────────────────────── Helpers ───────────────────────────── */

const serializeAsset = (a: AssetRow): Asset => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { userId, ...rest } = a;
  return { ...rest, lastPriceAt: a.lastPriceAt ? a.lastPriceAt.toISOString() : null, createdAt: a.createdAt.toISOString() };
};

const serializeTx = (x: AssetTxRow): AssetTx => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { userId, ...rest } = x;
  return { ...rest, createdAt: x.createdAt.toISOString() };
};

const isManual = (a: Pick<AssetRow, "priceSource">) => a.priceSource === "manual";

/** Latest cached ČNB rate for a currency regardless of age (null if none was ever stored). */
async function lastKnownRate(currency: string): Promise<number | null> {
  const [r] = await db
    .select({ rate: t.fxRates.rate })
    .from(t.fxRates)
    .where(eq(t.fxRates.currency, currency))
    .orderBy(desc(t.fxRates.date))
    .limit(1);
  return r?.rate ?? null;
}

/** Today's CZK rate per currency; on lookup failure the last cached rate, else null (= unknown, never a fake 1). */
async function fxMap(currencies: string[]): Promise<Record<string, number | null>> {
  const out: Record<string, number | null> = {};
  await Promise.all(
    [...new Set(currencies)].map(async (c) => {
      try {
        out[c] = await fxRate(c);
      } catch (e) {
        console.error("portfolio fx", c, e);
        out[c] = await lastKnownRate(c).catch(() => null);
      }
    }),
  );
  return out;
}

const MAX_FX_FETCHES = 40;

/**
 * Resolver for historical CZK rates (transaction-date conversion of realized P/L and dividends).
 * Uses cached ČNB rates; dates without a fixing within 4 days are fetched via fxRate (capped),
 * otherwise falls back to the nearest cached rate. Returns null when nothing is known.
 */
async function historicalRates(pairs: { currency: string; date: string }[]): Promise<(currency: string, date: string) => number | null> {
  const need = pairs.filter((p) => p.currency !== "CZK");
  const currencies = [...new Set(need.map((p) => p.currency))];
  const byCur = new Map<string, { date: string; rate: number }[]>();
  if (currencies.length) {
    const rows = await db
      .select({ currency: t.fxRates.currency, date: t.fxRates.date, rate: t.fxRates.rate })
      .from(t.fxRates)
      .where(inArray(t.fxRates.currency, currencies))
      .orderBy(asc(t.fxRates.date));
    for (const r of rows) byCur.set(r.currency, [...(byCur.get(r.currency) ?? []), r]);
  }
  const nearest = (currency: string, date: string) => {
    const list = byCur.get(currency) ?? [];
    let before: { date: string; rate: number } | null = null;
    for (const r of list) {
      if (r.date <= date) before = r;
      else return { before, after: r };
    }
    return { before, after: null };
  };
  const resolved = new Map<string, number | null>();
  const missing: { currency: string; date: string }[] = [];
  for (const p of need) {
    const key = `${p.currency}|${p.date}`;
    if (resolved.has(key)) continue;
    const { before, after } = nearest(p.currency, p.date);
    const fresh = before && (new Date(p.date).getTime() - new Date(before.date).getTime()) / 864e5 <= 4;
    if (fresh) resolved.set(key, before.rate);
    else {
      resolved.set(key, before?.rate ?? after?.rate ?? null);
      missing.push(p);
    }
  }
  await pool(missing.slice(0, MAX_FX_FETCHES), 4, async (p) => {
    try {
      resolved.set(`${p.currency}|${p.date}`, await fxRate(p.currency, p.date));
    } catch {
      /* keep nearest cached rate */
    }
  });
  return (currency, date) => (currency === "CZK" ? 1 : (resolved.get(`${currency}|${date}`) ?? null));
}

/** Σ amount(date) × rate(date); dates without a historical rate use `fallback` (today's rate). */
function convertByDate(byDate: Record<string, number>, rateAt: (date: string) => number | null, fallback: number) {
  let sum = 0;
  for (const [date, v] of Object.entries(byDate)) sum += v * (rateAt(date) ?? fallback);
  return sum;
}

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(size, queue.length) }, async () => {
      while (queue.length) await fn(queue.shift()!);
    }),
  );
}

async function upsertPrices(assetId: string, points: { date: string; price: number }[], overwrite = true) {
  const rows = points.filter((p) => Number.isFinite(p.price) && p.price > 0).map((p) => ({ assetId, date: p.date, price: p.price }));
  if (!rows.length) return;
  const q = db.insert(t.priceHistory).values(rows);
  if (overwrite) {
    await q.onConflictDoUpdate({ target: [t.priceHistory.assetId, t.priceHistory.date], set: { price: sql`excluded.price` } });
  } else {
    await q.onConflictDoNothing();
  }
}

async function ownedAsset(userId: string, assetId: string) {
  const [a] = await db
    .select()
    .from(t.assets)
    .where(and(eq(t.assets.id, assetId), eq(t.assets.userId, userId)))
    .limit(1);
  return a ?? null;
}

const normCurrency = (c: string | null | undefined, fallback = "CZK") => (c ? c.trim().toUpperCase() : fallback) || fallback;

/* ───────────────────────────── Search ───────────────────────────── */

export type InstrumentHit = { externalId: string; symbol: string; name: string; detail: string; source: PriceSource };

/** Search instruments for the add-asset flow (Yahoo for stock/etf/bond/commodity, CoinGecko for crypto). */
export async function searchInstruments(cls: AssetClass, query: string): Promise<InstrumentHit[]> {
  if (cls === "crypto") {
    const hits = await coinSearch(query);
    return hits.map((h) => ({
      externalId: h.id,
      symbol: h.symbol,
      name: h.name,
      detail: h.rank ? `#${h.rank}` : "",
      source: "coingecko" as const,
    }));
  }
  const hits = await yahooSearch(query);
  return hits.map((h) => ({
    externalId: h.symbol,
    symbol: h.symbol,
    name: h.name,
    detail: [h.exchange, h.type].filter(Boolean).join(" · "),
    source: "yahoo" as const,
  }));
}

/* ───────────────────────────── Assets ───────────────────────────── */

export async function listAssets(userId: string, opts: { includeArchived?: boolean } = {}): Promise<Asset[]> {
  const rows = await db
    .select()
    .from(t.assets)
    .where(opts.includeArchived ? eq(t.assets.userId, userId) : and(eq(t.assets.userId, userId), eq(t.assets.archived, false)))
    .orderBy(asc(t.assets.name));
  return rows.map(serializeAsset);
}

async function buildHoldings(userId: string, rows: AssetRow[]): Promise<Holding[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const today = isoDate();
  const [txs, hist, fx] = await Promise.all([
    db
      .select()
      .from(t.assetTransactions)
      .where(and(eq(t.assetTransactions.userId, userId), inArray(t.assetTransactions.assetId, ids))),
    db
      .select()
      .from(t.priceHistory)
      .where(and(inArray(t.priceHistory.assetId, ids), gte(t.priceHistory.date, addDays(today, -35))))
      .orderBy(asc(t.priceHistory.date)),
    fxMap(rows.map((r) => r.currency)),
  ]);

  const txBy = new Map<string, AssetTxRow[]>();
  for (const x of txs) txBy.set(x.assetId, [...(txBy.get(x.assetId) ?? []), x]);
  const histBy = new Map<string, { date: string; price: number }[]>();
  for (const h of hist) histBy.set(h.assetId, [...(histBy.get(h.assetId) ?? []), h]);

  const currencyOf = new Map(rows.map((r) => [r.id, r.currency]));
  const rateAt = await historicalRates(
    txs
      .filter((x) => x.type === "sell" || x.type === "fee" || x.type === "dividend" || x.type === "withdrawal")
      .map((x) => ({ currency: currencyOf.get(x.assetId) ?? "CZK", date: x.date })),
  );

  const holdings = rows.map((a): Holding => {
    const manual = isManual(a);
    const s = computePosition(txBy.get(a.id) ?? [], { manual, lastPrice: a.lastPrice });
    const known = fx[a.currency];
    const fxMissing = known == null;
    const rate = known ?? 0;
    const at = (date: string) => (fxMissing ? 0 : rateAt(a.currency, date));
    // realized P/L and dividends at the FX rate of their transaction date; profit withdrawals
    // count as realized only for manual assets (market assets realize via sells)
    const realizedCzk = convertByDate(s.realizedByDate, at, rate) + (manual ? convertByDate(s.withdrawnByDate, at, rate) : 0);
    const dividendsCzk = convertByDate(s.dividendsByDate, at, rate);
    const h = histBy.get(a.id) ?? [];
    let prevPrice: number | null = null;
    let dayChange = 0;
    if (!manual && a.lastPrice != null) {
      const prev = [...h].reverse().find((p) => p.date < today);
      if (prev) {
        prevPrice = prev.price;
        dayChange = s.quantity * (a.lastPrice - prev.price);
      }
    }
    const prevValue = s.value - dayChange;
    return {
      ...serializeAsset(a),
      manual,
      quantity: s.quantity,
      avgCost: s.avgCost,
      invested: s.invested,
      value: s.value,
      unrealized: s.unrealized,
      plPct: s.unrealizedPct,
      realized: s.realized,
      dividends: s.dividends,
      withdrawn: s.withdrawn,
      fees: s.fees,
      lastValuationDate: s.lastValuationDate,
      fx: rate,
      fxMissing,
      valueCzk: s.value * rate,
      investedCzk: s.invested * rate,
      unrealizedCzk: s.unrealized * rate,
      realizedCzk,
      dividendsCzk,
      prevPrice,
      dayChangeCzk: dayChange * rate,
      dayChangePct: prevValue > 0 ? (dayChange / prevValue) * 100 : 0,
      weightPct: 0,
      sparkline: manual ? [] : h.slice(-30).map((p) => p.price),
    };
  });
  // weights are shares of the active portfolio – archived assets get 0 and don't dilute the rest
  const total = holdings.reduce((s, h) => s + (h.archived ? 0 : h.valueCzk), 0);
  for (const h of holdings) h.weightPct = !h.archived && total > 0 ? (h.valueCzk / total) * 100 : 0;
  return holdings.sort((a, b) => b.valueCzk - a.valueCzk);
}

/** Per-asset computed stats (active assets by default), sorted by CZK value desc. */
export async function listHoldings(userId: string, opts: { includeArchived?: boolean } = {}): Promise<Holding[]> {
  const rows = await db
    .select()
    .from(t.assets)
    .where(opts.includeArchived ? eq(t.assets.userId, userId) : and(eq(t.assets.userId, userId), eq(t.assets.archived, false)));
  return buildHoldings(userId, rows);
}

export async function getAsset(userId: string, id: string): Promise<AssetDetail | null> {
  const a = await ownedAsset(userId, id);
  if (!a) return null;
  const [[holding], txs, hist] = await Promise.all([
    buildHoldings(userId, [a]),
    db
      .select()
      .from(t.assetTransactions)
      .where(and(eq(t.assetTransactions.userId, userId), eq(t.assetTransactions.assetId, id)))
      .orderBy(desc(t.assetTransactions.date), desc(t.assetTransactions.createdAt)),
    db.select({ date: t.priceHistory.date, price: t.priceHistory.price }).from(t.priceHistory).where(eq(t.priceHistory.assetId, id)).orderBy(asc(t.priceHistory.date)),
  ]);
  const manual = isManual(a);
  // weight within the whole portfolio
  const all = await listHoldings(userId);
  const total = all.reduce((s, h) => s + h.valueCzk, 0);
  holding.weightPct = !holding.archived && total > 0 ? (holding.valueCzk / total) * 100 : 0;
  return {
    asset: holding,
    transactions: txs.map(serializeTx),
    lots: manual || a.class === "cash" ? [] : fifoLots(txs, isoDate()),
    history: manual ? manualValueSeries(txs) : hist,
  };
}

export async function createAsset(userId: string, input: CreateAssetInput): Promise<Asset> {
  const name = input.name.trim();
  if (!name) throw new Error("Chybí název");
  const source: PriceSource = input.priceSource ?? "manual";
  const externalId = input.externalId?.trim() || null;
  if (source !== "manual" && !externalId) throw new Error("Chybí identifikátor instrumentu");

  let currency = normCurrency(input.currency, source === "yahoo" ? "USD" : "CZK");
  let lastPrice: number | null = null;
  let history: { date: string; price: number }[] = [];

  if (source === "yahoo") {
    try {
      const q = await yahooQuote(externalId!, "1y");
      currency = q.currency;
      lastPrice = q.price;
      history = q.history;
    } catch (e) {
      if (!input.currency) throw new Error(`Nepodařilo se načíst ${externalId}: ${(e as Error).message}`);
    }
  } else if (source === "coingecko") {
    try {
      const p = await coinPrices([externalId!], [currency]);
      lastPrice = p[externalId!]?.[currency]?.price ?? null;
      history = await coinHistory(externalId!, currency, 365).catch(() => []);
    } catch (e) {
      console.error("coingecko create", e);
    }
  }

  const [row] = await db
    .insert(t.assets)
    .values({
      userId,
      name,
      symbol: input.symbol?.trim() || null,
      class: input.class,
      currency,
      priceSource: source,
      externalId,
      lastPrice,
      lastPriceAt: lastPrice != null ? new Date() : null,
      targetPct: input.targetPct ?? null,
      notes: input.notes?.trim() || null,
    })
    .returning();
  if (history.length) await upsertPrices(row.id, history).catch((e) => console.error("backfill", e));
  return serializeAsset(row);
}

export async function updateAsset(userId: string, id: string, patch: UpdateAssetInput): Promise<Asset> {
  const set: Partial<typeof t.assets.$inferInsert> = {};
  if (patch.name !== undefined) set.name = patch.name.trim();
  if (patch.symbol !== undefined) set.symbol = patch.symbol?.trim() || null;
  if (patch.targetPct !== undefined) set.targetPct = patch.targetPct;
  if (patch.notes !== undefined) set.notes = patch.notes?.trim() || null;
  if (patch.archived !== undefined) set.archived = patch.archived;
  if (patch.currency !== undefined && patch.currency) set.currency = normCurrency(patch.currency);
  const [row] = await db
    .update(t.assets)
    .set(set)
    .where(and(eq(t.assets.id, id), eq(t.assets.userId, userId)))
    .returning();
  if (!row) throw new Error("Aktivum nenalezeno");
  return serializeAsset(row);
}

export async function archiveAsset(userId: string, id: string, archived = true) {
  return updateAsset(userId, id, { archived });
}

/** Hard delete (cascades transactions and price history). */
export async function deleteAsset(userId: string, id: string): Promise<{ deleted: boolean }> {
  const rows = await db
    .delete(t.assets)
    .where(and(eq(t.assets.id, id), eq(t.assets.userId, userId)))
    .returning({ id: t.assets.id });
  return { deleted: rows.length > 0 };
}

/* ───────────────────────────── Transactions ───────────────────────────── */

/** Keep `lastPrice` of manual assets equal to their current total value. */
async function syncManualValue(userId: string, a: AssetRow) {
  if (!isManual(a)) return;
  const txs = await db
    .select()
    .from(t.assetTransactions)
    .where(and(eq(t.assetTransactions.userId, userId), eq(t.assetTransactions.assetId, a.id)));
  const s = computePosition(txs, { manual: true, lastPrice: null });
  await db.update(t.assets).set({ lastPrice: s.value, lastPriceAt: new Date() }).where(eq(t.assets.id, a.id));
}

async function investmentSourceId(userId: string): Promise<string> {
  const [src] = await db
    .select({ id: t.incomeSources.id })
    .from(t.incomeSources)
    .where(and(eq(t.incomeSources.userId, userId), eq(t.incomeSources.type, "investment"), eq(t.incomeSources.archived, false)))
    .orderBy(asc(t.incomeSources.createdAt))
    .limit(1);
  if (src) return src.id;
  const created = await createIncomeSource(userId, { name: "Investice", type: "investment" });
  return created.id;
}

export async function addAssetTransaction(
  userId: string,
  input: AddAssetTxInput,
): Promise<{ transaction: AssetTx; income: { linked: boolean; error?: string } }> {
  const a = await ownedAsset(userId, input.assetId);
  if (!a) throw new Error("Aktivum nenalezeno");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error("Neplatné datum");
  const manual = isManual(a);
  const quantity = Math.abs(input.quantity ?? 0);
  let price = Math.abs(input.price ?? 0);
  const fee = Math.abs(input.fee ?? 0);
  let amount = Math.abs(input.amount ?? 0);

  if (input.type === "withdrawal" && !manual) {
    throw new Error("U tržních aktiv se zisk vybírá prodejem – zadej transakci Prodej");
  }

  if ((input.type === "buy" || input.type === "sell") && !manual) {
    if (!(quantity > 0)) throw new Error("Zadej množství");
    // only a total given (e.g. CSV) → derive the unit price; never store a silent zero cost
    if (!(price > 0) && amount > 0) price = amount / quantity;
    if (!(price > 0)) throw new Error("Zadej cenu za kus nebo celkovou částku");
    amount = quantity * price;
    if (input.type === "sell") {
      const existing = await db
        .select()
        .from(t.assetTransactions)
        .where(and(eq(t.assetTransactions.userId, userId), eq(t.assetTransactions.assetId, a.id)));
      const candidate: TxLike = { type: "sell", date: input.date, quantity, price, fee, amount, createdAt: new Date() };
      const over = findOversell<TxLike>([...existing, candidate]);
      if (over) {
        const fmt = (n: number) => n.toLocaleString("cs-CZ", { maximumFractionDigits: 8 });
        throw new Error(
          over.tx === candidate
            ? `Nelze prodat ${fmt(quantity)} ks – k ${over.date} držíš jen ${fmt(over.held)} ks`
            : `Prodej by způsobil, že pozdější prodej ${over.date} (${fmt(over.quantity)} ks) překročí držené množství (${fmt(over.held)} ks)`,
        );
      }
    }
  } else if (input.type === "valuation") {
    if (!(input.amount != null && input.amount >= 0)) throw new Error("Zadej hodnotu");
    amount = input.amount;
  } else if (!(amount > 0)) {
    if ((input.type === "buy" || input.type === "sell") && quantity > 0 && price > 0) amount = quantity * price;
    else if (input.type === "fee" && fee > 0) amount = fee;
    else throw new Error("Zadej částku");
  }

  const [row] = await db
    .insert(t.assetTransactions)
    .values({ userId, assetId: a.id, type: input.type, date: input.date, quantity, price, fee, amount, note: input.note?.trim() || null })
    .returning();

  if (manual) await syncManualValue(userId, a);
  else if (a.lastPrice == null && input.type === "buy" && price > 0) {
    await db.update(t.assets).set({ lastPrice: price, lastPriceAt: new Date() }).where(eq(t.assets.id, a.id));
  }

  const income: { linked: boolean; error?: string } = { linked: false };
  const category = INCOME_CATEGORY[input.type];
  if (input.alsoIncome && category) {
    try {
      const sourceId = await investmentSourceId(userId);
      await addIncomeTransaction(userId, {
        kind: "income",
        amount: amount - (input.type === "dividend" ? fee : 0),
        currency: a.currency,
        date: input.date,
        assetId: a.id,
        sourceId,
        category,
        note: input.note?.trim() || a.name,
      });
      income.linked = true;
    } catch (e) {
      console.error("portfolio → income", e);
      income.error = (e as Error).message || "Zápis do Příjmů selhal";
    }
  }
  return { transaction: serializeTx(row), income };
}

/** Deletes an asset transaction; a matching linked income entry (same asset, date, amount, category) is removed too. */
export async function deleteAssetTransaction(userId: string, id: string): Promise<{ deleted: boolean; assetId: string | null }> {
  const [row] = await db
    .delete(t.assetTransactions)
    .where(and(eq(t.assetTransactions.id, id), eq(t.assetTransactions.userId, userId)))
    .returning();
  if (!row) return { deleted: false, assetId: null };
  const a = await ownedAsset(userId, row.assetId);
  if (a) await syncManualValue(userId, a);

  const category = INCOME_CATEGORY[row.type];
  if (category) {
    const incomeAmount = row.amount - (row.type === "dividend" ? row.fee : 0);
    const [linked] = await db
      .select({ id: t.transactions.id })
      .from(t.transactions)
      .where(
        and(
          eq(t.transactions.userId, userId),
          eq(t.transactions.assetId, row.assetId),
          eq(t.transactions.date, row.date),
          eq(t.transactions.category, category),
          sql`abs(${t.transactions.amount} - ${incomeAmount}) < 0.005`,
        ),
      )
      .limit(1);
    if (linked) await db.delete(t.transactions).where(and(eq(t.transactions.id, linked.id), eq(t.transactions.userId, userId)));
  }
  return { deleted: true, assetId: row.assetId };
}

/* ───────────────────────────── Prices ───────────────────────────── */

/**
 * Refresh market prices (Yahoo + CoinGecko) for one user or – without userId – for everyone.
 * Failures keep the previous price and are reported in `errors`.
 */
export async function refreshPrices(userId?: string, opts: { deadline?: number } = {}): Promise<{ updated: number; errors: string[]; skipped: number }> {
  const where = and(ne(t.assets.priceSource, "manual"), eq(t.assets.archived, false), userId ? eq(t.assets.userId, userId) : undefined);
  const rows = await db.select().from(t.assets).where(where);
  const errors: string[] = [];
  let updated = 0;
  let skipped = 0;
  const now = new Date();
  const today = isoDate();
  /** global time budget: stop starting new fetches once the deadline passes */
  const timeUp = () => opts.deadline != null && Date.now() > opts.deadline;

  // Yahoo – one request per unique symbol
  const yahoo = rows.filter((r) => r.priceSource === "yahoo" && r.externalId);
  const bySymbol = new Map<string, AssetRow[]>();
  for (const r of yahoo) bySymbol.set(r.externalId!, [...(bySymbol.get(r.externalId!) ?? []), r]);
  await pool([...bySymbol.keys()], 4, async (symbol) => {
    if (timeUp()) {
      skipped += bySymbol.get(symbol)!.length;
      return;
    }
    try {
      const q = await yahooQuote(symbol, "5d");
      for (const a of bySymbol.get(symbol)!) {
        // asset currency is fixed at creation; skip if Yahoo suddenly reports another one
        if (q.currency !== a.currency) {
          errors.push(`${symbol}: měna ${q.currency} ≠ ${a.currency}`);
          continue;
        }
        await db.update(t.assets).set({ lastPrice: q.price, lastPriceAt: now }).where(eq(t.assets.id, a.id));
        await upsertPrices(a.id, q.history);
        updated++;
      }
    } catch (e) {
      errors.push(`${symbol}: ${(e as Error).message}`);
    }
  });

  // CoinGecko – batched
  const coins = rows.filter((r) => r.priceSource === "coingecko" && r.externalId);
  for (let i = 0; i < coins.length; i += 100) {
    const chunk = coins.slice(i, i + 100);
    if (timeUp()) {
      skipped += chunk.length;
      continue;
    }
    try {
      const prices = await coinPrices(
        chunk.map((c) => c.externalId!),
        chunk.map((c) => c.currency),
      );
      for (const a of chunk) {
        const p = prices[a.externalId!]?.[a.currency.toUpperCase()];
        if (!p) {
          errors.push(`${a.externalId}: cena v ${a.currency} nenalezena`);
          continue;
        }
        await db.update(t.assets).set({ lastPrice: p.price, lastPriceAt: now }).where(eq(t.assets.id, a.id));
        await upsertPrices(a.id, [{ date: today, price: p.price }]);
        // seed yesterday from the 24h change so day change works on day one
        if (p.change24h != null && p.change24h > -100) {
          await upsertPrices(a.id, [{ date: addDays(today, -1), price: p.price / (1 + p.change24h / 100) }], false);
        }
        updated++;
      }
    } catch (e) {
      errors.push(`CoinGecko: ${(e as Error).message}`);
    }
  }
  if (skipped) errors.push(`Časový limit: ${skipped} aktiv bez aktualizace`);
  return { updated, errors, skipped };
}

/** True if any active market-priced asset has a price older than ~6 h (or none yet). */
export async function pricesStale(userId: string): Promise<boolean> {
  const rows = await db
    .select({ at: t.assets.lastPriceAt })
    .from(t.assets)
    .where(and(eq(t.assets.userId, userId), ne(t.assets.priceSource, "manual"), eq(t.assets.archived, false)));
  return rows.some((r) => !r.at || Date.now() - r.at.getTime() > STALE_PRICE_MS);
}

/**
 * Starts a price refresh if prices are stale and returns `{ job }` (never rejects), or null.
 * The caller owns the lifetime: in Next, pass the job to `after()` so it isn't cut off after the response.
 */
export async function startRefreshIfStale(userId: string): Promise<{ job: Promise<void> } | null> {
  if (!(await pricesStale(userId))) return null;
  // wrapped in an object so `await` doesn't flatten (and thus wait for) the job
  const job = refreshPrices(userId).then(
    () => undefined,
    (e) => console.error("refreshIfStale", e),
  );
  return { job };
}

export async function getPriceHistory(userId: string, assetId: string, days = 365) {
  const a = await ownedAsset(userId, assetId);
  if (!a) return [];
  return db
    .select({ date: t.priceHistory.date, price: t.priceHistory.price })
    .from(t.priceHistory)
    .where(and(eq(t.priceHistory.assetId, assetId), gte(t.priceHistory.date, addDays(isoDate(), -days))))
    .orderBy(asc(t.priceHistory.date));
}

/* ───────────────────────────── Liabilities ───────────────────────────── */

export async function listLiabilities(userId: string): Promise<Liability[]> {
  const rows = await db.select().from(t.liabilities).where(eq(t.liabilities.userId, userId)).orderBy(desc(t.liabilities.balance));
  const fx = await fxMap(rows.map((r) => r.currency));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    balance: r.balance,
    currency: r.currency,
    interestRate: r.interestRate,
    notes: r.notes,
    updatedAt: r.updatedAt.toISOString(),
    balanceCzk: r.balance * (fx[r.currency] ?? 0),
    fxMissing: fx[r.currency] == null,
  }));
}

export async function upsertLiability(userId: string, input: LiabilityInput): Promise<{ id: string }> {
  const name = input.name.trim();
  if (!name) throw new Error("Chybí název");
  const values = {
    name,
    balance: Math.abs(input.balance),
    currency: normCurrency(input.currency),
    interestRate: input.interestRate ?? null,
    notes: input.notes?.trim() || null,
    updatedAt: new Date(),
  };
  if (input.id) {
    const [row] = await db
      .update(t.liabilities)
      .set(values)
      .where(and(eq(t.liabilities.id, input.id), eq(t.liabilities.userId, userId)))
      .returning({ id: t.liabilities.id });
    if (!row) throw new Error("Závazek nenalezen");
    return row;
  }
  const [row] = await db
    .insert(t.liabilities)
    .values({ userId, ...values })
    .returning({ id: t.liabilities.id });
  return row;
}

export async function deleteLiability(userId: string, id: string): Promise<{ deleted: boolean }> {
  const rows = await db
    .delete(t.liabilities)
    .where(and(eq(t.liabilities.id, id), eq(t.liabilities.userId, userId)))
    .returning({ id: t.liabilities.id });
  return { deleted: rows.length > 0 };
}

/* ───────────────────────────── Overview & net worth ───────────────────────────── */

export async function getPortfolioOverview(userId: string): Promise<PortfolioOverview> {
  const [all, liabilities] = await Promise.all([listHoldings(userId, { includeArchived: true }), listLiabilities(userId)]);
  const holdings = all.filter((h) => !h.archived);
  const archived = all.filter((h) => h.archived);
  const sum = (f: (h: Holding) => number) => holdings.reduce((s, h) => s + f(h), 0);

  const totalCzk = sum((h) => h.valueCzk);
  const dayChangeCzk = sum((h) => h.dayChangeCzk);
  const investedCzk = sum((h) => h.investedCzk);
  const unrealizedCzk = sum((h) => h.unrealizedCzk);
  const liabilitiesCzk = liabilities.reduce((s, l) => s + l.balanceCzk, 0);

  const byClass = new Map<AssetClass, number>();
  for (const h of holdings) byClass.set(h.class, (byClass.get(h.class) ?? 0) + h.valueCzk);
  const allocation: AllocationRow[] = [...byClass]
    .map(([cls, valueCzk]) => ({ class: cls, label: CLASS_LABEL[cls], valueCzk, pct: totalCzk > 0 ? (valueCzk / totalCzk) * 100 : 0 }))
    .filter((r) => r.valueCzk > 0)
    .sort((a, b) => b.valueCzk - a.valueCzk);

  const rebalance: RebalanceRow[] = holdings
    .filter((h) => h.targetPct != null)
    .map((h) => {
      const drift = h.weightPct - h.targetPct!;
      return {
        assetId: h.id,
        name: h.name,
        targetPct: h.targetPct!,
        currentPct: h.weightPct,
        driftPp: drift,
        actionCzk: ((h.targetPct! - h.weightPct) / 100) * totalCzk,
        needsAction: Math.abs(drift) > REBALANCE_THRESHOLD_PP,
      };
    })
    .sort((a, b) => Math.abs(b.driftPp) - Math.abs(a.driftPp));

  const fxMissing = [...new Set([...holdings.filter((h) => h.fxMissing).map((h) => h.currency), ...liabilities.filter((l) => l.fxMissing).map((l) => l.currency)])];
  const market = holdings.filter((h) => !h.manual && h.lastPriceAt);
  const pricesAsOf = market.length ? market.map((h) => h.lastPriceAt!).sort()[0] : null;
  const prevTotal = totalCzk - dayChangeCzk;

  return {
    totalCzk,
    dayChangeCzk,
    dayChangePct: prevTotal > 0 ? (dayChangeCzk / prevTotal) * 100 : 0,
    investedCzk,
    unrealizedCzk,
    unrealizedPct: investedCzk > 0 ? (unrealizedCzk / investedCzk) * 100 : 0,
    realizedCzk: sum((h) => h.realizedCzk),
    dividendsCzk: sum((h) => h.dividendsCzk),
    liabilitiesCzk,
    netWorthCzk: totalCzk - liabilitiesCzk,
    allocation,
    rebalance,
    holdings,
    archived,
    liabilities,
    pricesAsOf,
    fxMissing,
  };
}

export type NetWorthPoint = { date: string; assetsCzk: number; liabilitiesCzk: number; netCzk: number };

/**
 * Upsert today's (or `date`'s) net-worth snapshot from current values.
 * Throws (writes nothing) when an FX rate is unknown – a gap is better than a wrong data point.
 */
export async function snapshotNetWorth(userId: string, date: string = isoDate()): Promise<NetWorthPoint> {
  const o = await getPortfolioOverview(userId);
  if (o.fxMissing.length) throw new Error(`Snapshot čistého jmění přeskočen – chybí kurz ${o.fxMissing.join(", ")}`);
  const values = { assetsCzk: o.totalCzk, liabilitiesCzk: o.liabilitiesCzk, netCzk: o.netWorthCzk };
  await db
    .insert(t.netWorthSnapshots)
    .values({ userId, date, ...values })
    .onConflictDoUpdate({ target: [t.netWorthSnapshots.userId, t.netWorthSnapshots.date], set: values });
  return { date, ...values };
}

export async function getNetWorthHistory(userId: string, days = 365): Promise<NetWorthPoint[]> {
  return db
    .select({
      date: t.netWorthSnapshots.date,
      assetsCzk: t.netWorthSnapshots.assetsCzk,
      liabilitiesCzk: t.netWorthSnapshots.liabilitiesCzk,
      netCzk: t.netWorthSnapshots.netCzk,
    })
    .from(t.netWorthSnapshots)
    .where(and(eq(t.netWorthSnapshots.userId, userId), gte(t.netWorthSnapshots.date, addDays(isoDate(), -days))))
    .orderBy(asc(t.netWorthSnapshots.date));
}

/**
 * External price providers: Yahoo Finance (stocks/ETFs) and CoinGecko (crypto).
 * Pure network helpers – no DB access. All functions throw on failure; callers decide how to degrade.
 */
import { isoDate } from "@/lib/format";

// Yahoo answers 429 to full desktop-browser UAs without its consent cookies; the bare "Mozilla/5.0" works.
const UA = "Mozilla/5.0";
const YAHOO_HOSTS = ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"];
const COINGECKO = "https://api.coingecko.com/api/v3";

async function getJson<T>(url: string, timeoutMs = 8000): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** Yahoo rate-limits individual hosts; try query1 then query2. */
async function yahooJson<T>(path: string, timeoutMs?: number): Promise<T> {
  let lastErr: unknown;
  for (const host of YAHOO_HOSTS) {
    try {
      return await getJson<T>(host + path, timeoutMs);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Yahoo nedostupné");
}

/* ── Yahoo ─────────────────────────────────────────────── */

export type YahooSearchHit = { symbol: string; name: string; exchange: string; type: string };

export async function yahooSearch(query: string): Promise<YahooSearchHit[]> {
  const q = query.trim();
  if (!q) return [];
  const data = await yahooJson<{
    quotes?: { symbol?: string; shortname?: string; longname?: string; exchDisp?: string; exchange?: string; quoteType?: string; typeDisp?: string }[];
  }>(`/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0`);
  const allowed = new Set(["EQUITY", "ETF", "MUTUALFUND", "INDEX", "CURRENCY", "FUTURE"]);
  return (data.quotes ?? [])
    .filter((x) => x.symbol && (!x.quoteType || allowed.has(x.quoteType)))
    .map((x) => ({
      symbol: x.symbol!,
      name: x.longname || x.shortname || x.symbol!,
      exchange: x.exchDisp || x.exchange || "",
      type: x.typeDisp || x.quoteType || "",
    }));
}

/** Minor-unit currencies Yahoo reports for some exchanges (e.g. LSE in pence). */
const MINOR_UNITS: Record<string, [string, number]> = {
  GBp: ["GBP", 100],
  GBX: ["GBP", 100],
  ZAc: ["ZAR", 100],
  ILA: ["ILS", 100],
};

export type YahooQuote = {
  symbol: string;
  name: string | null;
  /** Yahoo instrumentType, e.g. EQUITY, ETF, CRYPTOCURRENCY */
  type: string | null;
  price: number;
  currency: string;
  /** daily closes (date → price) incl. today's regular market price */
  history: { date: string; price: number }[];
};

export async function yahooQuote(symbol: string, range: "5d" | "1mo" | "1y" | "5y" = "5d"): Promise<YahooQuote> {
  const data = await yahooJson<{
    chart?: {
      result?: {
        meta?: { regularMarketPrice?: number; currency?: string; longName?: string; shortName?: string; symbol?: string; instrumentType?: string };
        timestamp?: number[];
        indicators?: { quote?: { close?: (number | null)[] }[] };
      }[];
      error?: { description?: string } | null;
    };
  }>(`/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`);
  const r = data.chart?.result?.[0];
  const meta = r?.meta;
  if (!r || !meta || typeof meta.regularMarketPrice !== "number") {
    throw new Error(data.chart?.error?.description || `Žádná cena pro ${symbol}`);
  }
  let currency = meta.currency || "USD";
  let div = 1;
  if (MINOR_UNITS[currency]) [currency, div] = MINOR_UNITS[currency];

  const closes = r.indicators?.quote?.[0]?.close ?? [];
  const byDate = new Map<string, number>();
  (r.timestamp ?? []).forEach((ts, i) => {
    const c = closes[i];
    if (typeof c === "number" && Number.isFinite(c)) byDate.set(isoDate(new Date(ts * 1000)), c / div);
  });
  const price = meta.regularMarketPrice / div;
  byDate.set(isoDate(), price);
  return {
    symbol: meta.symbol || symbol,
    name: meta.longName || meta.shortName || null,
    type: meta.instrumentType || null,
    price,
    currency,
    history: [...byDate].map(([date, p]) => ({ date, price: p })),
  };
}

/* ── CoinGecko ─────────────────────────────────────────── */

export type CoinSearchHit = { id: string; name: string; symbol: string; rank: number | null };

export async function coinSearch(query: string): Promise<CoinSearchHit[]> {
  const q = query.trim();
  if (!q) return [];
  const data = await getJson<{ coins?: { id: string; name: string; symbol: string; market_cap_rank: number | null }[] }>(
    `${COINGECKO}/search?query=${encodeURIComponent(q)}`,
  );
  return (data.coins ?? []).slice(0, 8).map((c) => ({ id: c.id, name: c.name, symbol: c.symbol.toUpperCase(), rank: c.market_cap_rank }));
}

/** Batched prices: ids × currencies → { [id]: { [CUR]: { price, change24h } } } */
export async function coinPrices(
  ids: string[],
  currencies: string[],
): Promise<Record<string, Record<string, { price: number; change24h: number | null }>>> {
  if (!ids.length) return {};
  const vs = [...new Set(currencies.map((c) => c.toLowerCase()))].join(",");
  const data = await getJson<Record<string, Record<string, number>>>(
    `${COINGECKO}/simple/price?ids=${encodeURIComponent([...new Set(ids)].join(","))}&vs_currencies=${vs}&include_24hr_change=true`,
  );
  const out: Record<string, Record<string, { price: number; change24h: number | null }>> = {};
  for (const [id, row] of Object.entries(data)) {
    out[id] = {};
    for (const [k, v] of Object.entries(row)) {
      if (k.endsWith("_24h_change")) continue;
      const ch = row[`${k}_24h_change`];
      out[id][k.toUpperCase()] = { price: v, change24h: typeof ch === "number" ? ch : null };
    }
  }
  return out;
}

/** Daily history for backfilling a freshly added coin. */
export async function coinHistory(id: string, currency: string, days = 365): Promise<{ date: string; price: number }[]> {
  const data = await getJson<{ prices?: [number, number][] }>(
    `${COINGECKO}/coins/${encodeURIComponent(id)}/market_chart?vs_currency=${currency.toLowerCase()}&days=${days}&interval=daily`,
    10000,
  );
  const byDate = new Map<string, number>();
  for (const [ts, p] of data.prices ?? []) byDate.set(isoDate(new Date(ts)), p);
  return [...byDate].map(([date, price]) => ({ date, price }));
}

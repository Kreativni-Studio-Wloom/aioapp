/**
 * CSV import of portfolio transactions.
 * Columns: date,type,symbol,quantity,price,fee,currency (header optional; `,` `;` or tab separated).
 * Optional header columns: amount/total (gross total – unit price is derived when price is missing),
 * class (e.g. "crypto" – resolve the symbol on CoinGecko first).
 */
import { and, eq, inArray } from "drizzle-orm";
import { db, t } from "@/db";
import { fxRate } from "@/lib/fx";
import { toNum } from "@/lib/utils";
import type { AssetClass, AssetTxType, PriceSource } from "./constants";
import { coinSearch, yahooQuote } from "./providers";
import { addAssetTransaction, createAsset } from "./service";

export type CsvRow = {
  line: number;
  date: string;
  type: AssetTxType;
  symbol: string;
  quantity: number;
  price: number;
  fee: number;
  amount: number;
  currency: string | null;
  /** asset-class hint from an optional "class" column */
  classHint: "crypto" | null;
};

export type CsvAssetResolution = {
  symbol: string;
  status: "existing" | "new";
  assetId: string | null;
  name: string;
  class: AssetClass;
  currency: string;
  priceSource: PriceSource;
  externalId: string | null;
  rows: number;
};

export type CsvPreview = { rows: CsvRow[]; assets: CsvAssetResolution[]; errors: string[]; notes: string[] };

export type CsvImportResult = {
  assetsCreated: number;
  transactionsCreated: number;
  /** rows identical to an already stored transaction (same asset, date, type, quantity, price) */
  skippedDuplicates: number;
  /** rows whose prices were converted from the CSV currency to the instrument currency */
  converted: number;
  errors: string[];
  notes: string[];
};

/** Well-known crypto tickers → CoinGecko id (Yahoo maps many of these to unrelated ETFs/stocks). */
const KNOWN_CRYPTO: Record<string, { id: string; name: string }> = {
  BTC: { id: "bitcoin", name: "Bitcoin" },
  ETH: { id: "ethereum", name: "Ethereum" },
  SOL: { id: "solana", name: "Solana" },
  ADA: { id: "cardano", name: "Cardano" },
  XRP: { id: "ripple", name: "XRP" },
  DOGE: { id: "dogecoin", name: "Dogecoin" },
  DOT: { id: "polkadot", name: "Polkadot" },
  LTC: { id: "litecoin", name: "Litecoin" },
  BNB: { id: "binancecoin", name: "BNB" },
  USDT: { id: "tether", name: "Tether" },
  USDC: { id: "usd-coin", name: "USDC" },
  AVAX: { id: "avalanche-2", name: "Avalanche" },
  LINK: { id: "chainlink", name: "Chainlink" },
  TRX: { id: "tron", name: "TRON" },
  SHIB: { id: "shiba-inu", name: "Shiba Inu" },
  XLM: { id: "stellar", name: "Stellar" },
  BCH: { id: "bitcoin-cash", name: "Bitcoin Cash" },
  ATOM: { id: "cosmos", name: "Cosmos Hub" },
  XMR: { id: "monero", name: "Monero" },
  MATIC: { id: "matic-network", name: "Polygon" },
  POL: { id: "polygon-ecosystem-token", name: "POL (ex-MATIC)" },
  TON: { id: "the-open-network", name: "Toncoin" },
};

/** "BTC-USD" / "ETH-EUR" style pairs → base ticker. */
const cryptoBase = (symbol: string) => symbol.replace(/[-/](USD|EUR|CZK|USDT|GBP|CHF|PLN)$/, "");

/** Within one day: buys first, sells last (so a same-day buy+sell never looks oversold). */
const TYPE_ORDER: Record<AssetTxType, number> = { buy: 0, valuation: 1, dividend: 1, fee: 1, withdrawal: 1, sell: 2 };

const TYPE_ALIASES: Record<string, AssetTxType> = {
  buy: "buy",
  nakup: "buy",
  nákup: "buy",
  purchase: "buy",
  vklad: "buy",
  deposit: "buy",
  sell: "sell",
  prodej: "sell",
  sale: "sell",
  dividend: "dividend",
  dividenda: "dividend",
  div: "dividend",
  interest: "dividend",
  úrok: "dividend",
  fee: "fee",
  poplatek: "fee",
  withdrawal: "withdrawal",
  výběr: "withdrawal",
  vyber: "withdrawal",
  valuation: "valuation",
  ocenění: "valuation",
  oceneni: "valuation",
};

const COLS = ["date", "type", "symbol", "quantity", "price", "fee", "currency"] as const;
const HEADER_ALIASES: Record<string, (typeof COLS)[number] | "amount" | "class"> = {
  date: "date",
  datum: "date",
  type: "type",
  typ: "type",
  action: "type",
  symbol: "symbol",
  ticker: "symbol",
  quantity: "quantity",
  qty: "quantity",
  shares: "quantity",
  množství: "quantity",
  mnozstvi: "quantity",
  kusy: "quantity",
  price: "price",
  cena: "price",
  fee: "fee",
  poplatek: "fee",
  currency: "currency",
  měna: "currency",
  mena: "currency",
  amount: "amount",
  částka: "amount",
  castka: "amount",
  total: "amount",
  celkem: "amount",
  class: "class",
  třída: "class",
  trida: "class",
  asset_class: "class",
  druh: "class",
};

function splitLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === sep && !quoted) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function parseDate(s: string): string | null {
  const v = s.trim();
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = v.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

export function parseCsv(text: string): { rows: CsvRow[]; errors: string[] } {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const first = lines.find((l) => l.trim()) ?? "";
  const sep = first.includes("\t") ? "\t" : first.split(";").length > first.split(",").length ? ";" : ",";
  const errors: string[] = [];
  const rows: CsvRow[] = [];

  let map: Record<string, number> = Object.fromEntries(COLS.map((c, i) => [c, i]));
  let start = 0;
  const firstIdx = lines.indexOf(first);
  const headerCells = splitLine(first, sep).map((c) => c.toLowerCase());
  if (headerCells.some((c) => HEADER_ALIASES[c])) {
    map = {};
    headerCells.forEach((c, i) => {
      const k = HEADER_ALIASES[c];
      if (k && map[k] === undefined) map[k] = i;
    });
    start = firstIdx + 1;
  }

  const num = (v: string | undefined) => {
    if (v == null || v === "") return 0;
    // with "," separator a comma can't be a decimal separator inside unquoted values
    const n = toNum(sep === "," ? v.replace(/\s/g, "") : v.replace(/\./g, (m, off, str: string) => (str.includes(",") ? "" : m)));
    return n == null ? NaN : Math.abs(n);
  };

  for (let i = start; i < lines.length && rows.length < 1000; i++) {
    const raw = lines[i];
    if (!raw.trim()) continue;
    const c = splitLine(raw, sep);
    const get = (k: string) => (map[k] !== undefined ? c[map[k]] : undefined);
    const line = i + 1;
    const date = parseDate(get("date") ?? "");
    const type = TYPE_ALIASES[(get("type") ?? "").trim().toLowerCase()];
    const symbol = (get("symbol") ?? "").trim().toUpperCase();
    if (!date) {
      errors.push(`Řádek ${line}: neplatné datum`);
      continue;
    }
    if (!type) {
      errors.push(`Řádek ${line}: neznámý typ „${get("type") ?? ""}“`);
      continue;
    }
    if (!symbol) {
      errors.push(`Řádek ${line}: chybí symbol`);
      continue;
    }
    const quantity = num(get("quantity"));
    const price = num(get("price"));
    const fee = num(get("fee"));
    let amount = num(get("amount"));
    if ([quantity, price, fee, amount].some((n) => Number.isNaN(n))) {
      errors.push(`Řádek ${line}: neplatné číslo`);
      continue;
    }
    // dividend/fee/withdrawal/valuation rows: amount in price column (or quantity × price)
    if (!amount && type !== "buy" && type !== "sell") amount = quantity && price ? quantity * price : price || quantity;
    if ((type === "buy" || type === "sell") && !(quantity > 0) && !(amount > 0)) {
      errors.push(`Řádek ${line}: chybí množství`);
      continue;
    }
    let unitPrice = price;
    if ((type === "buy" || type === "sell") && quantity > 0) {
      // only a total given → derive the unit price; never import a silent zero cost
      if (!(unitPrice > 0) && amount > 0) unitPrice = amount / quantity;
      if (!(unitPrice > 0)) {
        errors.push(`Řádek ${line}: chybí cena nebo celková částka`);
        continue;
      }
    }
    const currency = (get("currency") ?? "").trim().toUpperCase() || null;
    const cls = (get("class") ?? "").trim().toLowerCase();
    const classHint = ["crypto", "krypto", "cryptocurrency", "kryptoměna", "kryptomena"].includes(cls) ? "crypto" : null;
    rows.push({ line, date, type, symbol, quantity, price: unitPrice, fee, amount, currency, classHint });
  }
  // chronological order; same day: buys before sells (stable → file order otherwise)
  rows.sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : TYPE_ORDER[a.type] - TYPE_ORDER[b.type]));
  return { rows, errors };
}

/** Parse and resolve symbols to existing assets / Yahoo / CoinGecko / manual – nothing is written. */
export async function previewCsvImport(userId: string, text: string): Promise<CsvPreview> {
  const { rows, errors } = parseCsv(text);
  const notes: string[] = [];
  const existing = await db
    .select()
    .from(t.assets)
    .where(and(eq(t.assets.userId, userId)));
  const symbols = [...new Set(rows.map((r) => r.symbol))];
  const assets: CsvAssetResolution[] = [];

  for (const symbol of symbols) {
    const symRows = rows.filter((r) => r.symbol === symbol);
    const rowCurrency = symRows.find((r) => r.currency)?.currency ?? "CZK";
    const hit = existing.find((a) => a.symbol?.toUpperCase() === symbol || a.externalId?.toUpperCase() === symbol);
    if (hit) {
      assets.push({
        symbol,
        status: "existing",
        assetId: hit.id,
        name: hit.name,
        class: hit.class,
        currency: hit.currency,
        priceSource: hit.priceSource,
        externalId: hit.externalId,
        rows: symRows.length,
      });
      continue;
    }
    let resolved: CsvAssetResolution | null = null;
    const known = KNOWN_CRYPTO[cryptoBase(symbol)];
    const cryptoFirst = !!known || symRows.some((r) => r.classHint === "crypto");
    if (known) {
      resolved = {
        symbol,
        status: "new",
        assetId: null,
        name: known.name,
        class: "crypto",
        currency: rowCurrency,
        priceSource: "coingecko",
        externalId: known.id,
        rows: symRows.length,
      };
    } else if (cryptoFirst) {
      resolved = await coinResolve(symbol, rowCurrency, symRows.length);
    }
    if (!resolved) {
      try {
        const q = await yahooQuote(symbol, "5d");
        if (q.type !== "CRYPTOCURRENCY") {
          resolved = {
            symbol,
            status: "new",
            assetId: null,
            name: q.name ?? symbol,
            class: q.type === "ETF" || q.type === "MUTUALFUND" ? "etf" : "stock",
            currency: q.currency,
            priceSource: "yahoo",
            externalId: q.symbol,
            rows: symRows.length,
          };
        }
      } catch {
        /* not on Yahoo */
      }
    }
    if (!resolved && !cryptoFirst) resolved = await coinResolve(symbol, rowCurrency, symRows.length);
    assets.push(
      resolved ?? {
        symbol,
        status: "new",
        assetId: null,
        name: symbol,
        class: "other",
        currency: rowCurrency,
        priceSource: "manual",
        externalId: null,
        rows: symRows.length,
      },
    );
  }

  for (const a of assets) {
    const mismatch = rows.filter((r) => r.symbol === a.symbol && r.currency && r.currency !== a.currency);
    if (mismatch.length) {
      const curs = [...new Set(mismatch.map((r) => r.currency))].join(", ");
      notes.push(`${a.symbol}: ${mismatch.length} řádků v ${curs} se přepočte na ${a.currency} kurzem ČNB ke dni transakce`);
    }
  }
  return { rows, assets, errors, notes };
}

async function coinResolve(symbol: string, currency: string, rows: number): Promise<CsvAssetResolution | null> {
  try {
    const base = cryptoBase(symbol);
    const coins = await coinSearch(base);
    const coin = coins.find((c) => c.symbol === base);
    if (!coin) return null;
    return { symbol, status: "new", assetId: null, name: coin.name, class: "crypto", currency, priceSource: "coingecko", externalId: coin.id, rows };
  } catch {
    return null;
  }
}

/** CZK cross rate: units of `to` per 1 unit of `from` on `date` (ČNB). Throws if a rate is unavailable. */
async function crossRate(from: string, to: string, date: string): Promise<number> {
  if (from === to) return 1;
  const [a, b] = await Promise.all([fxRate(from, date), fxRate(to, date)]);
  if (!(a > 0) || !(b > 0)) throw new Error(`Kurz ${from}/${to} není k dispozici`);
  return a / b;
}

const sig = (n: number) => (n ? Number(n).toPrecision(8) : "0");
const dupKey = (assetId: string, date: string, type: string, quantity: number, price: number, amount: number, withAmount: boolean) =>
  [assetId, date, type, sig(quantity), sig(price), withAmount ? sig(amount) : ""].join("|");

export async function importCsv(userId: string, text: string): Promise<CsvImportResult> {
  const preview = await previewCsvImport(userId, text);
  const errors = [...preview.errors];
  const notes: string[] = [];
  const ids = new Map<string, string>();
  const currencyOf = new Map<string, string>();
  let assetsCreated = 0;
  let transactionsCreated = 0;
  let skippedDuplicates = 0;
  let converted = 0;
  for (const a of preview.assets) {
    if (a.assetId) {
      ids.set(a.symbol, a.assetId);
      currencyOf.set(a.symbol, a.currency);
      continue;
    }
    try {
      const created = await createAsset(userId, {
        class: a.class,
        name: a.name,
        symbol: a.symbol,
        currency: a.currency,
        priceSource: a.priceSource,
        externalId: a.externalId,
      });
      ids.set(a.symbol, created.id);
      currencyOf.set(a.symbol, created.currency);
      assetsCreated++;
    } catch (e) {
      errors.push(`${a.symbol}: ${(e as Error).message}`);
    }
  }
  // existing transactions → dedup keys (re-importing the same file must not double positions)
  const assetIds = [...new Set(ids.values())];
  const existing = assetIds.length
    ? await db
        .select()
        .from(t.assetTransactions)
        .where(and(eq(t.assetTransactions.userId, userId), inArray(t.assetTransactions.assetId, assetIds)))
    : [];
  const isTrade = (type: AssetTxType) => type === "buy" || type === "sell";
  // unit trades compare quantity × price; everything else (incl. manual deposits without units) also the amount
  const withAmount = (type: AssetTxType, quantity: number) => !(isTrade(type) && quantity > 0);
  const seen = new Set(existing.map((x) => dupKey(x.assetId, x.date, x.type, x.quantity, x.price, x.amount, withAmount(x.type, x.quantity))));

  for (const r of preview.rows) {
    const assetId = ids.get(r.symbol);
    if (!assetId) continue;
    try {
      // CSV currency ≠ instrument currency → convert at the ČNB rate of the transaction date
      const target = currencyOf.get(r.symbol) ?? r.currency ?? "CZK";
      let k = 1;
      if (r.currency && r.currency !== target) {
        k = await crossRate(r.currency, target, r.date);
        converted++;
      }
      const price = r.price * k;
      const fee = r.fee * k;
      const amount = r.amount * k;
      if (seen.has(dupKey(assetId, r.date, r.type, r.quantity, price, amount, withAmount(r.type, r.quantity)))) {
        skippedDuplicates++;
        continue;
      }
      await addAssetTransaction(userId, {
        assetId,
        type: r.type,
        date: r.date,
        quantity: r.quantity,
        price,
        fee,
        amount: amount || null,
        note: k !== 1 ? `Import CSV (přepočteno z ${r.currency}, kurz ${+k.toFixed(6)})` : "Import CSV",
      });
      transactionsCreated++;
    } catch (e) {
      errors.push(`Řádek ${r.line}: ${(e as Error).message}`);
    }
  }
  if (converted) notes.push(`${converted} řádků přepočteno na měnu instrumentu kurzem ČNB ke dni transakce`);
  if (skippedDuplicates) notes.push(`${skippedDuplicates} řádků přeskočeno – stejná transakce už existuje`);
  return { assetsCreated, transactionsCreated, skippedDuplicates, converted, errors, notes };
}

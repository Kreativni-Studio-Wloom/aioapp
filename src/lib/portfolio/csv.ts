/**
 * CSV import of portfolio transactions.
 * Columns: date,type,symbol,quantity,price,fee,currency (header optional; `,` `;` or tab separated).
 */
import { and, eq } from "drizzle-orm";
import { db, t } from "@/db";
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

export type CsvPreview = { rows: CsvRow[]; assets: CsvAssetResolution[]; errors: string[] };

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
const HEADER_ALIASES: Record<string, (typeof COLS)[number] | "amount"> = {
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
    const currency = (get("currency") ?? "").trim().toUpperCase() || null;
    rows.push({ line, date, type, symbol, quantity, price, fee, amount, currency });
  }
  return { rows, errors };
}

/** Parse and resolve symbols to existing assets / Yahoo / CoinGecko / manual – nothing is written. */
export async function previewCsvImport(userId: string, text: string): Promise<CsvPreview> {
  const { rows, errors } = parseCsv(text);
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
    if (!resolved) {
      try {
        const coins = await coinSearch(symbol);
        const coin = coins.find((c) => c.symbol === symbol);
        if (coin)
          resolved = {
            symbol,
            status: "new",
            assetId: null,
            name: coin.name,
            class: "crypto",
            currency: rowCurrency,
            priceSource: "coingecko",
            externalId: coin.id,
            rows: symRows.length,
          };
      } catch {
        /* ignore */
      }
    }
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
    if (a.priceSource === "manual") continue;
    const mismatch = rows.find((r) => r.symbol === a.symbol && r.currency && r.currency !== a.currency);
    if (mismatch) errors.push(`${a.symbol}: měna v CSV (${mismatch.currency}) se liší od měny instrumentu (${a.currency}) – ceny se berou v ${a.currency}`);
  }
  return { rows, assets, errors };
}

export async function importCsv(userId: string, text: string): Promise<{ assetsCreated: number; transactionsCreated: number; errors: string[] }> {
  const preview = await previewCsvImport(userId, text);
  const errors = [...preview.errors];
  const ids = new Map<string, string>();
  let assetsCreated = 0;
  let transactionsCreated = 0;
  for (const a of preview.assets) {
    if (a.assetId) {
      ids.set(a.symbol, a.assetId);
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
      assetsCreated++;
    } catch (e) {
      errors.push(`${a.symbol}: ${(e as Error).message}`);
    }
  }
  for (const r of preview.rows) {
    const assetId = ids.get(r.symbol);
    if (!assetId) continue;
    try {
      await addAssetTransaction(userId, {
        assetId,
        type: r.type,
        date: r.date,
        quantity: r.quantity,
        price: r.price,
        fee: r.fee,
        amount: r.amount || null,
        note: "Import CSV",
      });
      transactionsCreated++;
    } catch (e) {
      errors.push(`Řádek ${r.line}: ${(e as Error).message}`);
    }
  }
  return { assetsCreated, transactionsCreated, errors };
}

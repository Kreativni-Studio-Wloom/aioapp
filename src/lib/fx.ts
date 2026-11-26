import { and, eq } from "drizzle-orm";
import { db, t } from "@/db";
import { isoDate } from "./format";

export const CURRENCIES = ["CZK", "EUR", "USD", "GBP", "CHF", "PLN"] as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Today's fixing isn't stored under today until ČNB publishes it (~14:30) – memoise the interim answer briefly. */
const todayMemo = new Map<string, { at: number; rates: Record<string, number> }>();
const TODAY_TTL = 30 * 60 * 1000;

/**
 * Fetch the ČNB daily fixing valid for a date and store all rates – under the actual fixing date and,
 * when `aliasDate` is given (a past weekend/holiday), also under that date. Returns currency → CZK per unit.
 */
async function fetchCnb(dateIso: string, aliasDate?: string): Promise<Record<string, number>> {
  const [y, m, d] = dateIso.split("-");
  const url = `https://www.cnb.cz/cs/financni-trhy/devizovy-trh/kurzy-devizoveho-trhu/kurzy-devizoveho-trhu/denni_kurz.txt?date=${d}.${m}.${y}`;
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`ČNB ${res.status}`);
  const text = await res.text();
  const lines = text.trim().split("\n");
  // first line: "25.11.2026 #227" – the actual fixing date (may be an earlier business day)
  const [fd, fm, fy] = (lines[0] ?? "").split(" ")[0].split(".");
  const fixingDate = `${fy}-${fm}-${fd}`;
  if (!DATE_RE.test(fixingDate)) throw new Error("ČNB: neočekávaný formát odpovědi");
  const rates: Record<string, number> = {};
  for (const line of lines.slice(2)) {
    const [, , amount, code, rate] = line.split("|");
    if (!code || !rate) continue;
    const v = Number(rate.replace(",", ".")) / Number(amount);
    if (Number.isFinite(v) && v > 0) rates[code.trim()] = v;
  }
  const dates = aliasDate && aliasDate !== fixingDate ? [fixingDate, aliasDate] : [fixingDate];
  const rows = dates.flatMap((date) => Object.entries(rates).map(([currency, rate]) => ({ date, currency, rate })));
  if (rows.length) await db.insert(t.fxRates).values(rows).onConflictDoNothing();
  return rates;
}

/**
 * CZK per 1 unit of `currency` on `date` – the ČNB fixing valid for that day (for weekends/holidays
 * the last earlier fixing; for future dates today's). Throws when the rate can't be obtained –
 * never silently falls back to 1 or a stale rate.
 */
export async function fxRate(currency: string, date: string = isoDate()): Promise<number> {
  currency = currency.toUpperCase();
  if (currency === "CZK") return 1;
  const today = isoDate();
  const day = date > today ? today : date;
  const [cached] = await db
    .select({ rate: t.fxRates.rate })
    .from(t.fxRates)
    .where(and(eq(t.fxRates.currency, currency), eq(t.fxRates.date, day)))
    .limit(1);
  if (cached) return cached.rate;
  const memo = day === today ? todayMemo.get(day) : undefined;
  if (memo && Date.now() - memo.at < TODAY_TTL && memo.rates[currency]) return memo.rates[currency];
  let rates: Record<string, number>;
  try {
    // only alias past days – today's fixing may not be published yet (ČNB then returns yesterday's)
    rates = await fetchCnb(day, day < today ? day : undefined);
    if (day === today) todayMemo.set(day, { at: Date.now(), rates });
  } catch (e) {
    console.error("fxRate", currency, day, e);
    throw new Error(`Kurz ${currency} k ${day} se nepodařilo načíst z ČNB, zkus to prosím později`);
  }
  if (rates[currency]) return rates[currency];
  throw new Error(`Kurz ${currency} není u ČNB k dispozici`);
}

export async function toCzk(amount: number, currency: string, date?: string) {
  const rate = await fxRate(currency, date);
  return { rate, czk: amount * rate };
}

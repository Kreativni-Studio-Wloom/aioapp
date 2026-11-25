import { and, desc, eq, lte } from "drizzle-orm";
import { db, t } from "@/db";
import { isoDate } from "./format";

export const CURRENCIES = ["CZK", "EUR", "USD", "GBP", "CHF", "PLN"] as const;

/** Fetch the ČNB daily fixing for a date and store all rates. Returns map currency → CZK per unit. */
async function fetchCnb(dateIso: string): Promise<Record<string, number>> {
  const [y, m, d] = dateIso.split("-");
  const url = `https://www.cnb.cz/cs/financni-trhy/devizovy-trh/kurzy-devizoveho-trhu/kurzy-devizoveho-trhu/denni_kurz.txt?date=${d}.${m}.${y}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`ČNB ${res.status}`);
  const text = await res.text();
  const lines = text.trim().split("\n");
  // first line: "25.11.2026 #227" – the actual fixing date (may be an earlier business day)
  const [fd, fm, fy] = lines[0].split(" ")[0].split(".");
  const fixingDate = `${fy}-${fm}-${fd}`;
  const rates: Record<string, number> = {};
  for (const line of lines.slice(2)) {
    const [, , amount, code, rate] = line.split("|");
    if (!code || !rate) continue;
    rates[code] = Number(rate.replace(",", ".")) / Number(amount);
  }
  const rows = Object.entries(rates).map(([currency, rate]) => ({ date: fixingDate, currency, rate }));
  if (rows.length) await db.insert(t.fxRates).values(rows).onConflictDoNothing();
  return rates;
}

/** CZK per 1 unit of `currency` on `date` (falls back to the latest known earlier rate). */
export async function fxRate(currency: string, date: string = isoDate()): Promise<number> {
  if (currency === "CZK") return 1;
  const cached = await db
    .select({ rate: t.fxRates.rate, date: t.fxRates.date })
    .from(t.fxRates)
    .where(and(eq(t.fxRates.currency, currency), lte(t.fxRates.date, date)))
    .orderBy(desc(t.fxRates.date))
    .limit(1);
  // ČNB publishes on business days; a rate up to 4 days old is the valid fixing for weekends/holidays
  const fresh = cached[0] && (new Date(date).getTime() - new Date(cached[0].date).getTime()) / 864e5 <= 4;
  if (fresh) return cached[0].rate;
  try {
    const rates = await fetchCnb(date > isoDate() ? isoDate() : date);
    if (rates[currency]) return rates[currency];
  } catch (e) {
    console.error("fxRate", e);
  }
  if (cached[0]) return cached[0].rate;
  throw new Error(`Kurz ${currency} není k dispozici`);
}

export async function toCzk(amount: number, currency: string, date?: string) {
  const rate = await fxRate(currency, date);
  return { rate, czk: amount * rate };
}

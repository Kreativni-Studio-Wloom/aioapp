const LOCALE = "cs-CZ";

export function money(value: number | null | undefined, currency = "CZK", opts: { decimals?: number; sign?: boolean } = {}) {
  const v = Number(value ?? 0);
  const decimals = opts.decimals ?? (Math.abs(v) >= 1000 || currency === "CZK" ? 0 : 2);
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    signDisplay: opts.sign ? "exceptZero" : "auto",
  }).format(v);
}

export function num(value: number | null | undefined, decimals = 0) {
  return new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 0, maximumFractionDigits: decimals }).format(Number(value ?? 0));
}

export function pct(value: number | null | undefined, decimals = 1, sign = false) {
  return new Intl.NumberFormat(LOCALE, {
    style: "percent",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    signDisplay: sign ? "exceptZero" : "auto",
  }).format(Number(value ?? 0) / 100);
}

/** YYYY-MM-DD in Europe/Prague for a Date (default now). */
export function isoDate(d: Date = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague" }).format(d);
}

export function addDays(iso: string, days: number) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function dateLabel(iso: string | Date, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) {
  const d = typeof iso === "string" ? new Date(iso.length === 10 ? iso + "T12:00:00" : iso) : iso;
  return new Intl.DateTimeFormat(LOCALE, { timeZone: "Europe/Prague", ...opts }).format(d);
}

export function relativeDay(iso: string) {
  const today = isoDate();
  if (iso === today) return "Dnes";
  if (iso === addDays(today, -1)) return "Včera";
  if (iso === addDays(today, 1)) return "Zítra";
  return dateLabel(iso, { weekday: "short", day: "numeric", month: "short" });
}

export function duration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h) return `${h} h ${m} min`;
  if (m) return `${m}:${String(s).padStart(2, "0")}`;
  return `${s} s`;
}

export const MONTHS_CS = ["Led", "Úno", "Bře", "Dub", "Kvě", "Čvn", "Čvc", "Srp", "Zář", "Říj", "Lis", "Pro"];

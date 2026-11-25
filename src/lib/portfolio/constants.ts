/** Client-safe constants and labels for the portfolio module. */
import type { AssetClass } from "@/db/schema";

export type { AssetClass };
export type AssetTxType = "buy" | "sell" | "dividend" | "fee" | "withdrawal" | "valuation";
export type PriceSource = "manual" | "coingecko" | "yahoo";

export const ASSET_CLASSES: AssetClass[] = ["stock", "etf", "crypto", "cash", "real_estate", "commodity", "bond", "other"];

export const CLASS_LABEL: Record<AssetClass, string> = {
  stock: "Akcie",
  etf: "ETF",
  crypto: "Krypto",
  cash: "Hotovost",
  real_estate: "Nemovitosti",
  commodity: "Komodity",
  bond: "Dluhopisy",
  other: "Ostatní",
};

/** Default price source per class (stock/etf → Yahoo search, crypto → CoinGecko, rest manual). */
export function defaultSource(cls: AssetClass): PriceSource {
  if (cls === "stock" || cls === "etf") return "yahoo";
  if (cls === "crypto") return "coingecko";
  return "manual";
}

export const TX_LABEL: Record<AssetTxType, string> = {
  buy: "Nákup",
  sell: "Prodej",
  dividend: "Dividenda",
  fee: "Poplatek",
  withdrawal: "Výběr zisku",
  valuation: "Ocenění",
};

/** Labels used for manually valued assets (cash, real estate…), where buy/sell mean deposit/withdrawal of capital. */
export const MANUAL_TX_LABEL: Record<AssetTxType, string> = {
  buy: "Vklad",
  sell: "Výběr vkladu",
  dividend: "Úrok / dividenda",
  fee: "Poplatek",
  withdrawal: "Výběr zisku",
  valuation: "Ocenění",
};

export const INCOME_CATEGORY: Partial<Record<AssetTxType, string>> = {
  dividend: "Dividenda",
  withdrawal: "Výběr zisku",
};

/** Monochrome shades for allocation bars (fg → subtle). */
export const SHADES = ["var(--fg)", "var(--fg-soft)", "var(--muted)", "var(--subtle)", "var(--line-strong)"];

export const REBALANCE_THRESHOLD_PP = 5;
export const STALE_PRICE_MS = 6 * 3600 * 1000;

/** Currencies offered in forms (ČNB publishes all of them). */
export const PORTFOLIO_CURRENCIES = ["CZK", "EUR", "USD", "GBP", "CHF", "PLN"] as const;

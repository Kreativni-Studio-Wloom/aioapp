// Client-safe constants and types for the income module (no DB imports here).

import type { IncomeSourceType } from "@/db/schema";

export type TxKind = "income" | "expense";
export type { IncomeSourceType };

export const SOURCE_TYPES: { value: IncomeSourceType; label: string }[] = [
  { value: "business", label: "Podnikání" },
  { value: "rental", label: "Pronájem" },
  { value: "investment", label: "Investice" },
  { value: "job", label: "Zaměstnání" },
  { value: "other", label: "Ostatní" },
];

export const SOURCE_TYPE_LABEL: Record<IncomeSourceType, string> = Object.fromEntries(
  SOURCE_TYPES.map((s) => [s.value, s.label]),
) as Record<IncomeSourceType, string>;

export const KIND_LABEL: Record<TxKind, string> = { income: "Příjem", expense: "Výdaj" };

/** Default category suggestions (merged with the user's previously used ones). */
export const DEFAULT_CATEGORIES: Record<TxKind, string[]> = {
  income: ["Tržba", "Nájem", "Mzda", "Výběr zisku", "Dividenda", "Ostatní"],
  expense: ["Stánek/poplatek", "Suroviny", "Doprava", "Personál", "Vybavení", "Energie", "Opravy", "Daně", "Ostatní"],
};

/** Event-specific defaults (business sources). */
export const EVENT_CATEGORIES: Record<TxKind, string[]> = {
  income: ["Tržba", "Ostatní"],
  expense: ["Stánek/poplatek", "Suroviny", "Doprava", "Personál", "Ubytování", "Ostatní"],
};

/** Mirrors `CURRENCIES` in `@/lib/fx` (that module is server-only). */
export const CURRENCIES = ["CZK", "EUR", "USD", "GBP", "CHF", "PLN"] as const;

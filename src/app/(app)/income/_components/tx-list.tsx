"use client";

import { AnimatePresence, motion } from "motion/react";
import { Repeat } from "lucide-react";
import { money, relativeDay } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Tx } from "@/lib/income/service";
import { useTxSheet } from "./tx-sheet";

/** Transaction rows; tapping a row opens the edit sheet. */
export function TxList({ items, hideSource, hideEvent, empty = "Zatím žádné transakce" }: { items: Tx[]; hideSource?: boolean; hideEvent?: boolean; empty?: string }) {
  const { openEdit } = useTxSheet();
  if (!items.length) return <p className="py-6 text-center text-sm text-muted">{empty}</p>;
  return (
    <ul className="-mx-1">
      <AnimatePresence initial={false}>
        {items.map((tx) => {
          const meta = [!hideSource && tx.sourceName, !hideEvent && tx.eventName, tx.note && (tx.category ? tx.note : null)].filter(Boolean).join(" · ");
          return (
            <motion.li
              key={tx.id}
              layout
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
            >
              <button
                type="button"
                onClick={() => openEdit(tx)}
                className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl px-1 py-2.5 text-left transition-colors hover:bg-card-hover"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 truncate text-[15px] font-medium">
                    {tx.recurringRuleId && <Repeat className="h-3.5 w-3.5 shrink-0 text-muted" aria-label="Opakovaná" />}
                    <span className="truncate">{tx.category ?? tx.note ?? (tx.kind === "income" ? "Příjem" : "Výdaj")}</span>
                  </div>
                  <div className="truncate text-xs text-muted">
                    {relativeDay(tx.date)}
                    {meta && ` · ${meta}`}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className={cn("num text-[15px] font-semibold", tx.kind === "income" ? "text-pos" : "text-fg")}>
                    {tx.kind === "income" ? "+" : "−"}
                    {money(tx.amountCzk)}
                  </div>
                  {tx.currency !== "CZK" && <div className="num text-xs text-muted">{money(tx.amount, tx.currency)}</div>}
                </div>
              </button>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}

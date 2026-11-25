"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion } from "motion/react";
import { Select } from "@/components/ui";
import { Segmented, Spinner } from "@/components/ui/client";
import { MONTHS_CS, isoDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/income", label: "Přehled" },
  { href: "/income/transactions", label: "Transakce" },
  { href: "/income/sources", label: "Zdroje" },
  { href: "/income/events", label: "Akce" },
  { href: "/income/recurring", label: "Opakované" },
];

export function IncomeNav() {
  const pathname = usePathname();
  return (
    <nav className="-mx-4 mb-6 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0">
      <div className="flex w-max gap-1">
        {TABS.map((tab) => {
          const active = tab.href === "/income" ? pathname === "/income" : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn("relative rounded-full px-3.5 py-2 text-sm font-medium transition-colors", active ? "text-inverse" : "text-muted hover:text-fg")}
            >
              {active && <motion.span layoutId="income-tab" className="absolute inset-0 rounded-full bg-fg" transition={{ type: "spring", damping: 30, stiffness: 400 }} />}
              <span className="relative">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function shiftMonth(ym: string, n: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

/** Měsíc / Rok / Vše switch with year picker and month stepper. Writes `?m=YYYY-MM` or `?y=YYYY|all`. */
export function PeriodSwitch({ kind, year, month, years }: { kind: "month" | "year" | "all"; year: number | null; month: string | null; years: number[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const today = isoDate();
  const curYm = today.slice(0, 7);
  const go = (qs: string) => start(() => router.push(`/income?${qs}`, { scroll: false }));

  function setKind(k: "month" | "year" | "all") {
    if (k === "all") go("y=all");
    else if (k === "year") go(`y=${year ?? today.slice(0, 4)}`);
    else go(`m=${year && String(year) !== today.slice(0, 4) ? `${year}-12` : curYm}`);
  }

  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      <Segmented
        value={kind}
        onChange={setKind}
        layoutId="income-period"
        options={[
          { value: "month", label: "Měsíc" },
          { value: "year", label: "Rok" },
          { value: "all", label: "Vše" },
        ]}
      />
      {kind === "year" && (
        <div className="w-28">
          <Select value={String(year)} onChange={(e) => go(`y=${e.target.value}`)} aria-label="Rok">
            {years.map((y) => (
              <option key={y}>{y}</option>
            ))}
          </Select>
        </div>
      )}
      {kind === "month" && month && (
        <div className="flex items-center gap-1 rounded-xl bg-card p-1">
          <button type="button" onClick={() => go(`m=${shiftMonth(month, -1)}`)} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-card-hover hover:text-fg" aria-label="Předchozí měsíc">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="num min-w-20 text-center text-sm font-medium">
            {MONTHS_CS[Number(month.slice(5)) - 1]} {month.slice(0, 4)}
          </span>
          <button
            type="button"
            onClick={() => go(`m=${shiftMonth(month, 1)}`)}
            disabled={month >= curYm}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-card-hover hover:text-fg disabled:opacity-30"
            aria-label="Další měsíc"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
      {pending && <Spinner className="text-muted" />}
    </div>
  );
}

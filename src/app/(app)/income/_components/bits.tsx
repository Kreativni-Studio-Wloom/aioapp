import Link from "next/link";
import type { ReactNode } from "react";
import { MapPin } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { dateLabel, money, pct } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { EventWithStats } from "@/lib/income/service";
import { IncomeNav } from "./nav";

export function IncomeHeader({ title, subtitle, action, back }: { title: string; subtitle?: ReactNode; action?: ReactNode; back?: string }) {
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} action={action} back={back} />
      {!back && <IncomeNav />}
    </>
  );
}

/** Money with explicit sign and pos/neg colour. */
export function SignedMoney({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("num", value > 0 && "text-pos", value < 0 && "text-neg", className)}>
      {value > 0 ? "+" : value < 0 ? "−" : ""}
      {money(Math.abs(value))}
    </span>
  );
}

export function eventDates(e: { startDate: string; endDate: string | null }) {
  if (!e.endDate || e.endDate === e.startDate) return dateLabel(e.startDate, { day: "numeric", month: "short", year: "numeric" });
  const sameMonth = e.startDate.slice(0, 7) === e.endDate.slice(0, 7);
  return sameMonth
    ? `${Number(e.startDate.slice(8))}.–${dateLabel(e.endDate, { day: "numeric", month: "short", year: "numeric" })}`
    : `${dateLabel(e.startDate)} – ${dateLabel(e.endDate, { day: "numeric", month: "short", year: "numeric" })}`;
}

export function EventRow({ e, showSource, metric = "net" }: { e: EventWithStats; showSource?: boolean; metric?: "net" | "perDay" }) {
  return (
    <Link href={`/income/events/${e.id}`} className="-mx-1 flex min-h-14 items-center justify-between gap-3 rounded-xl px-1 py-2.5 transition-colors hover:bg-card-hover">
      <div className="min-w-0">
        <div className="truncate text-[15px] font-medium">{e.name}</div>
        <div className="flex items-center gap-1 truncate text-xs text-muted">
          <span>{eventDates(e)}</span>
          {e.location && (
            <>
              <span>·</span>
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{e.location}</span>
            </>
          )}
          {showSource && <span className="truncate">· {e.sourceName}</span>}
        </div>
      </div>
      <div className="shrink-0 text-right">
        {e.count === 0 ? (
          <span className="text-xs text-subtle">bez záznamů</span>
        ) : metric === "perDay" ? (
          <>
            <SignedMoney value={e.profitPerDay} className="text-[15px] font-semibold" />
            <div className="num text-xs text-muted">/ den · {e.days} d</div>
          </>
        ) : (
          <>
            <SignedMoney value={e.net} className="text-[15px] font-semibold" />
            <div className="num text-xs text-muted">{e.margin != null ? `marže ${pct(e.margin, 0)}` : `výdaje ${money(e.expense)}`}</div>
          </>
        )}
      </div>
    </Link>
  );
}

/** Horizontal share bar row. */
export function ShareRow({ label, value, share, sub, href }: { label: ReactNode; value: ReactNode; share: number; sub?: ReactNode; href?: string }) {
  const inner = (
    <>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="truncate text-sm font-medium">{label}</span>
        <span className="num shrink-0 text-sm">{value}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-fg" style={{ width: `${Math.max(0, Math.min(100, share))}%` }} />
      </div>
      {sub && <div className="num mt-1 text-xs text-muted">{sub}</div>}
    </>
  );
  return href ? (
    <Link href={href} className="-mx-2 block rounded-xl px-2 py-2 transition-colors hover:bg-card-hover">
      {inner}
    </Link>
  ) : (
    <div className="py-2">{inner}</div>
  );
}

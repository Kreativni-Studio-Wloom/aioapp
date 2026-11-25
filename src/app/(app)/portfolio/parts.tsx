/** Server-safe presentational pieces for the portfolio pages. */
import { CardLink, Badge } from "@/components/ui";
import { money, num, pct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CLASS_LABEL, SHADES } from "@/lib/portfolio/constants";
import type { AllocationRow, Holding, RebalanceRow } from "@/lib/portfolio/service";

export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) return <div className={cn("h-8 w-20", className)} />;
  const w = 80;
  const h = 32;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const d = values.map((v, i) => `${i === 0 ? "M" : "L"}${((i / (values.length - 1)) * w).toFixed(1)},${(h - 2 - ((v - min) / span) * (h - 4)).toFixed(1)}`).join(" ");
  const up = values[values.length - 1] >= values[0];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={cn("shrink-0", className)} aria-hidden>
      <path d={d} fill="none" stroke={up ? "var(--fg)" : "var(--muted)"} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function PlText({ value, pctValue, currency = "CZK", className }: { value: number; pctValue?: number; currency?: string; className?: string }) {
  const tone = value > 0.005 ? "text-pos" : value < -0.005 ? "text-neg" : "text-muted";
  return (
    <span className={cn("num", tone, className)}>
      {money(value, currency, { sign: true })}
      {pctValue !== undefined && <> · {pct(pctValue, 1, true)}</>}
    </span>
  );
}

export function AllocationBars({ rows }: { rows: AllocationRow[] }) {
  return (
    <div className="space-y-3">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-line">
        {rows.map((r, i) => (
          <div key={r.class} style={{ width: `${r.pct}%`, background: SHADES[i % SHADES.length] }} className="h-full border-r border-bg last:border-0" title={r.label} />
        ))}
      </div>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={r.class} className="flex items-center gap-3 text-sm">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: SHADES[i % SHADES.length] }} />
            <span className="flex-1 truncate">{r.label}</span>
            <span className="num text-muted">{money(r.valueCzk)}</span>
            <span className="num w-14 text-right font-medium">{pct(r.pct)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RebalanceList({ rows }: { rows: RebalanceRow[] }) {
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.assetId} className="space-y-1.5">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="truncate">{r.name}</span>
            <span className="num shrink-0 text-muted">
              {pct(r.currentPct)} / cíl {pct(r.targetPct, 0)}
            </span>
          </div>
          <div className="relative h-1.5 w-full rounded-full bg-line">
            <div className="absolute inset-y-0 left-0 rounded-full bg-fg" style={{ width: `${Math.min(100, r.currentPct)}%` }} />
            <div className="absolute -top-1 h-3.5 w-0.5 rounded bg-muted" style={{ left: `${Math.min(100, r.targetPct)}%` }} />
          </div>
          {r.needsAction && (
            <div className="text-xs text-fg-soft">
              Odchylka {num(Math.abs(r.driftPp), 1)} p. b. → {r.actionCzk > 0 ? "dokoupit" : "prodat"} za ~{money(Math.abs(r.actionCzk))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function HoldingCard({ h }: { h: Holding }) {
  return (
    <CardLink href={`/portfolio/${h.id}`} className="flex items-center gap-3 p-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{h.name}</span>
          {h.symbol && <span className="shrink-0 text-xs text-subtle">{h.symbol}</span>}
        </div>
        <div className="num mt-0.5 truncate text-xs text-muted">
          {CLASS_LABEL[h.class]}
          {!h.manual && h.quantity > 0 && <> · {num(h.quantity, 6)} ks</>}
          {!h.manual && h.lastPrice != null && <> · {money(h.lastPrice, h.currency, { decimals: h.lastPrice < 10 ? 4 : 2 })}</>}
        </div>
      </div>
      {!h.manual && <Sparkline values={h.sparkline} className="hidden sm:block" />}
      <div className="shrink-0 text-right">
        <div className="num font-medium">{money(h.valueCzk)}</div>
        <div className="text-xs">
          {h.invested > 0 ? (
            <span className={cn("num", h.plPct > 0 ? "text-pos" : h.plPct < 0 ? "text-neg" : "text-muted")}>{pct(h.plPct, 1, true)}</span>
          ) : (
            <span className="text-subtle">{h.currency !== "CZK" ? money(h.value, h.currency) : "—"}</span>
          )}
        </div>
      </div>
    </CardLink>
  );
}

export function TimeTestBadge({ date, met }: { date: string; met: boolean }) {
  const label = new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" }).format(new Date(date + "T12:00:00"));
  return <Badge tone={met ? "solid" : "default"}>{met ? `Časový test splněn (od ${label})` : `Časový test splněn od ${label}`}</Badge>;
}

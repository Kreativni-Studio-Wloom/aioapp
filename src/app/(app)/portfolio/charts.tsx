"use client";

import { useId, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Segmented } from "@/components/ui/client";
import { addDays, dateLabel, isoDate, money } from "@/lib/format";

type Range = "1m" | "3m" | "1y" | "all";
const RANGES: { value: Range; label: string }[] = [
  { value: "1m", label: "1M" },
  { value: "3m", label: "3M" },
  { value: "1y", label: "1R" },
  { value: "all", label: "Vše" },
];
const RANGE_DAYS: Record<Range, number> = { "1m": 31, "3m": 92, "1y": 366, all: 100000 };

const compact = (v: number, currency: string) =>
  new Intl.NumberFormat("cs-CZ", { notation: "compact", maximumFractionDigits: 1, style: "currency", currency }).format(v);

function useRange<T extends { date: string }>(data: T[], initial: Range) {
  const [range, setRange] = useState<Range>(initial);
  const filtered = useMemo(() => {
    const from = addDays(isoDate(), -RANGE_DAYS[range]);
    return data.filter((d) => d.date >= from);
  }, [data, range]);
  return { range, setRange, filtered };
}

function TipBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-bg-elev px-3 py-2 text-xs shadow-sm">
      <div className="text-muted">{label}</div>
      <div className="num mt-0.5 font-semibold text-fg">{value}</div>
    </div>
  );
}

function SeriesChart({
  data,
  currency,
  reference,
  height = 200,
}: {
  data: { date: string; value: number }[];
  currency: string;
  reference?: { value: number; label: string } | null;
  height?: number;
}) {
  const gid = useId().replace(/:/g, "");
  return (
    <div style={{ height }} className="-mx-1">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--fg)" stopOpacity={0.18} />
              <stop offset="100%" stopColor="var(--fg)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(d: string) => dateLabel(d)}
            tick={{ fill: "var(--muted)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            minTickGap={32}
          />
          <YAxis
            domain={
              reference
                ? [(min: number) => Math.min(min, reference.value) * 0.98, (max: number) => Math.max(max, reference.value) * 1.02]
                : ["auto", "auto"]
            }
            tickFormatter={(v: number) => compact(v, currency)}
            tick={{ fill: "var(--muted)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={64}
          />
          <Tooltip
            cursor={{ stroke: "var(--line-strong)" }}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as { date: string; value: number } | undefined;
              if (!active || !p) return null;
              return <TipBox label={dateLabel(p.date, { day: "numeric", month: "short", year: "numeric" })} value={money(p.value, currency, { decimals: p.value < 10 ? 4 : undefined })} />;
            }}
          />
          {reference && (
            <ReferenceLine
              y={reference.value}
              stroke="var(--muted)"
              strokeDasharray="4 4"
              label={{ value: reference.label, position: "insideTopLeft", fill: "var(--muted)", fontSize: 11 }}
            />
          )}
          <Area type="monotone" dataKey="value" stroke="var(--fg)" strokeWidth={2} fill={`url(#${gid})`} isAnimationActive animationDuration={500} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function NetWorthChart({ data }: { data: { date: string; netCzk: number }[] }) {
  const { range, setRange, filtered } = useRange(data, "1y");
  const series = filtered.map((d) => ({ date: d.date, value: d.netCzk }));
  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Segmented value={range} onChange={setRange} options={RANGES} layoutId="nw-range" />
      </div>
      {series.length < 2 ? (
        <div className="grid h-[200px] place-items-center text-center text-sm text-muted">Historie se plní postupně – snímek čistého jmění se ukládá každý den.</div>
      ) : (
        <SeriesChart data={series} currency="CZK" />
      )}
    </div>
  );
}

export function PriceChart({
  data,
  currency,
  avgCost,
  label = "Cena",
}: {
  data: { date: string; price: number }[];
  currency: string;
  avgCost?: number | null;
  label?: string;
}) {
  const { range, setRange, filtered } = useRange(data, "1y");
  const series = filtered.map((d) => ({ date: d.date, value: d.price }));
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-xs text-muted">{label}</span>
        <Segmented value={range} onChange={setRange} options={RANGES} layoutId="price-range" />
      </div>
      {series.length < 2 ? (
        <div className="grid h-[200px] place-items-center text-sm text-muted">Zatím málo dat pro graf.</div>
      ) : (
        <SeriesChart data={series} currency={currency} reference={avgCost ? { value: avgCost, label: "Průměrná nákupka" } : null} />
      )}
    </div>
  );
}

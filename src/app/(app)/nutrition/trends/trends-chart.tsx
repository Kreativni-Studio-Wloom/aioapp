"use client";

import { Bar, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { dateLabel, num } from "@/lib/format";
import type { DayTotals } from "@/lib/nutrition/service";

export function TrendsChart({ data, target }: { data: DayTotals[]; target: number }) {
  const hasWeight = data.some((d) => d.weightKg != null);
  const weights = data.map((d) => d.weightKg).filter((w): w is number => w != null);
  const wMin = weights.length ? Math.floor(Math.min(...weights) - 1) : 0;
  const wMax = weights.length ? Math.ceil(Math.max(...weights) + 1) : 1;
  const rows = data.map((d) => ({ ...d, label: dateLabel(d.date, data.length > 10 ? { day: "numeric", month: "numeric" } : { weekday: "short" }) }));
  const maxKcal = Math.max(target * 1.2, ...data.map((d) => d.kcal));
  const step = maxKcal > 3000 ? 1000 : 500;
  const top = Math.ceil(maxKcal / step) * step;
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);

  return (
    <div className="w-full">
      <div className="h-64 w-full md:h-80">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 10, right: hasWeight ? 0 : 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} interval="preserveStartEnd" minTickGap={8} />
          <YAxis yAxisId="kcal" tickLine={false} axisLine={false} width={40} tick={{ fill: "var(--muted)", fontSize: 11 }} domain={[0, top]} ticks={ticks} />
          {hasWeight && (
            <YAxis yAxisId="w" orientation="right" tickLine={false} axisLine={false} width={34} tick={{ fill: "var(--muted)", fontSize: 11 }} domain={[wMin, wMax]} />
          )}
          <Tooltip
            cursor={{ fill: "var(--card-hover)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as DayTotals;
              return (
                <div className="num rounded-xl border border-line bg-bg-elev px-3 py-2 text-xs shadow-lg">
                  <div className="mb-1 font-medium">{dateLabel(d.date, { weekday: "short", day: "numeric", month: "short" })}</div>
                  <div>
                    {num(d.kcal)} / {num(target)} kcal
                  </div>
                  <div className="text-muted">
                    B {num(d.protein)} · S {num(d.carbs)} · T {num(d.fat)} g
                  </div>
                  {d.weightKg != null && <div className="text-muted">Váha {num(d.weightKg, 1)} kg</div>}
                </div>
              );
            }}
          />
          <ReferenceLine yAxisId="kcal" y={target} stroke="var(--muted)" strokeDasharray="4 4" />
          <Bar yAxisId="kcal" dataKey="kcal" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive>
            {rows.map((d) => (
              <Cell key={d.date} fill="var(--fg)" fillOpacity={d.kcal > target * 1.1 ? 1 : d.kcal >= target * 0.9 ? 0.75 : 0.4} />
            ))}
          </Bar>
          {hasWeight && (
            <Line
              yAxisId="w"
              type="monotone"
              dataKey="weightKg"
              stroke="var(--fg-soft)"
              strokeWidth={2}
              dot={{ r: 2.5, fill: "var(--fg-soft)", strokeWidth: 0 }}
              connectNulls
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
      </div>
      <div className="mt-1 flex flex-wrap justify-center gap-4 text-[11px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-fg" /> kcal
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 border-t border-dashed border-muted" /> cíl
        </span>
        {hasWeight && (
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded bg-fg-soft" /> váha (kg)
          </span>
        )}
      </div>
    </div>
  );
}

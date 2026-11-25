"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { money, num } from "@/lib/format";
import type { MonthPoint } from "@/lib/income/service";

function compact(v: number) {
  const a = Math.abs(v);
  if (a >= 1e6) return `${num(v / 1e6, 1)} M`;
  if (a >= 1e3) return `${num(v / 1e3, 0)} tis.`;
  return num(v);
}

type TipProps = { active?: boolean; payload?: { payload: MonthPoint }[] };

function Tip({ active, payload }: TipProps) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  return (
    <div className="num rounded-xl border border-line bg-bg-elev px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-medium">{p.month.split("-").reverse().join("/")}</div>
      <div className="flex justify-between gap-4">
        <span className="text-muted">Příjmy</span>
        <span>{money(p.income)}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-muted">Výdaje</span>
        <span>{money(p.expense)}</span>
      </div>
      <div className="mt-1 flex justify-between gap-4 border-t border-line pt-1 font-medium">
        <span>Čistý</span>
        <span className={p.net < 0 ? "text-neg" : undefined}>{money(p.net)}</span>
      </div>
    </div>
  );
}

/** Income (solid) vs expenses (outlined) per month. `highlight` = YYYY-MM to emphasise. */
export function MonthlyChart({ data, highlight, height = 220 }: { data: MonthPoint[]; highlight?: string | null; height?: number }) {
  const dim = (m: string) => (highlight && m !== highlight ? 0.35 : 1);
  return (
    <div style={{ height }} className="-ml-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barGap={2} barCategoryGap="22%" margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} interval="preserveStartEnd" minTickGap={4} />
          <YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} tickFormatter={compact} width={52} />
          <Tooltip content={<Tip />} cursor={{ fill: "var(--card-hover)" }} />
          <Bar dataKey="income" name="Příjmy" fill="var(--fg)" radius={[4, 4, 0, 0]} isAnimationActive animationDuration={500}>
            {data.map((d) => (
              <Cell key={d.month} fillOpacity={dim(d.month)} />
            ))}
          </Bar>
          <Bar dataKey="expense" name="Výdaje" fill="transparent" stroke="var(--muted)" strokeWidth={1.25} radius={[4, 4, 0, 0]} isAnimationActive animationDuration={500}>
            {data.map((d) => (
              <Cell key={d.month} strokeOpacity={dim(d.month)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ChartLegend() {
  return (
    <div className="flex items-center gap-4 text-xs text-muted">
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-sm bg-fg" /> Příjmy
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-sm border border-muted" /> Výdaje
      </span>
    </div>
  );
}

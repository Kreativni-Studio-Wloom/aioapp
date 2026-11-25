"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { dateLabel } from "@/lib/format";

type Point = { date: string } & Record<string, number | string | null>;

const axis = { stroke: "var(--muted)", fontSize: 11, tickLine: false, axisLine: false } as const;

function TooltipBox({ active, payload, label, unit }: { active?: boolean; payload?: { name?: string; value?: number | string; dataKey?: string | number }[]; label?: string; unit: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line bg-bg-elev px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 text-muted">{label ? dateLabel(label, { day: "numeric", month: "short", year: "numeric" }) : ""}</div>
      {payload.map((p) =>
        p.value == null ? null : (
          <div key={String(p.dataKey)} className="num flex justify-between gap-4">
            <span className="text-fg-soft">{p.name}</span>
            <span className="font-medium">
              {Number(p.value).toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} {unit}
            </span>
          </div>
        ),
      )}
    </div>
  );
}

export function TrendChart({
  data,
  lines,
  unit = "kg",
  height = 200,
}: {
  data: Point[];
  lines: { key: string; label: string; muted?: boolean; dots?: boolean }[];
  unit?: string;
  height?: number;
}) {
  if (data.length < 2) return <div className="grid place-items-center text-sm text-muted" style={{ height }}>Málo dat pro graf.</div>;
  return (
    <div style={{ height }} className="-ml-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis dataKey="date" {...axis} tickFormatter={(d: string) => dateLabel(d)} minTickGap={24} />
          <YAxis {...axis} width={40} domain={["auto", "auto"]} tickFormatter={(v: number) => v.toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} />
          <Tooltip content={(p) => <TooltipBox {...(p as object)} unit={unit} />} cursor={{ stroke: "var(--line-strong)" }} />
          {lines.map((l) => (
            <Line
              key={l.key}
              type="monotone"
              dataKey={l.key}
              name={l.label}
              stroke={l.muted ? "var(--muted)" : "var(--fg)"}
              strokeWidth={l.muted ? 1.5 : 2}
              strokeDasharray={l.muted ? "4 4" : undefined}
              dot={l.dots ? { r: 2.5, fill: "var(--fg)", strokeWidth: 0 } : false}
              activeDot={{ r: 4, fill: "var(--fg)", strokeWidth: 0 }}
              connectNulls
              isAnimationActive
              animationDuration={500}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function VolumeBars({ data, height = 160, unit = "kg" }: { data: { date: string; value: number }[]; height?: number; unit?: string }) {
  if (!data.length) return <div className="grid place-items-center text-sm text-muted" style={{ height }}>Málo dat pro graf.</div>;
  return (
    <div style={{ height }} className="-ml-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis dataKey="date" {...axis} tickFormatter={(d: string) => dateLabel(d)} minTickGap={24} />
          <YAxis {...axis} width={40} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 100) / 10}t` : String(v))} />
          <Tooltip content={(p) => <TooltipBox {...(p as object)} unit={unit} />} cursor={{ fill: "var(--card-hover)" }} />
          <Bar dataKey="value" name="Objem" fill="var(--fg)" radius={[4, 4, 0, 0]} maxBarSize={28} animationDuration={500} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

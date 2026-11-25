"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Card, Delta, Field, Input, SectionTitle, Stat } from "@/components/ui";
import { Segmented, SubmitButton } from "@/components/ui/client";
import { addDays, dateLabel, num } from "@/lib/format";
import type { BodyMetricDTO } from "@/lib/workout/service";
import { clearBodyMetricAction, logBodyMetricAction } from "../actions";
import { TrendChart } from "../_components/charts";

type Range = "30" | "90" | "365";

/** 7-day trailing average by calendar date. */
function withMovingAverage(rows: BodyMetricDTO[]) {
  const weights = rows.filter((r) => r.weightKg != null);
  return rows.map((r) => {
    const from = addDays(r.date, -6);
    const win = weights.filter((w) => w.date >= from && w.date <= r.date).map((w) => w.weightKg!);
    return { ...r, avg: win.length ? Math.round((win.reduce((a, b) => a + b, 0) / win.length) * 10) / 10 : null };
  });
}

export function BodyView({ metrics, today }: { metrics: BodyMetricDTO[]; today: string }) {
  const [range, setRange] = useState<Range>("90");
  const [state, formAction] = useActionState(logBodyMetricAction, undefined);
  const [, start] = useTransition();

  const all = useMemo(() => withMovingAverage(metrics), [metrics]);
  const from = addDays(today, -Number(range));
  const visible = all.filter((r) => r.date >= from);
  const weightRows = visible.filter((r) => r.weightKg != null);
  const latest = [...all].reverse().find((r) => r.weightKg != null);
  const first = weightRows[0];
  const latestAvg = [...all].reverse().find((r) => r.avg != null)?.avg ?? null;
  const weekAgoAvg = all.filter((r) => r.date <= addDays(today, -7) && r.avg != null).pop()?.avg ?? null;
  const todays = metrics.find((m) => m.date === today);
  const fat = [...all].reverse().find((r) => r.bodyFatPct != null);
  const waist = [...all].reverse().find((r) => r.waistCm != null);

  return (
    <>
      <Card>
        <form action={formAction} className="space-y-3" key={metrics.length}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Field label="Datum">
              <Input type="date" name="date" defaultValue={today} max={today} />
            </Field>
            <Field label="Váha (kg)">
              <Input name="weightKg" inputMode="decimal" placeholder={latest ? num(latest.weightKg, 1) : "80,0"} defaultValue={todays?.weightKg ? String(todays.weightKg).replace(".", ",") : ""} />
            </Field>
            <Field label="Tuk (%)">
              <Input name="bodyFatPct" inputMode="decimal" placeholder="volitelné" />
            </Field>
            <Field label="Pas (cm)">
              <Input name="waistCm" inputMode="decimal" placeholder="volitelné" />
            </Field>
          </div>
          {state && !state.ok && <p className="text-sm text-neg">{state.error}</p>}
          <SubmitButton className="w-full md:w-auto">Uložit</SubmitButton>
        </form>
      </Card>

      <SectionTitle
        action={
          <Segmented
            layoutId="body-range"
            value={range}
            onChange={setRange}
            options={[
              { value: "30", label: <span className="whitespace-nowrap">30 dní</span> },
              { value: "90", label: <span className="whitespace-nowrap">90 dní</span> },
              { value: "365", label: "Rok" },
            ]}
          />
        }
      >
        Váha
      </SectionTitle>
      <Card>
        <div className="mb-4 grid grid-cols-3 gap-4">
          <Stat label="Aktuální" value={latest ? `${num(latest.weightKg, 1)} kg` : "–"} sub={latest ? dateLabel(latest.date) : undefined} />
          <Stat
            label="Průměr 7 dní"
            value={latestAvg != null ? `${num(latestAvg, 1)} kg` : "–"}
            sub={latestAvg != null && weekAgoAvg != null ? <Delta value={Math.round((latestAvg - weekAgoAvg) * 10) / 10} suffix=" kg / týden" /> : undefined}
          />
          <Stat
            label="Za období"
            value={latest && first && first.weightKg != null ? <Delta value={Math.round((latest.weightKg! - first.weightKg) * 10) / 10} suffix=" kg" /> : "–"}
          />
        </div>
        <TrendChart
          data={weightRows.map((r) => ({ date: r.date, weight: r.weightKg, avg: r.avg }))}
          lines={[
            { key: "weight", label: "Váha", muted: true, dots: true },
            { key: "avg", label: "Průměr 7 dní" },
          ]}
          height={220}
        />
      </Card>

      {(fat || waist) && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Card>
            <Stat label="Tělesný tuk" value={fat ? `${num(fat.bodyFatPct, 1)} %` : "–"} sub={fat ? dateLabel(fat.date) : undefined} />
          </Card>
          <Card>
            <Stat label="Obvod pasu" value={waist ? `${num(waist.waistCm, 1)} cm` : "–"} sub={waist ? dateLabel(waist.date) : undefined} />
          </Card>
        </div>
      )}

      {visible.length > 0 && (
        <>
          <SectionTitle>Záznamy</SectionTitle>
          <div className="overflow-hidden rounded-2xl bg-card">
            {[...visible].reverse().map((r) => (
              <div key={r.date} className="num flex items-center gap-3 border-b border-line px-4 py-2.5 text-sm last:border-0">
                <span className="w-24 shrink-0 text-muted">{dateLabel(r.date, { weekday: "short", day: "numeric", month: "short" })}</span>
                <span className="flex-1 font-medium">{r.weightKg != null ? `${num(r.weightKg, 1)} kg` : "–"}</span>
                {r.bodyFatPct != null && <span className="text-muted">{num(r.bodyFatPct, 1)} %</span>}
                {r.waistCm != null && <span className="text-muted">{num(r.waistCm, 1)} cm</span>}
                <button className="rounded-lg p-2 text-subtle hover:text-neg" aria-label="Smazat záznam" onClick={() => start(async () => void (await clearBodyMetricAction(r.date)))}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

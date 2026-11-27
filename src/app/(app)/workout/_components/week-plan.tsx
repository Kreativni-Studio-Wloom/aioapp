"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ArrowLeftRight, Check, CornerDownRight, RotateCcw, SkipForward } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { Sheet, Spinner } from "@/components/ui/client";
import { cn } from "@/lib/utils";
import { WEEKDAYS_CS, WEEKDAYS_LONG_CS } from "@/lib/workout/constants";
import type { WeekPlan, WeekPlanDay } from "@/lib/workout/service";
import { moveDayThisWeekAction, resetWeekPlanAction } from "../actions";

const dm = (iso: string) => `${Number(iso.slice(8, 10))}. ${Number(iso.slice(5, 7))}.`;

type Target = { kind: "day"; day: WeekPlanDay } | { kind: "slot"; weekday: number };

/** This week's schedule of the active program. Tap a training to move/skip it for this week only, tap a free day to pull a training onto it. */
export function WeekPlanCard({ plan }: { plan: WeekPlan }) {
  const [target, setTarget] = useState<Target | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const close = () => {
    setTarget(null);
    setError(null);
  };
  const act = (p: Promise<{ ok: boolean; error?: string }>, closeAfter = true) =>
    start(async () => {
      const r = await p;
      if (!r.ok) setError(r.error ?? "Nepovedlo se");
      else if (closeAfter) close();
    });
  const move = (dayId: string, weekday: number | null) => act(moveDayThisWeekAction(dayId, weekday));

  const slotOf = (weekday: number) => plan.slots[weekday - 1];
  const notDone = [...plan.slots.flatMap((s) => s.days), ...plan.unscheduled].filter((d) => !d.done);

  return (
    <Card className="p-0">
      <div className="flex items-center justify-between gap-3 px-4 pb-1 pt-3">
        <div className="text-xs text-muted">
          Plán týdne · <span className="num">{dm(plan.weekStart)} – {dm(plan.weekEnd)}</span>
        </div>
        {plan.hasChanges && (
          <button
            onClick={() => act(resetWeekPlanAction(), false)}
            disabled={pending}
            className="-mr-2 flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs text-muted hover:bg-card-hover hover:text-fg disabled:opacity-40"
          >
            {pending && !target ? <Spinner className="h-3.5 w-3.5" /> : <RotateCcw className="h-3.5 w-3.5" />} Původní rozvrh
          </button>
        )}
      </div>

      <ul className="px-1.5 pb-1.5">
        {plan.slots.map((s) => (
          <li
            key={s.weekday}
            className={cn("flex items-stretch gap-3 rounded-xl px-2.5", s.isToday && "bg-card-hover", s.isPast && !s.isToday && "opacity-60")}
          >
            <div className="flex w-11 shrink-0 flex-col justify-center py-2">
              <span className={cn("text-sm font-medium", s.isToday ? "text-fg" : "text-fg-soft")}>{WEEKDAYS_CS[s.weekday - 1]}</span>
              <span className="num text-[11px] text-muted">{dm(s.date)}</span>
            </div>
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 py-1.5">
              {s.days.length ? (
                s.days.map((d) => <DayChip key={d.dayId} day={d} onClick={() => setTarget({ kind: "day", day: d })} />)
              ) : (
                <button
                  onClick={() => !s.isPast && setTarget({ kind: "slot", weekday: s.weekday })}
                  disabled={s.isPast || !notDone.length}
                  className="flex min-h-10 items-center text-left text-sm text-subtle enabled:hover:text-fg-soft"
                >
                  Volno
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {plan.unscheduled.length > 0 && (
        <div className="border-t border-line px-4 py-2.5">
          <div className="mb-1.5 text-xs text-muted">{plan.unscheduled.some((d) => d.skipped) ? "Mimo rozvrh / vynecháno" : "Bez pevného dne"}</div>
          <div className="flex flex-wrap gap-1.5">
            {plan.unscheduled.map((d) => (
              <button
                key={d.dayId}
                onClick={() => setTarget({ kind: "day", day: d })}
                className={cn(
                  "flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-2.5 text-sm hover:bg-card-hover",
                  d.skipped && "text-muted line-through decoration-subtle",
                  d.done && "border-transparent bg-card-hover",
                )}
              >
                {d.done && <Check className="h-3.5 w-3.5" />}
                {d.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <Sheet
        open={!!target}
        onClose={close}
        title={target?.kind === "day" ? target.day.name : target ? `${WEEKDAYS_LONG_CS[target.weekday - 1]} ${dm(slotOf(target.weekday).date)}` : ""}
      >
        {target?.kind === "day" && (
          <DaySheet day={target.day} plan={plan} pending={pending} onMove={(w) => move(target.day.dayId, w)} />
        )}
        {target?.kind === "slot" && (
          <div>
            <p className="mb-2 text-sm text-muted">Který trénink sem tento týden přesunout?</p>
            {notDone.map((d) => (
              <button
                key={d.dayId}
                disabled={pending}
                onClick={() => move(d.dayId, target.weekday)}
                className="flex min-h-12 w-full items-center justify-between gap-3 border-b border-line py-2.5 text-left last:border-0 hover:bg-card disabled:opacity-40"
              >
                <span className="min-w-0 truncate font-medium">{d.name}</span>
                <span className="shrink-0 text-xs text-muted">{d.weekday ? `z ${WEEKDAYS_CS[d.weekday - 1]}` : d.skipped ? "vynecháno" : "bez dne"}</span>
              </button>
            ))}
          </div>
        )}
        {error && <p className="mt-3 text-sm text-neg">{error}</p>}
        <p className="mt-4 text-xs text-subtle">Změny platí jen pro tento týden. Od pondělí se rozvrh vrátí podle programu.</p>
      </Sheet>
    </Card>
  );
}

function DayChip({ day, onClick }: { day: WeekPlanDay; onClick: () => void }) {
  return (
    <button onClick={onClick} className="group flex min-h-10 w-full items-center gap-2 text-left">
      <span
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
          day.done ? "border-fg bg-fg text-inverse" : "border-line-strong",
        )}
      >
        {day.done && <Check className="h-3 w-3" strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-sm font-medium group-hover:underline", day.done && "text-fg-soft")}>{day.name}</span>
        {day.moved && (
          <span className="flex items-center gap-1 text-[11px] text-muted">
            <CornerDownRight className="h-3 w-3" />
            {day.baseWeekday ? `přesunuto z ${WEEKDAYS_CS[day.baseWeekday - 1]}` : "jen tento týden"}
          </span>
        )}
      </span>
      <span className="num shrink-0 text-xs text-muted">{day.exerciseCount} cv.</span>
    </button>
  );
}

function DaySheet({ day, plan, pending, onMove }: { day: WeekPlanDay; plan: WeekPlan; pending: boolean; onMove: (weekday: number | null) => void }) {
  if (day.done)
    return (
      <div className="space-y-3">
        <p className="text-sm text-fg-soft">
          Hotovo · <span className="num">{dm(day.done.date)}</span>
        </p>
        <Link href={`/workout/history/${day.done.workoutId}`} className="text-sm text-muted hover:text-fg">
          Zobrazit trénink →
        </Link>
      </div>
    );

  return (
    <div>
      <p className="mb-3 text-sm text-muted">
        {day.weekday ? `Tento týden: ${WEEKDAYS_LONG_CS[day.weekday - 1].toLowerCase()}` : day.skipped ? "Tento týden vynecháno" : "Bez pevného dne"}
        {day.moved && day.baseWeekday ? ` · normálně ${WEEKDAYS_LONG_CS[day.baseWeekday - 1].toLowerCase()}` : ""}
      </p>
      <div className="mb-1 text-xs font-medium text-muted">Přesunout na</div>
      <div className="grid grid-cols-7 gap-1.5">
        {plan.slots.map((s) => {
          const current = day.weekday === s.weekday;
          const others = s.days.filter((d) => d.dayId !== day.dayId);
          const swap = others.length > 0 && day.weekday != null;
          return (
            <button
              key={s.weekday}
              disabled={pending || current || (s.isPast && !s.isToday)}
              onClick={() => onMove(s.weekday)}
              title={swap ? `Prohodí se s: ${others.map((o) => o.name).join(", ")}` : undefined}
              className={cn(
                "relative flex min-h-14 flex-col items-center justify-center rounded-xl border text-sm transition-colors disabled:opacity-35",
                current ? "border-fg bg-fg text-inverse disabled:opacity-100" : "border-line hover:bg-card-hover",
                s.isToday && !current && "border-line-strong",
              )}
            >
              <span className="font-medium">{WEEKDAYS_CS[s.weekday - 1]}</span>
              <span className="num text-[10px] opacity-70">{Number(s.date.slice(8, 10))}.</span>
              {others.length > 0 && !current && (
                <span className="absolute right-1 top-1">
                  {swap ? <ArrowLeftRight className="h-2.5 w-2.5 opacity-60" /> : <span className="block h-1.5 w-1.5 rounded-full bg-fg-soft" />}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-[11px] text-subtle">
        <ArrowLeftRight className="inline h-2.5 w-2.5" /> = den už má trénink, prohodí se
      </p>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        {day.moved && (
          <Button variant="secondary" className="flex-1" disabled={pending} onClick={() => onMove(day.baseWeekday)}>
            <RotateCcw className="h-4 w-4" /> Vrátit na {day.baseWeekday ? WEEKDAYS_CS[day.baseWeekday - 1] : "původní"}
          </Button>
        )}
        {day.weekday != null && (
          <Button variant="ghost" className="flex-1" disabled={pending} onClick={() => onMove(null)}>
            <SkipForward className="h-4 w-4" /> Tento týden vynechat
          </Button>
        )}
      </div>
      {pending && (
        <div className="mt-3 flex justify-center">
          <Spinner className="h-4 w-4" />
        </div>
      )}
    </div>
  );
}

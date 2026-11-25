"use client";

import { useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, ArrowUp, ChevronDown, Play, Plus, Repeat, Trash2 } from "lucide-react";
import { Badge, Button, Card, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { ConfirmButton, Segmented } from "@/components/ui/client";
import { cn, toNum } from "@/lib/utils";
import { WEEKDAYS_LONG_CS } from "@/lib/workout/constants";
import type { AlternativeDTO, ExerciseDTO, ProgramDTO, ProgramExerciseDTO } from "@/lib/workout/service";
import {
  addProgramDayAction,
  addProgramExerciseAction,
  deleteProgramAction,
  getAlternativesAction,
  removeProgramDayAction,
  removeProgramExerciseAction,
  reorderProgramExercisesAction,
  replaceProgramExerciseAction,
  setActiveProgramAction,
  startWorkoutAction,
  updateProgramAction,
  updateProgramDayAction,
  updateProgramExerciseAction,
} from "../../actions";
import { ExercisePicker } from "../../_components/exercise-picker";
import { SwapSheet } from "../../_components/swap-sheet";

type Day = ProgramDTO["days"][number];

export function ProgramEditor({ program: initial, exercises, hasActiveWorkout }: { program: ProgramDTO; exercises: ExerciseDTO[]; hasActiveWorkout: boolean }) {
  const [program, setProgram] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const [pickerDay, setPickerDay] = useState<string | null>(null);
  const [swap, setSwap] = useState<ProgramExerciseDTO | null>(null);
  const [alts, setAlts] = useState<AlternativeDTO[] | null>(null);

  const call = <T,>(p: Promise<{ ok: true; data?: T } | { ok: false; error: string }>, onOk?: (d: T | undefined) => void) =>
    start(async () => {
      const r = await p;
      if (!r.ok) setError(r.error);
      else {
        setError(null);
        onOk?.(r.data);
      }
    });

  const patchDay = (dayId: string, fn: (d: Day) => Day) => setProgram((p) => ({ ...p, days: p.days.map((d) => (d.id === dayId ? fn(d) : d)) }));
  const patchPe = (pe: ProgramExerciseDTO, patch: Partial<ProgramExerciseDTO>) =>
    patchDay(pe.dayId, (d) => ({ ...d, exercises: d.exercises.map((x) => (x.id === pe.id ? { ...x, ...patch } : x)) }));

  const move = (day: Day, idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= day.exercises.length) return;
    const list = [...day.exercises];
    [list[idx], list[j]] = [list[j], list[idx]];
    patchDay(day.id, (d) => ({ ...d, exercises: list }));
    call(reorderProgramExercisesAction(day.id, list.map((x) => x.id)));
  };

  return (
    <>
      <PageHeader
        title={program.name}
        back="/workout/programs"
        action={
          program.isActive ? (
            <Badge tone="solid">Aktivní</Badge>
          ) : (
            <Button size="sm" onClick={() => call(setActiveProgramAction(program.id), () => setProgram((p) => ({ ...p, isActive: true })))}>
              Nastavit jako aktivní
            </Button>
          )
        }
      />
      {error && <div className="mb-4 rounded-xl border border-line px-4 py-2.5 text-sm text-neg">{error}</div>}

      <Card className="space-y-3">
        <Field label="Název">
          <Input
            defaultValue={program.name}
            maxLength={80}
            onBlur={(e) => {
              const name = e.target.value.trim();
              if (name && name !== program.name) {
                setProgram((p) => ({ ...p, name }));
                call(updateProgramAction(program.id, { name }));
              }
            }}
          />
        </Field>
        <Field label="Popis">
          <Textarea
            defaultValue={program.description ?? ""}
            className="min-h-16"
            maxLength={500}
            onBlur={(e) => {
              const description = e.target.value.trim() || null;
              if (description !== program.description) {
                setProgram((p) => ({ ...p, description }));
                call(updateProgramAction(program.id, { description }));
              }
            }}
          />
        </Field>
      </Card>

      <div className="mt-6 space-y-4">
        <AnimatePresence initial={false}>
          {program.days.map((day) => (
            <motion.div key={day.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }}>
              <Card className="p-0 md:p-0">
                <div className="flex flex-wrap items-center gap-2 border-b border-line p-3 md:p-4">
                  <Input
                    defaultValue={day.name}
                    maxLength={60}
                    className="h-10 min-w-0 flex-1 bg-transparent text-base font-semibold"
                    onBlur={(e) => {
                      const name = e.target.value.trim();
                      if (name && name !== day.name) {
                        patchDay(day.id, (d) => ({ ...d, name }));
                        call(updateProgramDayAction(day.id, { name }));
                      }
                    }}
                  />
                  <div className="w-36">
                    <Select
                      value={day.weekday ?? ""}
                      className="h-10"
                      onChange={(e) => {
                        const weekday = e.target.value ? Number(e.target.value) : null;
                        patchDay(day.id, (d) => ({ ...d, weekday }));
                        call(updateProgramDayAction(day.id, { weekday }));
                      }}
                    >
                      <option value="">Libovolný den</option>
                      {WEEKDAYS_LONG_CS.map((w, i) => (
                        <option key={w} value={i + 1}>
                          {w}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>

                <div>
                  <AnimatePresence initial={false}>
                    {day.exercises.map((pe, idx) => (
                      <motion.div key={pe.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }} transition={{ type: "spring", damping: 32, stiffness: 380 }}>
                        <ExerciseRow
                          pe={pe}
                          first={idx === 0}
                          last={idx === day.exercises.length - 1}
                          onMove={(dir) => move(day, idx, dir)}
                          onPatch={(patch) => {
                            patchPe(pe, patch);
                            call(updateProgramExerciseAction(pe.id, patch));
                          }}
                          onRemove={() => {
                            patchDay(day.id, (d) => ({ ...d, exercises: d.exercises.filter((x) => x.id !== pe.id) }));
                            call(removeProgramExerciseAction(pe.id));
                          }}
                          onSwap={() => {
                            setSwap(pe);
                            setAlts(null);
                            getAlternativesAction(pe.exerciseId).then((r) => setAlts(r.ok ? (r.data ?? []) : []), () => setAlts([]));
                          }}
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  {!day.exercises.length && <div className="px-4 py-6 text-center text-sm text-muted">Zatím žádné cviky.</div>}
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-line p-3">
                  <Button variant="secondary" size="sm" onClick={() => setPickerDay(day.id)}>
                    <Plus className="h-4 w-4" /> Cvik
                  </Button>
                  {!hasActiveWorkout && day.exercises.length > 0 && (
                    <form action={startWorkoutAction}>
                      <input type="hidden" name="programDayId" value={day.id} />
                      <Button type="submit" size="sm">
                        <Play className="h-3.5 w-3.5" fill="currentColor" /> Začít
                      </Button>
                    </form>
                  )}
                  <div className="ml-auto">
                    <ConfirmButton
                      size="sm"
                      variant="ghost"
                      confirmText="Smazat den?"
                      onConfirm={() => {
                        setProgram((p) => ({ ...p, days: p.days.filter((d) => d.id !== day.id) }));
                        call(removeProgramDayAction(day.id));
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </ConfirmButton>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </AnimatePresence>

        <Button
          variant="outline"
          className="w-full"
          onClick={() => {
            const name = `Den ${program.days.length + 1}`;
            call(addProgramDayAction(program.id, { name }), (d) => {
              if (d) setProgram((p) => ({ ...p, days: [...p.days, { id: d.id, programId: p.id, name, order: p.days.length, weekday: null, exercises: [] }] }));
            });
          }}
        >
          <Plus className="h-4 w-4" /> Přidat den
        </Button>
      </div>

      <div className="mt-10 flex justify-center">
        <ConfirmButton size="sm" confirmText="Opravdu smazat program?" onConfirm={() => call(deleteProgramAction(program.id))}>
          Smazat program
        </ConfirmButton>
      </div>

      <ExercisePicker
        open={!!pickerDay}
        onClose={() => setPickerDay(null)}
        exercises={exercises}
        onPick={(ex) => {
          const dayId = pickerDay!;
          call(addProgramExerciseAction(dayId, { exerciseId: ex.id, sets: 3, repMin: 8, repMax: 12 }), (d) => {
            if (!d) return;
            patchDay(dayId, (day) => ({
              ...day,
              exercises: [
                ...day.exercises,
                {
                  id: d.id,
                  dayId,
                  exerciseId: ex.id,
                  exerciseName: ex.name,
                  primaryMuscle: ex.primaryMuscle,
                  equipment: ex.equipment,
                  order: day.exercises.length,
                  sets: 3,
                  repMin: 8,
                  repMax: 12,
                  restSeconds: null,
                  targetRpe: null,
                  incrementKg: 2.5,
                  progression: "double",
                  notes: null,
                },
              ],
            }));
          });
        }}
      />

      <SwapSheet
        open={!!swap}
        currentName={swap?.exerciseName}
        alternatives={alts}
        exercises={exercises}
        onClose={() => setSwap(null)}
        onPick={(ex) => {
          const pe = swap!;
          patchPe(pe, { exerciseId: ex.id, exerciseName: ex.name, primaryMuscle: ex.primaryMuscle, equipment: ex.equipment });
          call(replaceProgramExerciseAction(pe.id, ex.id));
          setSwap(null);
        }}
      />
    </>
  );
}

function NumInput({ value, onCommit, className, step, allowEmpty, suffix }: { value: number | null; onCommit: (v: number | null) => void; className?: string; step?: string; allowEmpty?: boolean; suffix?: string }) {
  return (
    <div className="relative">
      <Input
        key={String(value)}
        defaultValue={value ?? ""}
        inputMode="decimal"
        step={step}
        className={cn("num h-10 px-2.5 text-center", suffix && "pr-7", className)}
        onFocus={(e) => e.target.select()}
        onBlur={(e) => {
          const v = toNum(e.target.value);
          if (v == null && !allowEmpty) {
            e.target.value = String(value ?? "");
            return;
          }
          if (v !== value) onCommit(v);
        }}
      />
      {suffix && <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted">{suffix}</span>}
    </div>
  );
}

function ExerciseRow({
  pe,
  first,
  last,
  onMove,
  onPatch,
  onRemove,
  onSwap,
}: {
  pe: ProgramExerciseDTO;
  first: boolean;
  last: boolean;
  onMove: (dir: -1 | 1) => void;
  onPatch: (patch: Partial<ProgramExerciseDTO>) => void;
  onRemove: () => void;
  onSwap: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-line last:border-0">
      <div className="flex items-center gap-2 px-3 py-2.5 md:px-4">
        <div className="flex flex-col">
          <button className="rounded p-0.5 text-subtle hover:text-fg disabled:opacity-20" disabled={first} onClick={() => onMove(-1)} aria-label="Posunout nahoru">
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button className="rounded p-0.5 text-subtle hover:text-fg disabled:opacity-20" disabled={last} onClick={() => onMove(1)} aria-label="Posunout dolů">
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
        </div>
        <button className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setOpen((o) => !o)}>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{pe.exerciseName}</span>
            <span className="num block truncate text-xs text-muted">
              {pe.sets} × {pe.repMin === pe.repMax ? pe.repMin : `${pe.repMin}–${pe.repMax}`}
              {pe.restSeconds ? ` · pauza ${pe.restSeconds} s` : ""}
              {pe.targetRpe ? ` · RPE ${pe.targetRpe}` : ""}
              {pe.progression === "double" ? ` · +${pe.incrementKg.toLocaleString("cs-CZ")} kg` : ""}
            </span>
          </span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-subtle transition-transform", open && "rotate-180")} />
        </button>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="space-y-3 px-3 pb-4 md:px-4">
              <div className="grid grid-cols-3 gap-2">
                <Field label="Série">
                  <NumInput value={pe.sets} onCommit={(v) => onPatch({ sets: Math.max(1, Math.round(v ?? 1)) })} />
                </Field>
                <Field label="Opak. od">
                  <NumInput value={pe.repMin} onCommit={(v) => onPatch({ repMin: Math.max(1, Math.round(v ?? 1)), repMax: Math.max(pe.repMax, Math.round(v ?? 1)) })} />
                </Field>
                <Field label="Opak. do">
                  <NumInput value={pe.repMax} onCommit={(v) => onPatch({ repMax: Math.max(pe.repMin, Math.round(v ?? pe.repMin)) })} />
                </Field>
                <Field label="Pauza">
                  <NumInput value={pe.restSeconds} allowEmpty suffix="s" onCommit={(v) => onPatch({ restSeconds: v == null ? null : Math.round(v) })} />
                </Field>
                <Field label="Cíl RPE">
                  <NumInput value={pe.targetRpe} allowEmpty onCommit={(v) => onPatch({ targetRpe: v == null ? null : Math.min(10, Math.max(1, v)) })} />
                </Field>
                <Field label="Přírůstek">
                  <NumInput value={pe.incrementKg} suffix="kg" onCommit={(v) => onPatch({ incrementKg: Math.max(0, v ?? 0) })} />
                </Field>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-medium uppercase tracking-wider text-muted">Progrese</span>
                <Segmented
                  layoutId={`prog-${pe.id}`}
                  value={pe.progression}
                  onChange={(v) => onPatch({ progression: v })}
                  options={[
                    { value: "double", label: "Dvojitá" },
                    { value: "none", label: "Žádná" },
                  ]}
                />
              </div>
              <Field label="Poznámka">
                <Input
                  defaultValue={pe.notes ?? ""}
                  maxLength={300}
                  placeholder="např. pauza dole, úzký úchop"
                  onBlur={(e) => {
                    const notes = e.target.value.trim() || null;
                    if (notes !== pe.notes) onPatch({ notes });
                  }}
                />
              </Field>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={onSwap}>
                  <Repeat className="h-4 w-4" /> Vyměnit cvik
                </Button>
                <ConfirmButton size="sm" onConfirm={onRemove} confirmText="Odebrat?">
                  <Trash2 className="h-4 w-4" /> Odebrat
                </ConfirmButton>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

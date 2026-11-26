"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronLeft, CloudOff, Disc3, MoreHorizontal, Pencil, Plus, Repeat, Trash2, TrendingUp, X } from "lucide-react";
import { Button, Field, Input, Textarea } from "@/components/ui";
import { ConfirmButton, Sheet, Spinner } from "@/components/ui/client";
import { cn, toNum } from "@/lib/utils";
import { dateLabel, duration } from "@/lib/format";
import { fmtKg, fmtVolume, progressionHint, type ProgressionHint } from "@/lib/workout/calc";
import { equipmentLabel, muscleLabel } from "@/lib/workout/constants";
import type { AlternativeDTO, ExerciseDTO, LastPerformance, SessionData, SessionExerciseInfo, SessionTarget, WorkoutFinishSummary, WorkoutSetDTO } from "@/lib/workout/service";
import { discardWorkoutAction, finishWorkoutAction, getAlternativesAction, getExerciseLastAction, replaceProgramExerciseAction } from "../../actions";
import { ExercisePicker } from "../../_components/exercise-picker";
import { SwapSheet } from "../../_components/swap-sheet";
import { applyPending, clearQueueError, enqueue, flush, queueErrorSnapshot, queueSnapshot, startQueue, subscribeQueue } from "./queue";
import { primeAlerts, useRestTimer } from "./rest-timer";
import { PlateCalculator } from "./plates";
import { FinishSummary } from "./summary";

type Group = { key: string; order: number; exerciseId: string; sets: WorkoutSetDTO[] };

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (+c ^ (Math.random() * 16) >> (+c / 4)).toString(16));

function useQueueState() {
  return useSyncExternalStore(
    (cb) => subscribeQueue(() => cb()),
    () => {
      const s = queueSnapshot();
      return `${s.pending}|${s.offline ? 1 : 0}|${s.syncing ? 1 : 0}`;
    },
    () => "0|0|0",
  );
}

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function Session({ data, exercises: library }: { data: SessionData; exercises: ExerciseDTO[] }) {
  const router = useRouter();
  const workoutId = data.workout.id;
  const [initial] = useState(() => applyPending(workoutId, data.sets));
  const [sets, setSetsState] = useState<WorkoutSetDTO[]>(initial.sets);
  // Latest sets, updated synchronously with every change so async flows (prefill after a fetch)
  // can merge into the current state instead of a stale snapshot.
  const setsRef = useRef<WorkoutSetDTO[]>(initial.sets);
  const setSets = (fn: (prev: WorkoutSetDTO[]) => WorkoutSetDTO[]) => {
    const next = fn(setsRef.current);
    setsRef.current = next;
    setSetsState(next);
    return next;
  };
  const [name, setName] = useState(initial.name ?? data.workout.name);
  const [notes, setNotes] = useState<string | null>(initial.notes !== undefined ? initial.notes : data.workout.notes);
  const [exInfo, setExInfo] = useState<Record<string, SessionExerciseInfo>>(data.exercises);
  const [last, setLast] = useState<Record<string, LastPerformance | null>>(data.last);
  // program targets by exerciseId; a swapped-in exercise inherits the slot's target (see doSwap)
  const [targets, setTargets] = useState<Record<string, SessionTarget>>(data.targets);
  const queueError = useSyncExternalStore(subscribeQueue, queueErrorSnapshot, () => null);

  const [picker, setPicker] = useState(false);
  const [swap, setSwap] = useState<{ group: Group; alts: AlternativeDTO[] | null; inProgram: boolean } | null>(null);
  const [plates, setPlates] = useState<number | null>(null);
  const [menu, setMenu] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [finishPending, setFinishPending] = useState(false);
  const [summary, setSummary] = useState<WorkoutFinishSummary | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const timer = useRestTimer(workoutId);
  const queue = useQueueState();
  const [pending, offline, syncing] = queue.split("|").map(Number);
  const now = useNow(1000);
  const elapsed = Math.max(0, Math.floor((now - new Date(data.workout.startedAt).getTime()) / 1000));
  // a workout logged for an earlier day: show its date instead of a running clock
  const backdated = elapsed > 12 * 3600;

  useEffect(() => startQueue(), []);

  const groups = useMemo(() => {
    const map = new Map<string, Group>();
    for (const s of sets) {
      const key = `${s.exerciseOrder}:${s.exerciseId}`;
      let g = map.get(key);
      if (!g) map.set(key, (g = { key, order: s.exerciseOrder, exerciseId: s.exerciseId, sets: [] }));
      g.sets.push(s);
    }
    const list = [...map.values()];
    for (const g of list) g.sets.sort((a, b) => a.setNumber - b.setNumber);
    return list.sort((a, b) => a.order - b.order || a.sets[0].setNumber - b.sets[0].setNumber);
  }, [sets]);

  const done = sets.filter((s) => s.completed && !s.isWarmup);
  const volume = done.reduce((a, s) => a + s.weightKg * s.reps, 0);

  /* ── mutations (optimistic + queued) ── */

  const persist = useCallback(
    (s: WorkoutSetDTO) =>
      enqueue({
        key: `set:${s.id}`,
        kind: "set",
        workoutId,
        set: {
          id: s.id,
          exerciseId: s.exerciseId,
          exerciseOrder: s.exerciseOrder,
          setNumber: s.setNumber,
          weightKg: s.weightKg,
          reps: s.reps,
          rpe: s.rpe,
          isWarmup: s.isWarmup,
          completed: s.completed,
          notes: s.notes,
        },
      }),
    [workoutId],
  );

  const updateSet = (id: string, patch: Partial<WorkoutSetDTO>) => {
    const cur = setsRef.current.find((s) => s.id === id);
    if (!cur) return;
    setSets((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    persist({ ...cur, ...patch });
  };

  const fetchLast = async (exerciseId: string) => {
    if (exerciseId in last) return last[exerciseId];
    try {
      const r = await getExerciseLastAction(exerciseId, workoutId);
      const lp = r.ok ? (r.data ?? null) : null;
      setLast((l) => ({ ...l, [exerciseId]: lp }));
      return lp;
    } catch {
      return null;
    }
  };

  const completeSet = (s: WorkoutSetDTO, values: { weightKg: number; reps: number; rpe: number | null }) => {
    const completing = !s.completed;
    updateSet(s.id, { ...values, completed: completing });
    if (completing) {
      primeAlerts();
      if (!s.isWarmup) {
        const target = targets[s.exerciseId];
        const seconds = target?.restSeconds ?? data.defaultRestSeconds;
        timer.startRest(seconds, exInfo[s.exerciseId]?.name ?? "");
      }
    }
  };

  const addSet = (g: Group) => {
    const ref = g.sets[g.sets.length - 1];
    const s: WorkoutSetDTO = {
      id: uid(),
      exerciseId: g.exerciseId,
      exerciseOrder: g.order,
      setNumber: Math.max(...g.sets.map((x) => x.setNumber)) + 1,
      weightKg: ref?.weightKg ?? 0,
      reps: ref?.reps ?? 8,
      rpe: null,
      isWarmup: false,
      completed: false,
      notes: null,
    };
    setSets((p) => [...p, s]);
    persist(s);
  };

  const deleteSet = (id: string) => {
    setSets((p) => p.filter((s) => s.id !== id));
    enqueue({ key: `del:${id}`, kind: "del", workoutId, id });
  };

  const removeGroup = (g: Group) => {
    setSets((p) => p.filter((s) => !g.sets.some((x) => x.id === s.id)));
    for (const s of g.sets) enqueue({ key: `del:${s.id}`, kind: "del", workoutId, id: s.id });
  };

  const addExercise = async (ex: ExerciseDTO) => {
    setExInfo((m) => ({ ...m, [ex.id]: { id: ex.id, name: ex.name, primaryMuscle: ex.primaryMuscle, equipment: ex.equipment, pattern: ex.pattern } }));
    const cur = setsRef.current;
    const order = cur.length ? Math.max(...cur.map((s) => s.exerciseOrder)) + 1 : 0;
    const created: WorkoutSetDTO[] = [1, 2, 3].map((n) => ({
      id: uid(),
      exerciseId: ex.id,
      exerciseOrder: order,
      setNumber: n,
      weightKg: 0,
      reps: 8,
      rpe: null,
      isWarmup: false,
      completed: false,
      notes: null,
    }));
    setSets((p) => [...p, ...created]);
    created.forEach(persist);
    setTimeout(() => document.getElementById(`ex-${order}:${ex.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    const lp = await fetchLast(ex.id);
    const work = lp?.sets.filter((x) => !x.isWarmup) ?? [];
    if (!work.length) return;
    // prefill only sets the user hasn't touched (or deleted) while we were waiting
    const now = new Map(setsRef.current.map((s) => [s.id, s]));
    const prefilled: WorkoutSetDTO[] = [];
    created.forEach((orig, i) => {
      const c = now.get(orig.id);
      if (!c || c.completed || c.weightKg !== orig.weightKg || c.reps !== orig.reps || c.exerciseId !== orig.exerciseId) return;
      const ref = work[i] ?? work[work.length - 1];
      prefilled.push({ ...c, weightKg: ref.weightKg, reps: ref.reps });
    });
    if (!prefilled.length) return;
    const byId = new Map(prefilled.map((x) => [x.id, x]));
    setSets((p) => p.map((s) => byId.get(s.id) ?? s));
    prefilled.forEach(persist);
  };

  const openSwap = (g: Group) => {
    setSwap({ group: g, alts: null, inProgram: false });
    getAlternativesAction(g.exerciseId).then(
      (r) => setSwap((cur) => (cur && cur.group.key === g.key ? { ...cur, alts: r.ok ? (r.data ?? []) : [] } : cur)),
      () => setSwap((cur) => (cur ? { ...cur, alts: [] } : cur)),
    );
  };

  const doSwap = async (ex: ExerciseDTO) => {
    if (!swap) return;
    const { group: g, inProgram } = swap;
    setSwap(null);
    setExInfo((m) => ({ ...m, [ex.id]: { id: ex.id, name: ex.name, primaryMuscle: ex.primaryMuscle, equipment: ex.equipment, pattern: ex.pattern } }));
    const target = targets[g.exerciseId];
    if (target) setTargets((tg) => (tg[ex.id] ? tg : { ...tg, [ex.id]: target }));
    const ids = new Set(g.sets.filter((s) => !s.completed).map((s) => s.id));
    const swapped = setSets((p) => p.map((s) => (ids.has(s.id) && !s.completed ? { ...s, exerciseId: ex.id, weightKg: 0, reps: target?.repMin ?? s.reps } : s))).filter((s) =>
      ids.has(s.id),
    );
    swapped.forEach(persist);
    if (inProgram && target) {
      replaceProgramExerciseAction(target.programExerciseId, ex.id).then(
        (r) => {
          if (r.ok) setTargets((tg) => ({ ...tg, [ex.id]: { ...target, exerciseId: ex.id } }));
        },
        () => {},
      );
    }
    const lp = await fetchLast(ex.id);
    const work = lp?.sets.filter((x) => !x.isWarmup) ?? [];
    if (!work.length) return;
    const now = new Map(setsRef.current.map((s) => [s.id, s]));
    const updated: WorkoutSetDTO[] = [];
    swapped.forEach((orig, i) => {
      const c = now.get(orig.id);
      if (!c || c.completed || c.exerciseId !== ex.id || c.weightKg !== orig.weightKg || c.reps !== orig.reps) return;
      const ref = work[i] ?? work[work.length - 1];
      updated.push({ ...c, weightKg: ref.weightKg, reps: ref.reps });
    });
    if (!updated.length) return;
    const byId = new Map(updated.map((u) => [u.id, u]));
    setSets((p) => p.map((s) => byId.get(s.id) ?? s));
    updated.forEach(persist);
  };

  const applyHint = (g: Group, hint: ProgressionHint) => {
    if (hint.kind === "none") return;
    const changed = g.sets.filter((s) => !s.completed && !s.isWarmup).map((s) => ({ ...s, weightKg: hint.weightKg, reps: hint.reps }));
    setSets((p) => p.map((s) => changed.find((c) => c.id === s.id) ?? s));
    changed.forEach(persist);
  };

  const saveMeta = (patch: { name?: string; notes?: string | null }) => enqueue({ key: `workout:${workoutId}`, kind: "workout", workoutId, patch: { name, notes, ...patch } });

  const finish = async () => {
    setFinishPending(true);
    setFinishError(null);
    try {
      const flushed = await flush();
      if (!flushed) {
        setFinishError("Jsi offline. Změny jsou uložené v telefonu – dokončit půjde po připojení.");
        return;
      }
      const r = await finishWorkoutAction(workoutId, notes);
      if (!r.ok || !r.data) {
        setFinishError(r.ok ? "Nepodařilo se dokončit." : r.error);
        return;
      }
      timer.skip();
      setFinishing(false);
      setSummary(r.data);
    } catch {
      setFinishError("Bez připojení. Zkus to znovu za chvíli.");
    } finally {
      setFinishPending(false);
    }
  };

  if (summary) return <FinishSummary summary={summary} onDone={() => {
          router.push("/workout");
          router.refresh();
        }}
        onDetail={() => router.push(`/workout/history/${workoutId}`)} />;

  const restActive = !!timer.rest;

  return (
    <div className={cn("pb-40", restActive && "pb-56")}>
      {/* Header */}
      <div className="sticky top-12 z-20 -mx-4 mb-4 flex items-center gap-2 border-b border-line bg-bg/85 px-4 py-2.5 backdrop-blur-xl md:top-0 md:mx-0 md:rounded-b-2xl md:px-2">
        <Link href="/workout" className="-ml-1 rounded-full p-2 text-muted hover:text-fg" aria-label="Zpět">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold leading-tight">{name}</div>
          <div className="num flex items-center gap-2 text-xs text-muted">
            <span>{backdated ? dateLabel(data.workout.startedAt, { day: "numeric", month: "numeric", year: "numeric" }) : duration(elapsed)}</span>
            <span>·</span>
            <span>{done.length} sérií</span>
            <span>·</span>
            <span>{fmtVolume(volume)}</span>
            {pending > 0 && (
              <span className="flex items-center gap-1">
                ·{offline ? <CloudOff className="h-3 w-3" /> : syncing ? <Spinner className="h-3 w-3" /> : null}
                {offline ? `${pending} čeká` : "ukládám"}
              </span>
            )}
          </div>
        </div>
        <button onClick={() => setMenu(true)} className="rounded-full p-2 text-muted hover:text-fg" aria-label="Možnosti">
          <MoreHorizontal className="h-5 w-5" />
        </button>
        <Button size="sm" onClick={() => setFinishing(true)}>
          Dokončit
        </Button>
      </div>

      {queueError && (
        <div role="alert" className="mb-4 flex items-start gap-3 rounded-xl border border-line-strong bg-card px-4 py-3 text-sm">
          <div className="min-w-0 flex-1">
            <div className="font-medium text-neg">Změna se neuložila</div>
            <div className="text-fg-soft">{queueError.message.replace(/\.?$/, ".")} Zkontroluj {queueError.kind === "set" ? "sérii" : "údaje"} a zkus to znovu.</div>
          </div>
          <button onClick={clearQueueError} className="-m-1 rounded-full p-1 text-muted hover:text-fg" aria-label="Zavřít">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="space-y-4">
        <AnimatePresence initial={false}>
          {groups.map((g) => (
            <motion.div key={g.key} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ type: "spring", damping: 30, stiffness: 340 }}>
              <ExerciseCard
                group={g}
                info={exInfo[g.exerciseId]}
                target={targets[g.exerciseId]}
                last={last[g.exerciseId] ?? null}
                editing={editing === g.key}
                onToggleEdit={() => setEditing((e) => (e === g.key ? null : g.key))}
                onComplete={completeSet}
                onUpdate={updateSet}
                onAddSet={() => addSet(g)}
                onDeleteSet={deleteSet}
                onRemove={() => removeGroup(g)}
                onSwap={() => openSwap(g)}
                onPlates={(w) => setPlates(w)}
                onApplyHint={(h) => applyHint(g, h)}
              />
            </motion.div>
          ))}
        </AnimatePresence>
        {!groups.length && (
          <div className="rounded-2xl border border-dashed border-line-strong px-6 py-12 text-center">
            <div className="font-medium">Prázdný trénink</div>
            <div className="mt-1 text-sm text-muted">Přidej první cvik a začni zapisovat série.</div>
          </div>
        )}
        <Button variant="outline" size="lg" className="w-full" onClick={() => setPicker(true)}>
          <Plus className="h-5 w-5" /> Přidat cvik
        </Button>
      </div>

      {/* Sticky bottom: rest timer */}
      <AnimatePresence>
        {timer.rest && (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 380 }}
            className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/95 backdrop-blur-xl md:left-60"
          >
            <div className="relative h-1 w-full bg-line">
              <div
                className="absolute inset-y-0 left-0 bg-fg transition-[width] duration-300 ease-linear"
                style={{ width: `${Math.min(100, (timer.remaining / Math.max(1, timer.rest.total)) * 100)}%` }}
              />
            </div>
            <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
              <Button variant="secondary" className="h-14 w-16 text-base" onClick={() => timer.adjust(-15)}>
                −15
              </Button>
              <div className="flex-1 text-center">
                <div className="text-[11px] uppercase tracking-wider text-muted">{timer.remaining > 0 ? "Pauza" : "Jdeme na to!"}</div>
                <div className={cn("num text-5xl font-semibold leading-none tracking-tight", timer.remaining === 0 && "animate-pulse")}>
                  {Math.floor(timer.remaining / 60)}:{String(timer.remaining % 60).padStart(2, "0")}
                </div>
              </div>
              <Button variant="secondary" className="h-14 w-16 text-base" onClick={() => timer.adjust(15)}>
                +15
              </Button>
              <Button variant="ghost" className="h-14 px-3" onClick={timer.skip} aria-label="Přeskočit pauzu">
                <X className="h-5 w-5" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ExercisePicker open={picker} onClose={() => setPicker(false)} exercises={library} onPick={addExercise} />

      <SwapSheet
        open={!!swap}
        currentName={swap ? exInfo[swap.group.exerciseId]?.name : undefined}
        alternatives={swap?.alts ?? null}
        exercises={library}
        onClose={() => setSwap(null)}
        onPick={doSwap}
      >
        {swap && targets[swap.group.exerciseId] && (
          <label className="mb-3 flex items-center gap-2 rounded-xl bg-card px-3 py-2.5 text-sm">
            <input
              type="checkbox"
              checked={swap.inProgram}
              onChange={(e) => setSwap((s) => (s ? { ...s, inProgram: e.target.checked } : s))}
              className="h-4 w-4 accent-[var(--fg)]"
            />
            Vyměnit i v programu natrvalo
          </label>
        )}
      </SwapSheet>

      <PlateCalculator open={plates != null} initialKg={plates ?? 0} onClose={() => setPlates(null)} />

      <Sheet open={menu} onClose={() => setMenu(false)} title="Trénink">
        <div className="space-y-4">
          <Field label="Název">
            <Input
              defaultValue={name}
              maxLength={80}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== name) {
                  setName(v);
                  saveMeta({ name: v });
                }
              }}
            />
          </Field>
          <Field label="Poznámky">
            <Textarea
              defaultValue={notes ?? ""}
              placeholder="Jak ses cítil, co bolelo, co příště…"
              onBlur={(e) => {
                const v = e.target.value.trim() || null;
                if (v !== notes) {
                  setNotes(v);
                  saveMeta({ notes: v });
                }
              }}
            />
          </Field>
          <Button variant="secondary" className="w-full" onClick={() => { setMenu(false); setPlates(60); }}>
            <Disc3 className="h-4 w-4" /> Kalkulačka kotoučů
          </Button>
          <ConfirmButton className="w-full" confirmText="Opravdu zahodit celý trénink?" onConfirm={() => { timer.skip(); void discardWorkoutAction(workoutId); }}>
            <Trash2 className="h-4 w-4" /> Zahodit trénink
          </ConfirmButton>
        </div>
      </Sheet>

      <Sheet open={finishing} onClose={() => setFinishing(false)} title="Dokončit trénink?">
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            <MiniStat label="Čas" value={duration(elapsed)} />
            <MiniStat label="Série" value={String(done.length)} />
            <MiniStat label="Objem" value={fmtVolume(volume)} />
          </div>
          {sets.some((s) => !s.completed) && (
            <p className="text-sm text-muted">Nedokončené série ({sets.filter((s) => !s.completed).length}) se neuloží.</p>
          )}
          <Field label="Poznámka k tréninku">
            <Textarea
              defaultValue={notes ?? ""}
              className="min-h-16"
              onBlur={(e) => {
                const v = e.target.value.trim() || null;
                if (v !== notes) setNotes(v);
              }}
            />
          </Field>
          {finishError && <p className="text-sm text-neg">{finishError}</p>}
          <Button size="lg" className="w-full" onClick={finish} disabled={finishPending || done.length === 0}>
            {finishPending ? <Spinner /> : <Check className="h-5 w-5" />} Dokončit trénink
          </Button>
          {done.length === 0 && <p className="text-center text-xs text-muted">Nejdřív odškrtni aspoň jednu sérii.</p>}
        </div>
      </Sheet>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-card px-2 py-3">
      <div className="text-[11px] text-muted">{label}</div>
      <div className="num mt-0.5 font-semibold">{value}</div>
    </div>
  );
}

/* ── Exercise card ── */

function ExerciseCard({
  group,
  info,
  target,
  last,
  editing,
  onToggleEdit,
  onComplete,
  onUpdate,
  onAddSet,
  onDeleteSet,
  onRemove,
  onSwap,
  onPlates,
  onApplyHint,
}: {
  group: Group;
  info: SessionExerciseInfo | undefined;
  target: SessionTarget | undefined;
  last: LastPerformance | null;
  editing: boolean;
  onToggleEdit: () => void;
  onComplete: (s: WorkoutSetDTO, v: { weightKg: number; reps: number; rpe: number | null }) => void;
  onUpdate: (id: string, patch: Partial<WorkoutSetDTO>) => void;
  onAddSet: () => void;
  onDeleteSet: (id: string) => void;
  onRemove: () => void;
  onSwap: () => void;
  onPlates: (kg: number) => void;
  onApplyHint: (h: ProgressionHint) => void;
}) {
  const lastWork = last?.sets.filter((s) => !s.isWarmup) ?? [];
  const lastTop = lastWork.reduce<(typeof lastWork)[number] | null>((b, s) => (!b || s.weightKg > b.weightKg || (s.weightKg === b.weightKg && s.reps > b.reps) ? s : b), null);
  const hint = progressionHint(last?.sets, {
    repMin: target?.repMin ?? 8,
    repMax: target?.repMax ?? 12,
    incrementKg: target?.incrementKg ?? 2.5,
    progression: target?.progression ?? "double",
    sets: target?.sets,
  });
  const pendingWork = group.sets.filter((s) => !s.completed && !s.isWarmup);
  const hintApplied = hint.kind !== "none" && pendingWork.length > 0 && pendingWork.every((s) => s.weightKg === hint.weightKg && s.reps === hint.reps);
  const allDone = group.sets.length > 0 && group.sets.every((s) => s.completed);
  let workIdx = 0;

  return (
    <section id={`ex-${group.key}`} className={cn("scroll-mt-32 rounded-2xl bg-card transition-opacity", allDone && "opacity-80")}>
      <div className="flex items-start gap-2 px-4 pt-4">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[17px] font-semibold leading-tight">{info?.name ?? "Cvik"}</h3>
          <div className="mt-0.5 truncate text-xs text-muted">
            {info ? `${muscleLabel(info.primaryMuscle)} · ${equipmentLabel(info.equipment)}` : ""}
            {target ? ` · cíl ${target.sets}× ${target.repMin === target.repMax ? target.repMin : `${target.repMin}–${target.repMax}`}` : ""}
            {target?.targetRpe ? ` @${target.targetRpe}` : ""}
          </div>
        </div>
        <button onClick={onSwap} className="flex h-9 shrink-0 items-center gap-1 rounded-full bg-bg-elev px-3 text-xs font-medium text-fg-soft hover:text-fg" aria-label="Náhrada cviku">
          <Repeat className="h-3.5 w-3.5" /> Náhrada
        </button>
        <button onClick={onToggleEdit} className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted hover:text-fg", editing && "bg-fg text-inverse hover:text-inverse")} aria-label="Upravit série">
          <Pencil className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 text-xs">
        {lastTop ? (
          <span className="num text-muted">
            minule: {fmtKg(lastTop.weightKg)} kg × {lastTop.reps}
            {lastWork.length > 1 ? ` (${lastWork.map((s) => s.reps).join(", ")})` : ""}
          </span>
        ) : (
          <span className="text-muted">Poprvé – zvol pracovní váhu</span>
        )}
        {hint.kind === "increase" && (
          <button
            onClick={() => onApplyHint(hint)}
            disabled={hintApplied}
            className={cn("num inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium", hintApplied ? "border border-line text-muted" : "bg-fg text-inverse")}
          >
            <TrendingUp className="h-3.5 w-3.5" /> {hint.text}
            {!hintApplied && <span className="opacity-70">· použít</span>}
          </button>
        )}
        {hint.kind === "hold" && <span className="num text-fg-soft">{hint.text}</span>}
      </div>
      {target?.notes && <p className="mt-1.5 px-4 text-xs text-fg-soft">Pozn.: {target.notes}</p>}

      <div className="mt-3">
        <div className="grid grid-cols-[44px_1fr_1fr_52px_52px] items-center gap-2 px-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-subtle">
          <span className="text-center">Série</span>
          <span className="text-center">kg</span>
          <span className="text-center">Opak.</span>
          <span className="text-center">RPE</span>
          <span />
        </div>
        <AnimatePresence initial={false}>
          {group.sets.map((s) => {
            const label = s.isWarmup ? "W" : String(++workIdx);
            const ref = s.isWarmup ? undefined : lastWork[workIdx - 1];
            return (
              <motion.div key={s.id} layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }}>
                <SetRow
                  set={s}
                  label={label}
                  lastRef={ref}
                  editing={editing}
                  onComplete={(v) => onComplete(s, v)}
                  onCommit={(v) => onUpdate(s.id, v)}
                  onToggleWarmup={() => onUpdate(s.id, { isWarmup: !s.isWarmup })}
                  onDelete={() => onDeleteSet(s.id)}
                  onPlates={onPlates}
                />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      <div className="flex items-center gap-2 px-3 pb-3 pt-2">
        <Button variant="ghost" size="sm" className="h-10" onClick={onAddSet}>
          <Plus className="h-4 w-4" /> Série
        </Button>
        {editing && (
          <div className="ml-auto">
            <ConfirmButton size="sm" className="h-10" confirmText="Odebrat cvik?" onConfirm={onRemove}>
              <Trash2 className="h-4 w-4" /> Odebrat cvik
            </ConfirmButton>
          </div>
        )}
        {!editing && group.sets.length > 0 && (
          <button
            className="ml-auto flex h-10 items-center gap-1 rounded-xl px-3 text-xs text-muted hover:text-fg"
            onClick={() => onPlates(group.sets.find((s) => !s.completed)?.weightKg ?? group.sets[group.sets.length - 1].weightKg)}
          >
            <Disc3 className="h-4 w-4" /> Kotouče
          </button>
        )}
      </div>
      {editing && <p className="px-4 pb-3 text-[11px] text-muted">Klepnutím na číslo série přepneš rozcvičku (W).</p>}
    </section>
  );
}

function SetRow({
  set,
  label,
  lastRef,
  editing,
  onComplete,
  onCommit,
  onToggleWarmup,
  onDelete,
  onPlates,
}: {
  set: WorkoutSetDTO;
  label: string;
  lastRef?: { weightKg: number; reps: number };
  editing: boolean;
  onComplete: (v: { weightKg: number; reps: number; rpe: number | null }) => void;
  onCommit: (v: Partial<WorkoutSetDTO>) => void;
  onToggleWarmup: () => void;
  onDelete: () => void;
  onPlates: (kg: number) => void;
}) {
  const fmtW = (v: number) => (v ? String(v).replace(".", ",") : "");
  const fmtRpe = (v: number | null) => (v != null ? String(v).replace(".", ",") : "");
  const [w, setW] = useState(fmtW(set.weightKg));
  const [r, setR] = useState(set.reps ? String(set.reps) : "");
  const [rpe, setRpe] = useState(fmtRpe(set.rpe));
  // Sync local inputs when the set changes from outside (progression hint, swap) – without remounting.
  const [seen, setSeen] = useState({ w: set.weightKg, r: set.reps, rpe: set.rpe });
  if (seen.w !== set.weightKg || seen.r !== set.reps || seen.rpe !== set.rpe) {
    setSeen({ w: set.weightKg, r: set.reps, rpe: set.rpe });
    if ((toNum(w) ?? 0) !== set.weightKg) setW(fmtW(set.weightKg));
    if (Math.round(toNum(r) ?? 0) !== set.reps) setR(set.reps ? String(set.reps) : "");
    if ((toNum(rpe) ?? null) !== set.rpe) setRpe(fmtRpe(set.rpe));
  }
  const values = () => ({
    weightKg: Math.max(0, toNum(w) ?? 0),
    reps: Math.max(0, Math.round(toNum(r) ?? 0)),
    rpe: (() => {
      const v = toNum(rpe);
      return v == null ? null : Math.min(10, Math.max(1, v));
    })(),
  });
  const commit = () => {
    const v = values();
    if (v.weightKg !== set.weightKg || v.reps !== set.reps || v.rpe !== set.rpe) onCommit(v);
  };
  const inputCls = cn(
    "num h-12 w-full rounded-xl border border-transparent bg-bg-elev text-center text-lg font-medium outline-none transition-colors focus:border-line-strong placeholder:text-subtle",
    set.completed && "bg-transparent",
  );

  return (
    <div className={cn("grid grid-cols-[44px_1fr_1fr_52px_52px] items-center gap-2 px-3 py-1 transition-colors", set.completed && "bg-fg/[0.06]")}>
      <button
        onClick={onToggleWarmup}
        onDoubleClick={() => onPlates(values().weightKg)}
        className={cn("num grid h-12 place-items-center rounded-xl text-sm font-semibold", set.isWarmup ? "text-muted" : "text-fg-soft")}
        aria-label={set.isWarmup ? "Rozcvičková série" : `Série ${label}`}
      >
        {label}
      </button>
      <input
        value={w}
        onChange={(e) => setW(e.target.value)}
        onBlur={commit}
        onFocus={(e) => e.target.select()}
        inputMode="decimal"
        placeholder={lastRef ? fmtKg(lastRef.weightKg) : "0"}
        className={inputCls}
        aria-label="Váha v kg"
      />
      <input
        value={r}
        onChange={(e) => setR(e.target.value)}
        onBlur={commit}
        onFocus={(e) => e.target.select()}
        inputMode="numeric"
        placeholder={lastRef ? String(lastRef.reps) : "0"}
        className={inputCls}
        aria-label="Opakování"
      />
      <input
        value={rpe}
        onChange={(e) => setRpe(e.target.value)}
        onBlur={commit}
        onFocus={(e) => e.target.select()}
        inputMode="decimal"
        placeholder="–"
        className={cn(inputCls, "text-sm")}
        aria-label="RPE"
      />
      {editing ? (
        <button onClick={onDelete} className="grid h-12 w-full place-items-center rounded-xl text-neg hover:bg-card-hover" aria-label="Smazat sérii">
          <Trash2 className="h-5 w-5" />
        </button>
      ) : (
        <motion.button
          whileTap={{ scale: 0.88 }}
          onClick={() => onComplete(values())}
          className={cn(
            "grid h-12 w-full place-items-center rounded-xl transition-colors",
            set.completed ? "bg-fg text-inverse" : "border border-line-strong text-subtle hover:text-fg",
          )}
          aria-label={set.completed ? "Zrušit dokončení" : "Dokončit sérii"}
          aria-pressed={set.completed}
        >
          <Check className="h-6 w-6" strokeWidth={set.completed ? 3 : 2} />
        </motion.button>
      )}
    </div>
  );
}


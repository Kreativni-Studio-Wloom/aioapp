"use client";

// Offline-resilient mutation queue for the live session. Ops are persisted in localStorage,
// coalesced per key (latest wins) and flushed sequentially; a thrown error (network) stops the
// flush and it is retried on `online` / a timer. A server-side `{ ok: false }` drops the op.

import type { SetInput, WorkoutSetDTO } from "@/lib/workout/service";
import { deleteSetAction, saveSetAction, updateWorkoutAction } from "../../actions";

export type QueueOp =
  | { key: string; kind: "set"; workoutId: string; set: SetInput & { id: string } }
  | { key: string; kind: "del"; workoutId: string; id: string }
  | { key: string; kind: "workout"; workoutId: string; patch: { name?: string; notes?: string | null } };

const STORAGE_KEY = "aio.workout.queue.v1";

function read(): QueueOp[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as QueueOp[]) : [];
  } catch {
    return [];
  }
}
function write(ops: QueueOp[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ops));
  } catch {}
}

type Listener = (s: { pending: number; offline: boolean; syncing: boolean }) => void;
const listeners = new Set<Listener>();
let state = { pending: 0, offline: false, syncing: false };
function emit(patch: Partial<typeof state>) {
  state = { ...state, ...patch, pending: read().length };
  listeners.forEach((l) => l(state));
}
export function subscribeQueue(l: Listener) {
  listeners.add(l);
  l({ ...state, pending: read().length });
  return () => {
    listeners.delete(l);
  };
}
export const queueSnapshot = () => ({ ...state, pending: read().length });

export function pendingOps(workoutId: string) {
  return read().filter((o) => o.workoutId === workoutId);
}

export function enqueue(op: QueueOp) {
  const ops = read().filter((o) => o.key !== op.key);
  // deleting a set supersedes a pending upsert of it
  if (op.kind === "del") {
    const i = ops.findIndex((o) => o.kind === "set" && o.set.id === op.id);
    if (i >= 0) ops.splice(i, 1);
  }
  ops.push(op);
  write(ops);
  emit({});
  void flush();
}

let flushing: Promise<boolean> | null = null;

async function runOp(op: QueueOp) {
  const call = op.kind === "set" ? saveSetAction(op.workoutId, op.set) : op.kind === "del" ? deleteSetAction(op.id) : updateWorkoutAction(op.workoutId, op.patch);
  // a hung request on flaky gym wifi must not block the queue forever
  return Promise.race([call, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 15000))]);
}

/** Flush all queued ops. Resolves true when the queue is empty afterwards. */
export function flush(): Promise<boolean> {
  if (flushing) return flushing;
  const run = async () => {
    // yield first so `flushing` is assigned before the finally block below can reset it
    await Promise.resolve();
    emit({ syncing: true });
    try {
      for (;;) {
        const [op] = read();
        if (!op) break;
        try {
          const r = await runOp(op);
          if (!r.ok) console.warn("[workout queue] dropped op", op, r.error);
        } catch {
          emit({ offline: true });
          return false;
        }
        // remove exactly this op unless it was superseded meanwhile (same key, newer content)
        const cur = read();
        const idx = cur.findIndex((o) => o.key === op.key && JSON.stringify(o) === JSON.stringify(op));
        if (idx >= 0) cur.splice(idx, 1);
        write(cur);
        emit({ offline: false });
      }
      return true;
    } finally {
      flushing = null;
      emit({ syncing: false });
      // ops enqueued while we were finishing up
      if (read().length && !state.offline) setTimeout(() => void flush(), 0);
    }
  };
  flushing = run();
  return flushing;
}

let started = false;
/** Wire up `online` + periodic retry once per page. */
export function startQueue() {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("online", () => void flush());
  setInterval(() => {
    if (read().length && navigator.onLine !== false) void flush();
  }, 15000);
  void flush();
}

/** Apply pending ops on top of server data (after a reload while offline). */
export function applyPending(workoutId: string, sets: WorkoutSetDTO[]) {
  const map = new Map(sets.map((s) => [s.id, s]));
  let name: string | undefined;
  let notes: string | null | undefined;
  for (const op of pendingOps(workoutId)) {
    if (op.kind === "set")
      map.set(op.set.id, {
        id: op.set.id,
        exerciseId: op.set.exerciseId,
        exerciseOrder: op.set.exerciseOrder,
        setNumber: op.set.setNumber,
        weightKg: op.set.weightKg,
        reps: op.set.reps,
        rpe: op.set.rpe ?? null,
        isWarmup: op.set.isWarmup ?? false,
        completed: op.set.completed ?? true,
        notes: op.set.notes ?? null,
      });
    else if (op.kind === "del") map.delete(op.id);
    else {
      if (op.patch.name !== undefined) name = op.patch.name;
      if (op.patch.notes !== undefined) notes = op.patch.notes;
    }
  }
  return { sets: [...map.values()], name, notes };
}

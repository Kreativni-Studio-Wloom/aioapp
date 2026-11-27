"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { isoDate } from "@/lib/format";
import { str, toNum, type ActionResult } from "@/lib/utils";
import * as svc from "@/lib/workout/service";
import { EQUIPMENT } from "@/lib/workout/constants";

async function run<T>(fn: (userId: string) => Promise<T>, revalidate: string[] = []): Promise<ActionResult<T>> {
  const user = await requireUser();
  try {
    const data = await fn(user.id);
    for (const p of revalidate) revalidatePath(p);
    return { ok: true, data };
  } catch (err) {
    if (err instanceof svc.WorkoutError) return { ok: false, error: err.message };
    if (err instanceof z.ZodError) return { ok: false, error: err.issues[0]?.message ?? "Neplatná data" };
    console.error("[workout action]", err);
    return { ok: false, error: "Něco se pokazilo. Zkus to znovu." };
  }
}

const uuid = z.string().uuid();
const optNum = z.number().finite().nullable().optional();

/* ── Exercises ── */

const exerciseSchema = z.object({
  name: z.string().trim().min(2, "Zadej název cviku").max(80),
  primaryMuscle: z.string().min(1),
  secondaryMuscles: z.array(z.string()).max(6).optional(),
  pattern: z.string().min(1),
  equipment: z.enum(EQUIPMENT as [string, ...string[]]),
  isUnilateral: z.boolean().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export async function createExerciseAction(input: z.input<typeof exerciseSchema>) {
  return run(
    async (uid) => {
      const data = exerciseSchema.parse(input);
      return svc.createExercise(uid, { ...data, equipment: data.equipment as svc.ExerciseDTO["equipment"] });
    },
    ["/workout/exercises"],
  );
}

export async function deleteExerciseAction(exerciseId: string) {
  return run((uid) => svc.deleteExercise(uid, uuid.parse(exerciseId)), ["/workout/exercises"]);
}

export async function getAlternativesAction(exerciseId: string) {
  return run((uid) => svc.getAlternatives(uid, uuid.parse(exerciseId)));
}

/* ── Programs ── */

// Form actions (used with useActionState): service errors come back as { ok: false }; redirect stays outside run().
export async function createProgramAction(_: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  const name = str(form.get("name")) ?? "Můj program";
  const r = await run((uid) => svc.createProgram(uid, { name, description: str(form.get("description")), days: [{ name: "Den 1", exercises: [] }] }), ["/workout/programs"]);
  if (!r.ok) return r;
  redirect(`/workout/programs/${r.data!.id}`);
}

export async function cloneTemplateAction(_: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  const r = await run((uid) => svc.cloneProgramTemplate(uid, String(form.get("key") ?? "")));
  if (!r.ok) return r;
  revalidatePath("/workout", "layout");
  redirect(`/workout/programs/${r.data!.id}`);
}

export async function updateProgramAction(programId: string, patch: { name?: string; description?: string | null }) {
  return run(
    (uid) => svc.updateProgram(uid, uuid.parse(programId), z.object({ name: z.string().max(80).optional(), description: z.string().max(500).nullable().optional() }).parse(patch)),
    ["/workout/programs"],
  );
}

export async function deleteProgramAction(programId: string) {
  const r = await run((uid) => svc.deleteProgram(uid, uuid.parse(programId)), ["/workout"]);
  if (r.ok) redirect("/workout/programs");
  return r;
}

export async function setActiveProgramAction(programId: string | null) {
  return run((uid) => svc.setActiveProgram(uid, programId ? uuid.parse(programId) : null), ["/workout", "/workout/programs"]);
}

const weekday = z.number().int().min(1).max(7).nullable().optional();

export async function addProgramDayAction(programId: string, input: { name: string; weekday?: number | null }) {
  return run((uid) => svc.addProgramDay(uid, uuid.parse(programId), z.object({ name: z.string().max(60), weekday }).parse(input)));
}

export async function updateProgramDayAction(dayId: string, patch: { name?: string; weekday?: number | null }) {
  return run((uid) => svc.updateProgramDay(uid, uuid.parse(dayId), z.object({ name: z.string().max(60).optional(), weekday }).parse(patch)));
}

export async function removeProgramDayAction(dayId: string) {
  return run((uid) => svc.removeProgramDay(uid, uuid.parse(dayId)));
}

export async function reorderProgramDaysAction(programId: string, ids: string[]) {
  return run((uid) => svc.reorderProgramDays(uid, uuid.parse(programId), z.array(uuid).parse(ids)));
}

const peSchema = z.object({
  sets: z.number().int().min(1).max(20).optional(),
  repMin: z.number().int().min(1).max(100).optional(),
  repMax: z.number().int().min(1).max(100).optional(),
  restSeconds: z.number().int().min(0).max(1800).nullable().optional(),
  targetRpe: z.number().min(1).max(10).nullable().optional(),
  incrementKg: z.number().min(0).max(50).optional(),
  progression: z.enum(["double", "none"]).optional(),
  notes: z.string().max(300).nullable().optional(),
});

export async function addProgramExerciseAction(dayId: string, input: z.input<typeof peSchema> & { exerciseId: string }) {
  return run((uid) => svc.addProgramExercise(uid, uuid.parse(dayId), peSchema.extend({ exerciseId: uuid }).parse(input)));
}

export async function updateProgramExerciseAction(programExerciseId: string, patch: z.input<typeof peSchema>) {
  return run((uid) => svc.updateProgramExercise(uid, uuid.parse(programExerciseId), peSchema.parse(patch)));
}

export async function removeProgramExerciseAction(programExerciseId: string) {
  return run((uid) => svc.removeProgramExercise(uid, uuid.parse(programExerciseId)));
}

export async function replaceProgramExerciseAction(programExerciseId: string, newExerciseId: string) {
  return run((uid) => svc.replaceProgramExercise(uid, uuid.parse(programExerciseId), uuid.parse(newExerciseId)));
}

export async function reorderProgramExercisesAction(dayId: string, ids: string[]) {
  return run((uid) => svc.reorderProgramExercises(uid, uuid.parse(dayId), z.array(uuid).parse(ids)));
}

/* ── Workouts ── */

export async function startWorkoutAction(_: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  const dayId = str(form.get("programDayId"));
  const date = str(form.get("date"));
  const r = await run(
    (uid) =>
      svc.startWorkout(uid, {
        programDayId: dayId && uuid.safeParse(dayId).success ? dayId : null,
        name: str(form.get("name")),
        date: date ?? null,
      }),
    ["/workout"],
  );
  if (!r.ok) return r;
  redirect(`/workout/session/${r.data!.id}`);
}

const setSchema = z.object({
  id: uuid.optional(),
  exerciseId: uuid,
  exerciseOrder: z.number().int().min(0).max(200),
  setNumber: z.number().int().min(1).max(100),
  weightKg: z.number().min(0).max(2000),
  reps: z.number().int().min(0).max(1000),
  rpe: optNum,
  isWarmup: z.boolean().optional(),
  completed: z.boolean().optional(),
  notes: z.string().max(300).nullable().optional(),
});

export async function saveSetAction(workoutId: string, set: z.input<typeof setSchema>) {
  return run((uid) => svc.logSet(uid, uuid.parse(workoutId), setSchema.parse(set)));
}

export async function deleteSetAction(setId: string) {
  return run((uid) => svc.deleteSet(uid, uuid.parse(setId)));
}

export async function updateWorkoutAction(workoutId: string, patch: { name?: string; notes?: string | null }) {
  return run((uid) => svc.updateWorkout(uid, uuid.parse(workoutId), z.object({ name: z.string().max(80).optional(), notes: z.string().max(2000).nullable().optional() }).parse(patch)));
}

export async function getExerciseLastAction(exerciseId: string, workoutId?: string) {
  return run((uid) => svc.getExerciseLast(uid, uuid.parse(exerciseId), workoutId ? uuid.parse(workoutId) : undefined));
}

export async function finishWorkoutAction(workoutId: string, notes?: string | null) {
  // No revalidatePath here: it would re-render the session route (which redirects finished workouts)
  // before the client shows the summary. All workout pages are dynamic; the client refreshes on exit.
  return run((uid) => svc.finishWorkout(uid, uuid.parse(workoutId), notes !== undefined ? { notes } : {}));
}

export async function discardWorkoutAction(workoutId: string) {
  const r = await run((uid) => svc.deleteWorkout(uid, uuid.parse(workoutId)), ["/workout"]);
  if (r.ok) redirect("/workout");
  return r;
}

export async function deleteWorkoutAction(workoutId: string) {
  const r = await run((uid) => svc.deleteWorkout(uid, uuid.parse(workoutId)), ["/workout", "/workout/history"]);
  if (r.ok) redirect("/workout/history");
  return r;
}

/* ── Body metrics ── */

export async function logBodyMetricAction(_: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  return run(
    async (uid) => {
      const date = str(form.get("date")) ?? isoDate();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new svc.WorkoutError("Neplatné datum");
      const weightKg = toNum(form.get("weightKg"));
      const bodyFatPct = toNum(form.get("bodyFatPct"));
      const waistCm = toNum(form.get("waistCm"));
      if (weightKg == null && bodyFatPct == null && waistCm == null) throw new svc.WorkoutError("Vyplň aspoň jednu hodnotu");
      if (weightKg != null && (weightKg < 20 || weightKg > 400)) throw new svc.WorkoutError("Neplatná váha");
      if (bodyFatPct != null && (bodyFatPct < 2 || bodyFatPct > 70)) throw new svc.WorkoutError("Neplatné % tuku");
      if (waistCm != null && (waistCm < 30 || waistCm > 250)) throw new svc.WorkoutError("Neplatný obvod pasu");
      await svc.logBodyMetric(uid, {
        date,
        ...(weightKg != null ? { weightKg } : {}),
        ...(bodyFatPct != null ? { bodyFatPct } : {}),
        ...(waistCm != null ? { waistCm } : {}),
      });
    },
    ["/workout/body", "/workout", "/"],
  );
}

export async function clearBodyMetricAction(date: string) {
  return run((uid) => svc.clearBodyMetric(uid, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(date)), ["/workout/body"]);
}

/* ── This week's schedule (one-week moves) ── */

const weekdayOrNull = z.number().int().min(1).max(7).nullable();

export async function moveDayThisWeekAction(dayId: string, toWeekday: number | null) {
  return run((uid) => svc.moveProgramDayThisWeek(uid, uuid.parse(dayId), weekdayOrNull.parse(toWeekday)), ["/workout", "/"]);
}

export async function swapDaysThisWeekAction(dayIdA: string, dayIdB: string) {
  return run((uid) => svc.swapProgramDaysThisWeek(uid, uuid.parse(dayIdA), uuid.parse(dayIdB)), ["/workout", "/"]);
}

export async function resetWeekPlanAction() {
  return run((uid) => svc.resetWeekPlan(uid), ["/workout", "/"]);
}

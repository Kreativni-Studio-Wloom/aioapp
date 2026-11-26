import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, ne, or, sql } from "drizzle-orm";
import { db, t } from "@/db";
import type { Equipment } from "@/db/schema";
import { addDays, isoDate } from "@/lib/format";
import { bestSet, e1rm, roundTo } from "./calc";
import { PROGRAM_TEMPLATES } from "./templates";

/* ───────────────────────────── Errors & helpers ───────────────────────────── */

export class WorkoutError extends Error {}
const notFound = (what = "Záznam") => new WorkoutError(`${what} nenalezen`);

const iso = (d: Date | string | null) => (d == null ? null : new Date(d).toISOString());

/** ISO weekday 1 (Mon) … 7 (Sun) in Europe/Prague. */
export function pragueWeekday(d: Date = new Date()) {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Prague", weekday: "short" }).format(d);
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(name) + 1;
}

/** Monday (YYYY-MM-DD, Prague) of the week containing `d`. */
export function weekStart(d: Date = new Date()) {
  return addDays(isoDate(d), -(pragueWeekday(d) - 1));
}

/** Start of a Prague calendar day as a Date (approximation via noon offset is avoided: uses ISO midnight in Prague). */
function pragueDayStart(isoDay: string) {
  // Find the UTC instant of 00:00 Europe/Prague for that date.
  const guess = new Date(isoDay + "T00:00:00Z");
  const offsetH = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Prague", hour: "2-digit", hourCycle: "h23" }).format(guess),
  );
  // offsetH is 1 (CET) or 2 (CEST)
  return new Date(guess.getTime() - offsetH * 3600_000);
}

async function getProfileSettings(userId: string) {
  const [p] = await db
    .select({ stagnationSessions: t.profiles.stagnationSessions, defaultRestSeconds: t.profiles.defaultRestSeconds })
    .from(t.profiles)
    .where(eq(t.profiles.userId, userId))
    .limit(1);
  return { stagnationSessions: p?.stagnationSessions ?? 3, defaultRestSeconds: p?.defaultRestSeconds ?? 120 };
}

/* ───────────────────────────────── Exercises ───────────────────────────────── */

export type ExerciseDTO = {
  id: string;
  name: string;
  primaryMuscle: string;
  secondaryMuscles: string[];
  pattern: string;
  equipment: Equipment;
  isUnilateral: boolean;
  isCustom: boolean;
  notes: string | null;
};

type ExerciseRow = typeof t.exercises.$inferSelect;
const toExercise = (r: ExerciseRow): ExerciseDTO => ({
  id: r.id,
  name: r.name,
  primaryMuscle: r.primaryMuscle,
  secondaryMuscles: r.secondaryMuscles ?? [],
  pattern: r.pattern,
  equipment: r.equipment,
  isUnilateral: r.isUnilateral,
  isCustom: r.userId != null,
  notes: r.notes,
});

const visibleTo = (userId: string) => or(isNull(t.exercises.userId), eq(t.exercises.userId, userId));

export const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

/** Built-in + the user's custom exercises, optionally filtered (diacritics-insensitive) by name/muscle. */
export async function listExercises(userId: string, q?: string): Promise<ExerciseDTO[]> {
  const rows = await db.select().from(t.exercises).where(visibleTo(userId)).orderBy(asc(t.exercises.name));
  let list = rows.map(toExercise);
  if (q && q.trim()) {
    const terms = normalize(q).split(/\s+/);
    list = list.filter((e) => {
      const hay = normalize(`${e.name} ${e.primaryMuscle} ${e.equipment}`);
      return terms.every((term) => hay.includes(term));
    });
  }
  return list;
}

export async function getExercise(userId: string, exerciseId: string): Promise<ExerciseDTO | null> {
  const [r] = await db
    .select()
    .from(t.exercises)
    .where(and(eq(t.exercises.id, exerciseId), visibleTo(userId)))
    .limit(1);
  return r ? toExercise(r) : null;
}

async function assertExercise(userId: string, exerciseId: string) {
  const ex = await getExercise(userId, exerciseId);
  if (!ex) throw notFound("Cvik");
  return ex;
}

export type ExerciseInput = {
  name: string;
  primaryMuscle: string;
  secondaryMuscles?: string[];
  pattern: string;
  equipment: Equipment;
  isUnilateral?: boolean;
  notes?: string | null;
};

export async function createExercise(userId: string, input: ExerciseInput): Promise<ExerciseDTO> {
  const [r] = await db
    .insert(t.exercises)
    .values({
      userId,
      name: input.name.trim(),
      primaryMuscle: input.primaryMuscle,
      secondaryMuscles: input.secondaryMuscles ?? [],
      pattern: input.pattern,
      equipment: input.equipment,
      isUnilateral: input.isUnilateral ?? false,
      notes: input.notes ?? null,
    })
    .returning();
  return toExercise(r);
}

export async function updateExercise(userId: string, exerciseId: string, patch: Partial<ExerciseInput>): Promise<ExerciseDTO> {
  const [r] = await db
    .update(t.exercises)
    .set({ ...patch, ...(patch.name ? { name: patch.name.trim() } : {}) })
    .where(and(eq(t.exercises.id, exerciseId), eq(t.exercises.userId, userId)))
    .returning();
  if (!r) throw notFound("Vlastní cvik");
  return toExercise(r);
}

/** Deletes a custom exercise (cascades to its logged sets and program slots). */
export async function deleteExercise(userId: string, exerciseId: string) {
  const r = await db
    .delete(t.exercises)
    .where(and(eq(t.exercises.id, exerciseId), eq(t.exercises.userId, userId)))
    .returning({ id: t.exercises.id });
  if (!r.length) throw notFound("Vlastní cvik");
}

export type AlternativeDTO = ExerciseDTO & { match: "pattern_muscle" | "muscle" | "pattern"; sameEquipment: boolean };

/** Alternatives ranked: same pattern + same primary muscle, then same primary muscle, then same pattern. */
export async function getAlternatives(userId: string, exerciseId: string, limit = 12): Promise<AlternativeDTO[]> {
  const base = await assertExercise(userId, exerciseId);
  const all = await listExercises(userId);
  const rank = { pattern_muscle: 0, muscle: 1, pattern: 2 } as const;
  const out: AlternativeDTO[] = [];
  for (const e of all) {
    if (e.id === base.id) continue;
    const samePattern = e.pattern === base.pattern;
    const sameMuscle = e.primaryMuscle === base.primaryMuscle;
    const match = samePattern && sameMuscle ? "pattern_muscle" : sameMuscle ? "muscle" : samePattern ? "pattern" : null;
    if (!match) continue;
    out.push({ ...e, match, sameEquipment: e.equipment === base.equipment });
  }
  out.sort(
    (a, b) =>
      rank[a.match] - rank[b.match] ||
      Number(a.sameEquipment) - Number(b.sameEquipment) || // different equipment first = more useful swap
      a.name.localeCompare(b.name, "cs"),
  );
  return out.slice(0, limit);
}

/* ───────────────────────────────── Programs ───────────────────────────────── */

export type ProgramExerciseDTO = {
  id: string;
  dayId: string;
  exerciseId: string;
  exerciseName: string;
  primaryMuscle: string;
  equipment: Equipment;
  order: number;
  sets: number;
  repMin: number;
  repMax: number;
  restSeconds: number | null;
  targetRpe: number | null;
  incrementKg: number;
  progression: "double" | "none";
  notes: string | null;
};
export type ProgramDayDTO = { id: string; programId: string; name: string; order: number; weekday: number | null; exercises: ProgramExerciseDTO[] };
export type ProgramDTO = { id: string; name: string; description: string | null; isActive: boolean; createdAt: string; days: ProgramDayDTO[] };
export type ProgramListItem = { id: string; name: string; description: string | null; isActive: boolean; createdAt: string; dayCount: number; exerciseCount: number };

export type ProgramExerciseInput = {
  exerciseId: string;
  sets?: number;
  repMin?: number;
  repMax?: number;
  restSeconds?: number | null;
  targetRpe?: number | null;
  incrementKg?: number;
  progression?: "double" | "none";
  notes?: string | null;
};
export type ProgramInput = {
  name: string;
  description?: string | null;
  days?: { name: string; weekday?: number | null; exercises?: ProgramExerciseInput[] }[];
};

async function assertProgram(userId: string, programId: string) {
  const [p] = await db
    .select({ id: t.programs.id })
    .from(t.programs)
    .where(and(eq(t.programs.id, programId), eq(t.programs.userId, userId)))
    .limit(1);
  if (!p) throw notFound("Program");
}

async function assertDay(userId: string, dayId: string) {
  const [d] = await db
    .select({ id: t.programDays.id, programId: t.programDays.programId })
    .from(t.programDays)
    .innerJoin(t.programs, eq(t.programs.id, t.programDays.programId))
    .where(and(eq(t.programDays.id, dayId), eq(t.programs.userId, userId)))
    .limit(1);
  if (!d) throw notFound("Tréninkový den");
  return d;
}

async function assertProgramExercise(userId: string, programExerciseId: string) {
  const [r] = await db
    .select({ id: t.programExercises.id, dayId: t.programExercises.dayId, programId: t.programDays.programId })
    .from(t.programExercises)
    .innerJoin(t.programDays, eq(t.programDays.id, t.programExercises.dayId))
    .innerJoin(t.programs, eq(t.programs.id, t.programDays.programId))
    .where(and(eq(t.programExercises.id, programExerciseId), eq(t.programs.userId, userId)))
    .limit(1);
  if (!r) throw notFound("Cvik v programu");
  return r;
}

export async function listPrograms(userId: string): Promise<ProgramListItem[]> {
  const rows = await db
    .select({
      id: t.programs.id,
      name: t.programs.name,
      description: t.programs.description,
      isActive: t.programs.isActive,
      createdAt: t.programs.createdAt,
      dayCount: sql<number>`(select count(*)::int from program_days d where d.program_id = programs.id)`,
      exerciseCount: sql<number>`(select count(*)::int from program_exercises pe join program_days d on d.id = pe.day_id where d.program_id = programs.id)`,
    })
    .from(t.programs)
    .where(eq(t.programs.userId, userId))
    .orderBy(desc(t.programs.isActive), desc(t.programs.createdAt));
  return rows.map((r) => ({ ...r, createdAt: iso(r.createdAt)! }));
}

export async function getProgram(userId: string, programId: string): Promise<ProgramDTO | null> {
  const [p] = await db
    .select()
    .from(t.programs)
    .where(and(eq(t.programs.id, programId), eq(t.programs.userId, userId)))
    .limit(1);
  if (!p) return null;
  const days = await db
    .select()
    .from(t.programDays)
    .where(eq(t.programDays.programId, p.id))
    .orderBy(asc(t.programDays.order), asc(t.programDays.name));
  const dayIds = days.map((d) => d.id);
  const pes = dayIds.length
    ? await db
        .select({ pe: t.programExercises, name: t.exercises.name, primaryMuscle: t.exercises.primaryMuscle, equipment: t.exercises.equipment })
        .from(t.programExercises)
        .innerJoin(t.exercises, eq(t.exercises.id, t.programExercises.exerciseId))
        .where(inArray(t.programExercises.dayId, dayIds))
        .orderBy(asc(t.programExercises.order))
    : [];
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    isActive: p.isActive,
    createdAt: iso(p.createdAt)!,
    days: days.map((d) => ({
      id: d.id,
      programId: d.programId,
      name: d.name,
      order: d.order,
      weekday: d.weekday,
      exercises: pes
        .filter((x) => x.pe.dayId === d.id)
        .map((x) => ({
          id: x.pe.id,
          dayId: x.pe.dayId,
          exerciseId: x.pe.exerciseId,
          exerciseName: x.name,
          primaryMuscle: x.primaryMuscle,
          equipment: x.equipment,
          order: x.pe.order,
          sets: x.pe.sets,
          repMin: x.pe.repMin,
          repMax: x.pe.repMax,
          restSeconds: x.pe.restSeconds,
          targetRpe: x.pe.targetRpe,
          incrementKg: x.pe.incrementKg,
          progression: x.pe.progression,
          notes: x.pe.notes,
        })),
    })),
  };
}

export async function getActiveProgram(userId: string): Promise<ProgramDTO | null> {
  const [p] = await db
    .select({ id: t.programs.id })
    .from(t.programs)
    .where(and(eq(t.programs.userId, userId), eq(t.programs.isActive, true)))
    .orderBy(desc(t.programs.createdAt))
    .limit(1);
  return p ? getProgram(userId, p.id) : null;
}

const peValues = (dayId: string, order: number, x: ProgramExerciseInput) => {
  const repMin = x.repMin ?? 8;
  return {
    dayId,
    exerciseId: x.exerciseId,
    order,
    sets: x.sets ?? 3,
    repMin,
    repMax: Math.max(repMin, x.repMax ?? 12),
    restSeconds: x.restSeconds ?? null,
    targetRpe: x.targetRpe ?? null,
    incrementKg: x.incrementKg ?? 2.5,
    progression: x.progression ?? "double",
    notes: x.notes ?? null,
  };
};

export async function createProgram(userId: string, input: ProgramInput): Promise<ProgramDTO> {
  const exIds = [...new Set((input.days ?? []).flatMap((d) => (d.exercises ?? []).map((e) => e.exerciseId)))];
  if (exIds.length) {
    const ok = await db.select({ id: t.exercises.id }).from(t.exercises).where(and(inArray(t.exercises.id, exIds), visibleTo(userId)));
    if (ok.length !== exIds.length) throw notFound("Cvik");
  }
  const [hasActive] = await db
    .select({ id: t.programs.id })
    .from(t.programs)
    .where(and(eq(t.programs.userId, userId), eq(t.programs.isActive, true)))
    .limit(1);
  const programId = await db.transaction(async (tx) => {
    const [p] = await tx
      .insert(t.programs)
      .values({ userId, name: input.name.trim() || "Program", description: input.description ?? null, isActive: !hasActive })
      .returning({ id: t.programs.id });
    for (const [i, d] of (input.days ?? []).entries()) {
      const [day] = await tx
        .insert(t.programDays)
        .values({ programId: p.id, name: d.name || `Den ${i + 1}`, order: i, weekday: d.weekday ?? null })
        .returning({ id: t.programDays.id });
      const exs = d.exercises ?? [];
      if (exs.length) await tx.insert(t.programExercises).values(exs.map((x, j) => peValues(day.id, j, x)));
    }
    return p.id;
  });
  return (await getProgram(userId, programId))!;
}

export function listProgramTemplates() {
  return PROGRAM_TEMPLATES.map((tpl) => ({
    key: tpl.key,
    name: tpl.name,
    description: tpl.description,
    days: tpl.days.map((d) => ({ name: d.name, exerciseCount: d.exercises.length })),
  }));
}

export async function cloneProgramTemplate(userId: string, key: string): Promise<ProgramDTO> {
  const tpl = PROGRAM_TEMPLATES.find((x) => x.key === key);
  if (!tpl) throw notFound("Šablona");
  const names = [...new Set(tpl.days.flatMap((d) => d.exercises.map((e) => e.name)))];
  const rows = await db
    .select({ id: t.exercises.id, name: t.exercises.name })
    .from(t.exercises)
    .where(and(isNull(t.exercises.userId), inArray(t.exercises.name, names)));
  const byName = new Map(rows.map((r) => [r.name, r.id]));
  return createProgram(userId, {
    name: tpl.name,
    description: tpl.description,
    days: tpl.days.map((d) => ({
      name: d.name,
      weekday: d.weekday ?? null,
      exercises: d.exercises
        .filter((e) => byName.has(e.name))
        .map((e) => ({
          exerciseId: byName.get(e.name)!,
          sets: e.sets,
          repMin: e.repMin,
          repMax: e.repMax,
          restSeconds: e.restSeconds ?? null,
          incrementKg: e.incrementKg ?? 2.5,
        })),
    })),
  });
}

export async function updateProgram(userId: string, programId: string, patch: { name?: string; description?: string | null }) {
  await assertProgram(userId, programId);
  await db
    .update(t.programs)
    .set({ ...(patch.name != null ? { name: patch.name.trim() || "Program" } : {}), ...(patch.description !== undefined ? { description: patch.description } : {}) })
    .where(eq(t.programs.id, programId));
}

export async function deleteProgram(userId: string, programId: string) {
  await assertProgram(userId, programId);
  await db.delete(t.programs).where(eq(t.programs.id, programId));
}

/** Makes this program the only active one. Pass null to deactivate all. */
export async function setActiveProgram(userId: string, programId: string | null) {
  if (programId) await assertProgram(userId, programId);
  await db.transaction(async (tx) => {
    await tx.update(t.programs).set({ isActive: false }).where(eq(t.programs.userId, userId));
    if (programId) await tx.update(t.programs).set({ isActive: true }).where(eq(t.programs.id, programId));
  });
}

export async function addProgramDay(userId: string, programId: string, input: { name: string; weekday?: number | null }) {
  await assertProgram(userId, programId);
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${t.programDays.order}), -1)::int` })
    .from(t.programDays)
    .where(eq(t.programDays.programId, programId));
  const [d] = await db
    .insert(t.programDays)
    .values({ programId, name: input.name.trim() || "Den", weekday: input.weekday ?? null, order: max + 1 })
    .returning({ id: t.programDays.id });
  return { id: d.id };
}

export async function updateProgramDay(userId: string, dayId: string, patch: { name?: string; weekday?: number | null; order?: number }) {
  await assertDay(userId, dayId);
  await db
    .update(t.programDays)
    .set({
      ...(patch.name != null ? { name: patch.name.trim() || "Den" } : {}),
      ...(patch.weekday !== undefined ? { weekday: patch.weekday } : {}),
      ...(patch.order != null ? { order: patch.order } : {}),
    })
    .where(eq(t.programDays.id, dayId));
}

export async function removeProgramDay(userId: string, dayId: string) {
  await assertDay(userId, dayId);
  await db.delete(t.programDays).where(eq(t.programDays.id, dayId));
}

export async function reorderProgramDays(userId: string, programId: string, orderedDayIds: string[]) {
  await assertProgram(userId, programId);
  await db.transaction(async (tx) => {
    for (const [i, id] of orderedDayIds.entries())
      await tx.update(t.programDays).set({ order: i }).where(and(eq(t.programDays.id, id), eq(t.programDays.programId, programId)));
  });
}

export async function addProgramExercise(userId: string, dayId: string, input: ProgramExerciseInput): Promise<{ id: string }> {
  await assertDay(userId, dayId);
  await assertExercise(userId, input.exerciseId);
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${t.programExercises.order}), -1)::int` })
    .from(t.programExercises)
    .where(eq(t.programExercises.dayId, dayId));
  const [r] = await db.insert(t.programExercises).values(peValues(dayId, max + 1, input)).returning({ id: t.programExercises.id });
  return { id: r.id };
}

export async function updateProgramExercise(userId: string, programExerciseId: string, patch: Partial<Omit<ProgramExerciseInput, "exerciseId">>) {
  await assertProgramExercise(userId, programExerciseId);
  const set: Partial<typeof t.programExercises.$inferInsert> = {};
  if (patch.sets != null) set.sets = Math.max(1, Math.round(patch.sets));
  if (patch.repMin != null) set.repMin = Math.max(1, Math.round(patch.repMin));
  if (patch.repMax != null) set.repMax = Math.max(1, Math.round(patch.repMax));
  if (patch.restSeconds !== undefined) set.restSeconds = patch.restSeconds;
  if (patch.targetRpe !== undefined) set.targetRpe = patch.targetRpe;
  if (patch.incrementKg != null) set.incrementKg = patch.incrementKg;
  if (patch.progression) set.progression = patch.progression;
  if (patch.notes !== undefined) set.notes = patch.notes;
  if (set.repMin != null && set.repMax != null && set.repMax < set.repMin) set.repMax = set.repMin;
  if (Object.keys(set).length) await db.update(t.programExercises).set(set).where(eq(t.programExercises.id, programExerciseId));
}

export async function removeProgramExercise(userId: string, programExerciseId: string) {
  await assertProgramExercise(userId, programExerciseId);
  await db.delete(t.programExercises).where(eq(t.programExercises.id, programExerciseId));
}

export async function replaceProgramExercise(userId: string, programExerciseId: string, newExerciseId: string) {
  await assertProgramExercise(userId, programExerciseId);
  await assertExercise(userId, newExerciseId);
  await db.update(t.programExercises).set({ exerciseId: newExerciseId }).where(eq(t.programExercises.id, programExerciseId));
}

export async function reorderProgramExercises(userId: string, dayId: string, orderedIds: string[]) {
  await assertDay(userId, dayId);
  await db.transaction(async (tx) => {
    for (const [i, id] of orderedIds.entries())
      await tx.update(t.programExercises).set({ order: i }).where(and(eq(t.programExercises.id, id), eq(t.programExercises.dayId, dayId)));
  });
}

/** Today's planned day of the active program: matching weekday, else the day after the last one trained (by order). */
export async function getTodayPlan(userId: string) {
  const program = await getActiveProgram(userId);
  if (!program || !program.days.length) return null;
  const wd = pragueWeekday();
  let day = program.days.find((d) => d.weekday === wd) ?? null;
  let reason: "weekday" | "next" = "weekday";
  if (!day) {
    // If the program uses weekdays and today isn't one of them, it's a rest day – still suggest next in order.
    reason = "next";
    const [last] = await db
      .select({ dayId: t.workouts.programDayId })
      .from(t.workouts)
      .where(and(eq(t.workouts.userId, userId), inArray(t.workouts.programDayId, program.days.map((d) => d.id))))
      .orderBy(desc(t.workouts.startedAt))
      .limit(1);
    const idx = last ? program.days.findIndex((d) => d.id === last.dayId) : -1;
    day = program.days[(idx + 1) % program.days.length];
  }
  const restDay = reason === "next" && program.days.some((d) => d.weekday != null);
  return { programId: program.id, programName: program.name, day, reason, restDay };
}

/* ───────────────────────────────── Workouts ───────────────────────────────── */

export type WorkoutSetDTO = {
  id: string;
  exerciseId: string;
  exerciseOrder: number;
  setNumber: number;
  weightKg: number;
  reps: number;
  rpe: number | null;
  isWarmup: boolean;
  completed: boolean;
  notes: string | null;
};
type SetRow = typeof t.workoutSets.$inferSelect;
const toSet = (r: SetRow): WorkoutSetDTO => ({
  id: r.id,
  exerciseId: r.exerciseId,
  exerciseOrder: r.exerciseOrder,
  setNumber: r.setNumber,
  weightKg: r.weightKg,
  reps: r.reps,
  rpe: r.rpe,
  isWarmup: r.isWarmup,
  completed: r.completed,
  notes: r.notes,
});

export type WorkoutListItem = {
  id: string;
  name: string;
  date: string;
  startedAt: string;
  finishedAt: string | null;
  durationSec: number | null;
  volumeKg: number;
  sets: number;
  exercises: number;
  programDayId: string | null;
};

const workVolumeSql = sql<number>`coalesce(sum(case when ${t.workoutSets.completed} and not ${t.workoutSets.isWarmup} then ${t.workoutSets.weightKg} * ${t.workoutSets.reps} else 0 end), 0)::float`;
const workSetsSql = sql<number>`count(case when ${t.workoutSets.completed} and not ${t.workoutSets.isWarmup} then 1 end)::int`;
const exCountSql = sql<number>`count(distinct case when ${t.workoutSets.completed} then ${t.workoutSets.exerciseId} end)::int`;

async function listWorkoutsWhere(userId: string, opts: { limit?: number; since?: Date; finishedOnly?: boolean; before?: Date }) {
  const conds = [eq(t.workouts.userId, userId)];
  if (opts.finishedOnly !== false) conds.push(isNotNull(t.workouts.finishedAt));
  if (opts.since) conds.push(gte(t.workouts.startedAt, opts.since));
  if (opts.before) conds.push(lt(t.workouts.startedAt, opts.before));
  const q = db
    .select({
      id: t.workouts.id,
      name: t.workouts.name,
      startedAt: t.workouts.startedAt,
      finishedAt: t.workouts.finishedAt,
      programDayId: t.workouts.programDayId,
      volumeKg: workVolumeSql,
      sets: workSetsSql,
      exercises: exCountSql,
    })
    .from(t.workouts)
    .leftJoin(t.workoutSets, eq(t.workoutSets.workoutId, t.workouts.id))
    .where(and(...conds))
    .groupBy(t.workouts.id)
    .orderBy(desc(t.workouts.startedAt));
  const rows = opts.limit ? await q.limit(opts.limit) : await q;
  return rows.map(
    (r): WorkoutListItem => ({
      id: r.id,
      name: r.name,
      date: isoDate(r.startedAt),
      startedAt: iso(r.startedAt)!,
      finishedAt: iso(r.finishedAt),
      durationSec: r.finishedAt ? Math.round((r.finishedAt.getTime() - r.startedAt.getTime()) / 1000) : null,
      volumeKg: Math.round(r.volumeKg),
      sets: r.sets,
      exercises: r.exercises,
      programDayId: r.programDayId,
    }),
  );
}

/** Finished workouts, newest first. */
export async function getRecentWorkouts(userId: string, limit = 10): Promise<WorkoutListItem[]> {
  return listWorkoutsWhere(userId, { limit });
}

/** Finished workouts in the last `days` days (for history / heatmap). */
export async function getWorkoutsSince(userId: string, days: number): Promise<WorkoutListItem[]> {
  return listWorkoutsWhere(userId, { since: pragueDayStart(addDays(isoDate(), -days)) });
}

export async function getActiveWorkout(userId: string) {
  const [w] = await db
    .select({ id: t.workouts.id, name: t.workouts.name, startedAt: t.workouts.startedAt })
    .from(t.workouts)
    .where(and(eq(t.workouts.userId, userId), isNull(t.workouts.finishedAt)))
    .orderBy(desc(t.workouts.startedAt))
    .limit(1);
  return w ? { id: w.id, name: w.name, startedAt: iso(w.startedAt)! } : null;
}

async function assertWorkout(userId: string, workoutId: string) {
  const [w] = await db
    .select()
    .from(t.workouts)
    .where(and(eq(t.workouts.id, workoutId), eq(t.workouts.userId, userId)))
    .limit(1);
  if (!w) throw notFound("Trénink");
  return w;
}

export type PersonalRecord = { exerciseId: string; exerciseName: string; kind: "e1rm" | "weight"; value: number; previous: number; reps?: number };

/** PRs achieved in a workout compared to all of the user's earlier workouts. */
async function computePrs(userId: string, workoutId: string, startedAt: Date, sets: (WorkoutSetDTO & { exerciseName: string })[]) {
  const work = sets.filter((s) => s.completed && !s.isWarmup && s.reps > 0);
  const exIds = [...new Set(work.map((s) => s.exerciseId))];
  if (!exIds.length) return [];
  const prev = await db
    .select({
      exerciseId: t.workoutSets.exerciseId,
      maxW: sql<number>`max(${t.workoutSets.weightKg})::float`,
      maxE: sql<number>`max(case when ${t.workoutSets.reps} = 1 then ${t.workoutSets.weightKg} else ${t.workoutSets.weightKg} * (1 + ${t.workoutSets.reps} / 30.0) end)::float`,
    })
    .from(t.workoutSets)
    .innerJoin(t.workouts, eq(t.workouts.id, t.workoutSets.workoutId))
    .where(
      and(
        eq(t.workouts.userId, userId),
        ne(t.workouts.id, workoutId),
        lt(t.workouts.startedAt, startedAt),
        inArray(t.workoutSets.exerciseId, exIds),
        eq(t.workoutSets.completed, true),
        eq(t.workoutSets.isWarmup, false),
        sql`${t.workoutSets.reps} > 0`,
      ),
    )
    .groupBy(t.workoutSets.exerciseId);
  const prevBy = new Map(prev.map((p) => [p.exerciseId, p]));
  const prs: PersonalRecord[] = [];
  for (const id of exIds) {
    const p = prevBy.get(id);
    if (!p) continue; // first time – no PR
    const mine = work.filter((s) => s.exerciseId === id);
    const name = mine[0].exerciseName;
    const top = bestSet(mine)!;
    const bestE = Math.max(...mine.map((s) => e1rm(s.weightKg, s.reps)));
    const prevE = Math.round(p.maxE * 10) / 10;
    if (top.weightKg > p.maxW && top.weightKg > 0) prs.push({ exerciseId: id, exerciseName: name, kind: "weight", value: top.weightKg, previous: p.maxW, reps: top.reps });
    else if (bestE > prevE && bestE > 0) prs.push({ exerciseId: id, exerciseName: name, kind: "e1rm", value: bestE, previous: prevE });
  }
  return prs;
}

export type WorkoutDetail = {
  id: string;
  name: string;
  notes: string | null;
  date: string;
  startedAt: string;
  finishedAt: string | null;
  durationSec: number | null;
  programDayId: string | null;
  volumeKg: number;
  sets: number;
  exercises: {
    exerciseId: string;
    exerciseName: string;
    primaryMuscle: string;
    equipment: Equipment;
    order: number;
    sets: WorkoutSetDTO[];
    volumeKg: number;
    bestE1rm: number;
  }[];
  prs: PersonalRecord[];
};

export async function getWorkout(userId: string, workoutId: string): Promise<WorkoutDetail | null> {
  const [w] = await db
    .select()
    .from(t.workouts)
    .where(and(eq(t.workouts.id, workoutId), eq(t.workouts.userId, userId)))
    .limit(1);
  if (!w) return null;
  const rows = await db
    .select({ s: t.workoutSets, name: t.exercises.name, primaryMuscle: t.exercises.primaryMuscle, equipment: t.exercises.equipment })
    .from(t.workoutSets)
    .innerJoin(t.exercises, eq(t.exercises.id, t.workoutSets.exerciseId))
    .where(eq(t.workoutSets.workoutId, w.id))
    .orderBy(asc(t.workoutSets.exerciseOrder), asc(t.workoutSets.setNumber), asc(t.workoutSets.createdAt));
  const sets = rows.map((r) => ({ ...toSet(r.s), exerciseName: r.name }));
  const groups = new Map<string, WorkoutDetail["exercises"][number]>();
  for (const r of rows) {
    const key = `${r.s.exerciseOrder}:${r.s.exerciseId}`;
    let g = groups.get(key);
    if (!g) {
      g = { exerciseId: r.s.exerciseId, exerciseName: r.name, primaryMuscle: r.primaryMuscle, equipment: r.equipment, order: r.s.exerciseOrder, sets: [], volumeKg: 0, bestE1rm: 0 };
      groups.set(key, g);
    }
    const s = toSet(r.s);
    g.sets.push(s);
    if (s.completed && !s.isWarmup) {
      g.volumeKg += s.weightKg * s.reps;
      g.bestE1rm = Math.max(g.bestE1rm, e1rm(s.weightKg, s.reps));
    }
  }
  const exercises = [...groups.values()].sort((a, b) => a.order - b.order);
  const done = sets.filter((s) => s.completed && !s.isWarmup);
  return {
    id: w.id,
    name: w.name,
    notes: w.notes,
    date: isoDate(w.startedAt),
    startedAt: iso(w.startedAt)!,
    finishedAt: iso(w.finishedAt),
    durationSec: w.finishedAt ? Math.round((w.finishedAt.getTime() - w.startedAt.getTime()) / 1000) : null,
    programDayId: w.programDayId,
    volumeKg: Math.round(done.reduce((a, s) => a + s.weightKg * s.reps, 0)),
    sets: done.length,
    exercises,
    prs: await computePrs(userId, w.id, w.startedAt, sets),
  };
}

export type LastPerformance = { workoutId: string; date: string; sets: { weightKg: number; reps: number; rpe: number | null; isWarmup: boolean }[] };

/** Most recent performance of each exercise (excluding a given workout). */
export async function getLastPerformances(userId: string, exerciseIds: string[], excludeWorkoutId?: string): Promise<Record<string, LastPerformance>> {
  const ids = [...new Set(exerciseIds)];
  if (!ids.length) return {};
  const rows = await db
    .select({
      workoutId: t.workouts.id,
      startedAt: t.workouts.startedAt,
      exerciseId: t.workoutSets.exerciseId,
      weightKg: t.workoutSets.weightKg,
      reps: t.workoutSets.reps,
      rpe: t.workoutSets.rpe,
      isWarmup: t.workoutSets.isWarmup,
    })
    .from(t.workoutSets)
    .innerJoin(t.workouts, eq(t.workouts.id, t.workoutSets.workoutId))
    .where(
      and(
        eq(t.workouts.userId, userId),
        inArray(t.workoutSets.exerciseId, ids),
        eq(t.workoutSets.completed, true),
        excludeWorkoutId ? ne(t.workouts.id, excludeWorkoutId) : undefined,
        gte(t.workouts.startedAt, new Date(Date.now() - 400 * 864e5)),
      ),
    )
    .orderBy(desc(t.workouts.startedAt), asc(t.workoutSets.exerciseOrder), asc(t.workoutSets.setNumber));
  const out: Record<string, LastPerformance> = {};
  for (const r of rows) {
    const cur = out[r.exerciseId];
    if (!cur) out[r.exerciseId] = { workoutId: r.workoutId, date: isoDate(r.startedAt), sets: [] };
    if (out[r.exerciseId].workoutId === r.workoutId)
      out[r.exerciseId].sets.push({ weightKg: r.weightKg, reps: r.reps, rpe: r.rpe, isWarmup: r.isWarmup });
  }
  return out;
}

export async function getExerciseLast(userId: string, exerciseId: string, excludeWorkoutId?: string) {
  return (await getLastPerformances(userId, [exerciseId], excludeWorkoutId))[exerciseId] ?? null;
}

/** A workout this long after its start is treated as logged after the fact (backdated or forgotten). */
const BACKDATED_AFTER_MS = 12 * 3600_000;
const BACKDATED_DURATION_MS = 60 * 60_000;

/**
 * Start a workout from a program day (prefilled, uncompleted sets) or empty. Returns an existing unfinished workout if any.
 * `date` (YYYY-MM-DD, Prague, not in the future) logs a past workout: it starts at 17:00 that day and
 * finishWorkout stamps finishedAt on the same day.
 */
export async function startWorkout(
  userId: string,
  input: { programDayId?: string | null; name?: string | null; date?: string | null } = {},
): Promise<{ id: string; resumed: boolean }> {
  let startedAt: Date | undefined;
  if (input.date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new WorkoutError("Neplatné datum");
    const today = isoDate();
    if (input.date > today) throw new WorkoutError("Datum nemůže být v budoucnosti");
    if (input.date < addDays(today, -366)) throw new WorkoutError("Datum je příliš staré");
    if (input.date !== today) startedAt = new Date(pragueDayStart(input.date).getTime() + 17 * 3600_000);
  }
  const active = await getActiveWorkout(userId);
  if (active) {
    if (startedAt) throw new WorkoutError("Nejdřív dokonči nebo zahoď rozpracovaný trénink.");
    return { id: active.id, resumed: true };
  }

  let dayName: string | null = null;
  let pes: ProgramExerciseDTO[] = [];
  if (input.programDayId) {
    const d = await assertDay(userId, input.programDayId);
    const program = await getProgram(userId, d.programId);
    const day = program?.days.find((x) => x.id === input.programDayId);
    dayName = day?.name ?? null;
    pes = day?.exercises ?? [];
  }
  const last = await getLastPerformances(userId, pes.map((p) => p.exerciseId));
  const id = await db.transaction(async (tx) => {
    const [w] = await tx
      .insert(t.workouts)
      .values({ userId, programDayId: input.programDayId ?? null, name: input.name?.trim() || dayName || "Trénink", ...(startedAt ? { startedAt } : {}) })
      .returning({ id: t.workouts.id });
    const values: (typeof t.workoutSets.$inferInsert)[] = [];
    pes.forEach((pe, order) => {
      const prev = (last[pe.exerciseId]?.sets ?? []).filter((s) => !s.isWarmup);
      for (let i = 0; i < pe.sets; i++) {
        const ref = prev[i] ?? prev[prev.length - 1];
        values.push({
          workoutId: w.id,
          exerciseId: pe.exerciseId,
          exerciseOrder: order,
          setNumber: i + 1,
          weightKg: ref?.weightKg ?? 0,
          reps: ref?.reps ?? pe.repMin,
          completed: false,
        });
      }
    });
    if (values.length) await tx.insert(t.workoutSets).values(values);
    return w.id;
  });
  return { id, resumed: false };
}

export type SetInput = {
  id?: string;
  exerciseId: string;
  exerciseOrder: number;
  setNumber: number;
  weightKg: number;
  reps: number;
  rpe?: number | null;
  isWarmup?: boolean;
  completed?: boolean;
  notes?: string | null;
};

/** Insert or update (by id) one set. Idempotent – safe to retry from an offline queue. */
export async function logSet(userId: string, workoutId: string, input: SetInput): Promise<WorkoutSetDTO> {
  await assertWorkout(userId, workoutId);
  await assertExercise(userId, input.exerciseId);
  const values = {
    workoutId,
    exerciseId: input.exerciseId,
    exerciseOrder: input.exerciseOrder,
    setNumber: input.setNumber,
    weightKg: Math.max(0, input.weightKg || 0),
    reps: Math.max(0, Math.round(input.reps || 0)),
    rpe: input.rpe ?? null,
    isWarmup: input.isWarmup ?? false,
    completed: input.completed ?? true,
    notes: input.notes ?? null,
  };
  if (input.id) {
    // guard: an existing row with this id must belong to this workout
    const [existing] = await db.select({ workoutId: t.workoutSets.workoutId }).from(t.workoutSets).where(eq(t.workoutSets.id, input.id)).limit(1);
    if (existing && existing.workoutId !== workoutId) throw notFound("Série");
    const [r] = await db
      .insert(t.workoutSets)
      .values({ id: input.id, ...values })
      .onConflictDoUpdate({ target: t.workoutSets.id, set: values })
      .returning();
    return toSet(r);
  }
  const [r] = await db.insert(t.workoutSets).values(values).returning();
  return toSet(r);
}

export async function deleteSet(userId: string, setId: string) {
  const [r] = await db
    .select({ id: t.workoutSets.id })
    .from(t.workoutSets)
    .innerJoin(t.workouts, eq(t.workouts.id, t.workoutSets.workoutId))
    .where(and(eq(t.workoutSets.id, setId), eq(t.workouts.userId, userId)))
    .limit(1);
  if (!r) return; // already gone – idempotent
  await db.delete(t.workoutSets).where(eq(t.workoutSets.id, setId));
}

/** Swap an exercise slot in a workout: all not-yet-completed sets in that slot get the new exercise. */
export async function swapWorkoutExercise(userId: string, workoutId: string, exerciseOrder: number, newExerciseId: string) {
  await assertWorkout(userId, workoutId);
  await assertExercise(userId, newExerciseId);
  await db
    .update(t.workoutSets)
    .set({ exerciseId: newExerciseId })
    .where(and(eq(t.workoutSets.workoutId, workoutId), eq(t.workoutSets.exerciseOrder, exerciseOrder), eq(t.workoutSets.completed, false)));
}

export async function updateWorkout(userId: string, workoutId: string, patch: { name?: string; notes?: string | null }) {
  await assertWorkout(userId, workoutId);
  await db
    .update(t.workouts)
    .set({ ...(patch.name != null ? { name: patch.name.trim() || "Trénink" } : {}), ...(patch.notes !== undefined ? { notes: patch.notes } : {}) })
    .where(eq(t.workouts.id, workoutId));
}

export type WorkoutFinishSummary = {
  id: string;
  name: string;
  durationSec: number;
  volumeKg: number;
  sets: number;
  exercises: number;
  prs: PersonalRecord[];
};

/** Finish a workout: drops sets that were never completed, stamps finishedAt and returns the summary with PRs. */
export async function finishWorkout(userId: string, workoutId: string, opts: { notes?: string | null } = {}): Promise<WorkoutFinishSummary> {
  const w = await assertWorkout(userId, workoutId);
  await db.delete(t.workoutSets).where(and(eq(t.workoutSets.workoutId, workoutId), eq(t.workoutSets.completed, false)));
  if (!w.finishedAt) {
    const now = new Date();
    const started = new Date(w.startedAt);
    // a backdated (or long-forgotten) workout keeps its own day instead of ending "now"
    const finishedAt = now.getTime() - started.getTime() > BACKDATED_AFTER_MS ? new Date(started.getTime() + BACKDATED_DURATION_MS) : now;
    await db
      .update(t.workouts)
      .set({ finishedAt, ...(opts.notes !== undefined ? { notes: opts.notes } : {}) })
      .where(eq(t.workouts.id, workoutId));
  }
  const d = (await getWorkout(userId, workoutId))!;
  return {
    id: d.id,
    name: d.name,
    durationSec: d.durationSec ?? 0,
    volumeKg: d.volumeKg,
    sets: d.sets,
    exercises: d.exercises.length,
    prs: d.prs,
  };
}

/** Delete a workout (used for discarding an unfinished one too). */
export async function deleteWorkout(userId: string, workoutId: string) {
  await assertWorkout(userId, workoutId);
  await db.delete(t.workouts).where(eq(t.workouts.id, workoutId));
}

export type SessionTarget = {
  programExerciseId: string;
  /** exercise planned in the program slot */
  exerciseId: string;
  sets: number;
  repMin: number;
  repMax: number;
  restSeconds: number | null;
  targetRpe: number | null;
  incrementKg: number;
  progression: "double" | "none";
  notes: string | null;
};
export type SessionExerciseInfo = { id: string; name: string; primaryMuscle: string; equipment: Equipment; pattern: string };
export type SessionData = {
  workout: { id: string; name: string; notes: string | null; startedAt: string; finishedAt: string | null; programDayId: string | null };
  sets: WorkoutSetDTO[];
  exercises: Record<string, SessionExerciseInfo>;
  /** program targets keyed by exerciseId (never by position: ad-hoc exercises and edited programs shift positions) */
  targets: Record<string, SessionTarget>;
  last: Record<string, LastPerformance>;
  defaultRestSeconds: number;
};

/** Everything the live session screen needs in one round trip. */
export async function getSessionData(userId: string, workoutId: string): Promise<SessionData | null> {
  const [w] = await db
    .select()
    .from(t.workouts)
    .where(and(eq(t.workouts.id, workoutId), eq(t.workouts.userId, userId)))
    .limit(1);
  if (!w) return null;
  const setRows = await db
    .select()
    .from(t.workoutSets)
    .where(eq(t.workoutSets.workoutId, w.id))
    .orderBy(asc(t.workoutSets.exerciseOrder), asc(t.workoutSets.setNumber), asc(t.workoutSets.createdAt));
  const sets = setRows.map(toSet);
  const targets: Record<string, SessionTarget> = {};
  const exIds = new Set(sets.map((s) => s.exerciseId));
  if (w.programDayId) {
    const pes = await db
      .select()
      .from(t.programExercises)
      .where(eq(t.programExercises.dayId, w.programDayId))
      .orderBy(asc(t.programExercises.order));
    for (const pe of pes) {
      if (targets[pe.exerciseId]) continue; // same exercise twice in a day: first slot wins
      targets[pe.exerciseId] = {
        programExerciseId: pe.id,
        exerciseId: pe.exerciseId,
        sets: pe.sets,
        repMin: pe.repMin,
        repMax: pe.repMax,
        restSeconds: pe.restSeconds,
        targetRpe: pe.targetRpe,
        incrementKg: pe.incrementKg,
        progression: pe.progression,
        notes: pe.notes,
      };
    }
  }
  const exRows = exIds.size ? await db.select().from(t.exercises).where(inArray(t.exercises.id, [...exIds])) : [];
  const exercises: Record<string, SessionExerciseInfo> = {};
  for (const e of exRows) exercises[e.id] = { id: e.id, name: e.name, primaryMuscle: e.primaryMuscle, equipment: e.equipment, pattern: e.pattern };
  const [last, settings] = await Promise.all([getLastPerformances(userId, [...exIds], w.id), getProfileSettings(userId)]);
  return {
    workout: { id: w.id, name: w.name, notes: w.notes, startedAt: iso(w.startedAt)!, finishedAt: iso(w.finishedAt), programDayId: w.programDayId },
    sets,
    exercises,
    targets,
    last,
    defaultRestSeconds: settings.defaultRestSeconds,
  };
}

/* ─────────────────────────────── History / progress ─────────────────────────────── */

export type ExerciseSession = {
  workoutId: string;
  date: string;
  sets: { weightKg: number; reps: number; rpe: number | null; isWarmup: boolean }[];
  topSetWeight: number;
  topSetReps: number;
  bestE1rm: number;
  volumeKg: number;
};
export type ExerciseHistory = {
  exercise: ExerciseDTO;
  /** newest first */
  sessions: ExerciseSession[];
  prs: {
    bestE1rm: { value: number; weightKg: number; reps: number; date: string } | null;
    bestWeight: { weightKg: number; reps: number; date: string } | null;
    byReps: { reps: number; weightKg: number; date: string }[];
  };
};

export async function getExerciseHistory(userId: string, exerciseId: string, limit = 30): Promise<ExerciseHistory | null> {
  const exercise = await getExercise(userId, exerciseId);
  if (!exercise) return null;
  const rows = await db
    .select({ s: t.workoutSets, startedAt: t.workouts.startedAt })
    .from(t.workoutSets)
    .innerJoin(t.workouts, eq(t.workouts.id, t.workoutSets.workoutId))
    .where(and(eq(t.workouts.userId, userId), eq(t.workoutSets.exerciseId, exerciseId), eq(t.workoutSets.completed, true), isNotNull(t.workouts.finishedAt)))
    .orderBy(desc(t.workouts.startedAt), asc(t.workoutSets.setNumber));
  const byWorkout = new Map<string, ExerciseSession>();
  const byReps = new Map<number, { reps: number; weightKg: number; date: string }>();
  let bestE: ExerciseHistory["prs"]["bestE1rm"] = null;
  let bestW: ExerciseHistory["prs"]["bestWeight"] = null;
  for (const { s, startedAt } of rows) {
    const date = isoDate(startedAt);
    let sess = byWorkout.get(s.workoutId);
    if (!sess) {
      sess = { workoutId: s.workoutId, date, sets: [], topSetWeight: 0, topSetReps: 0, bestE1rm: 0, volumeKg: 0 };
      byWorkout.set(s.workoutId, sess);
    }
    sess.sets.push({ weightKg: s.weightKg, reps: s.reps, rpe: s.rpe, isWarmup: s.isWarmup });
    if (s.isWarmup || s.reps <= 0) continue;
    const est = e1rm(s.weightKg, s.reps);
    sess.volumeKg += s.weightKg * s.reps;
    sess.bestE1rm = Math.max(sess.bestE1rm, est);
    if (s.weightKg > sess.topSetWeight || (s.weightKg === sess.topSetWeight && s.reps > sess.topSetReps)) {
      sess.topSetWeight = s.weightKg;
      sess.topSetReps = s.reps;
    }
    if (!bestE || est > bestE.value) bestE = { value: est, weightKg: s.weightKg, reps: s.reps, date };
    if (!bestW || s.weightKg > bestW.weightKg || (s.weightKg === bestW.weightKg && s.reps > bestW.reps)) bestW = { weightKg: s.weightKg, reps: s.reps, date };
    if (s.reps <= 15) {
      const cur = byReps.get(s.reps);
      if (!cur || s.weightKg > cur.weightKg) byReps.set(s.reps, { reps: s.reps, weightKg: s.weightKg, date });
    }
  }
  const sessions = [...byWorkout.values()].slice(0, limit).map((x) => ({ ...x, volumeKg: Math.round(x.volumeKg) }));
  return {
    exercise,
    sessions,
    prs: { bestE1rm: bestE, bestWeight: bestW, byReps: [...byReps.values()].sort((a, b) => a.reps - b.reps) },
  };
}

export type StagnationItem = {
  exerciseId: string;
  exerciseName: string;
  weightKg: number;
  reps: number;
  /** consecutive sessions without improvement */
  sessions: number;
  lastDate: string;
  suggestion: { kind: "deload" | "rep_range" | "swap"; text: string };
  alternative: { id: string; name: string } | null;
};

/**
 * For each exercise trained in the last 60 days: if the last ≥ profile.stagnationSessions sessions were all at the
 * same top working weight without a rep increase, flag it with a concrete suggestion. A weight change resets it.
 */
export async function getStagnation(userId: string): Promise<StagnationItem[]> {
  const { stagnationSessions: threshold } = await getProfileSettings(userId);
  const since60 = new Date(Date.now() - 60 * 864e5);
  const recent = await db
    .selectDistinct({ exerciseId: t.workoutSets.exerciseId })
    .from(t.workoutSets)
    .innerJoin(t.workouts, eq(t.workouts.id, t.workoutSets.workoutId))
    .where(and(eq(t.workouts.userId, userId), gte(t.workouts.startedAt, since60), isNotNull(t.workouts.finishedAt), eq(t.workoutSets.completed, true)));
  if (!recent.length) return [];
  const rows = await db
    .select({
      workoutId: t.workouts.id,
      startedAt: t.workouts.startedAt,
      exerciseId: t.workoutSets.exerciseId,
      name: t.exercises.name,
      weightKg: t.workoutSets.weightKg,
      reps: t.workoutSets.reps,
    })
    .from(t.workoutSets)
    .innerJoin(t.workouts, eq(t.workouts.id, t.workoutSets.workoutId))
    .innerJoin(t.exercises, eq(t.exercises.id, t.workoutSets.exerciseId))
    .where(
      and(
        eq(t.workouts.userId, userId),
        isNotNull(t.workouts.finishedAt),
        inArray(t.workoutSets.exerciseId, recent.map((r) => r.exerciseId)),
        eq(t.workoutSets.completed, true),
        eq(t.workoutSets.isWarmup, false),
        sql`${t.workoutSets.reps} > 0`,
        gte(t.workouts.startedAt, new Date(Date.now() - 240 * 864e5)),
      ),
    )
    .orderBy(asc(t.workouts.startedAt));

  // exercise → ordered sessions → best set
  const byEx = new Map<string, { name: string; sessions: Map<string, { date: string; weightKg: number; reps: number }> }>();
  for (const r of rows) {
    let ex = byEx.get(r.exerciseId);
    if (!ex) byEx.set(r.exerciseId, (ex = { name: r.name, sessions: new Map() }));
    const cur = ex.sessions.get(r.workoutId);
    if (!cur) ex.sessions.set(r.workoutId, { date: isoDate(r.startedAt), weightKg: r.weightKg, reps: r.reps });
    else if (r.weightKg > cur.weightKg || (r.weightKg === cur.weightKg && r.reps > cur.reps)) Object.assign(cur, { weightKg: r.weightKg, reps: r.reps });
  }

  const out: StagnationItem[] = [];
  for (const [exerciseId, ex] of byEx) {
    const sessions = [...ex.sessions.values()];
    if (sessions.length < threshold) continue;
    // Stagnation = the trailing run of sessions at the same top working weight in which reps never
    // went up. Any weight change (increase, or a deload) ends the run, so following the deload advice
    // starts counting from zero instead of escalating.
    const last = sessions[sessions.length - 1];
    let runStart = sessions.length - 1;
    while (runStart > 0 && sessions[runStart - 1].weightKg === last.weightKg) runStart--;
    let bestR = -1;
    let stall = 0;
    for (const s of sessions.slice(runStart)) {
      if (s.reps > bestR) {
        bestR = s.reps;
        stall = 1;
      } else stall++;
    }
    const bestW = last.weightKg;
    if (stall < threshold) continue;
    let suggestion: StagnationItem["suggestion"];
    if (stall >= threshold + 2) suggestion = { kind: "swap", text: "Vyměň variantu cviku na 4–6 týdnů a pak se vrať." };
    else if (stall === threshold || bestW <= 0)
      suggestion = {
        kind: "deload",
        text: bestW > 0 ? `Deload o 10 %: ${roundTo(bestW * 0.9, 2.5).toLocaleString("cs-CZ")} kg a postupně zpět nahoru.` : "Přidej zátěž nebo zpomal tempo.",
      };
    else
      suggestion = {
        kind: "rep_range",
        text: last.reps <= 6 ? "Změň rozsah opakování na 8–12 s nižší váhou." : "Změň rozsah opakování na 4–6 s vyšší váhou.",
      };
    out.push({ exerciseId, exerciseName: ex.name, weightKg: bestW, reps: bestR, sessions: stall, lastDate: last.date, suggestion, alternative: null });
  }
  // attach the top alternative for swap suggestions
  for (const item of out) {
    const alts = await getAlternatives(userId, item.exerciseId, 1).catch(() => []);
    item.alternative = alts[0] ? { id: alts[0].id, name: alts[0].name } : null;
    if (item.suggestion.kind === "swap" && item.alternative) item.suggestion.text = `Vyměň variantu, např. za „${item.alternative.name}“, na 4–6 týdnů.`;
  }
  return out.sort((a, b) => b.sessions - a.sessions);
}

/** Per-day training counts & volume for a heatmap (last `weeks` weeks, Prague dates). */
export async function getWorkoutHeatmap(userId: string, weeks = 16) {
  const start = addDays(weekStart(), -(weeks - 1) * 7);
  const list = await listWorkoutsWhere(userId, { since: pragueDayStart(start) });
  const days: Record<string, { count: number; volumeKg: number }> = {};
  for (const w of list) {
    const d = (days[w.date] ??= { count: 0, volumeKg: 0 });
    d.count++;
    d.volumeKg += w.volumeKg;
  }
  return { start, days };
}

export async function getWeekStats(userId: string) {
  const list = await listWorkoutsWhere(userId, { since: pragueDayStart(weekStart()) });
  return {
    workouts: list.length,
    volumeKg: list.reduce((a, w) => a + w.volumeKg, 0),
    sets: list.reduce((a, w) => a + w.sets, 0),
    durationSec: list.reduce((a, w) => a + (w.durationSec ?? 0), 0),
  };
}

/* ─────────────────────────────── Body metrics ─────────────────────────────── */

export type BodyMetricDTO = { date: string; weightKg: number | null; bodyFatPct: number | null; waistCm: number | null };

/** Upsert by date; only fields that are provided (not undefined) are written. */
export async function logBodyMetric(
  userId: string,
  input: { date: string; weightKg?: number | null; bodyFatPct?: number | null; waistCm?: number | null },
): Promise<BodyMetricDTO> {
  const set: Partial<typeof t.bodyMetrics.$inferInsert> = {};
  if (input.weightKg !== undefined) set.weightKg = input.weightKg;
  if (input.bodyFatPct !== undefined) set.bodyFatPct = input.bodyFatPct;
  if (input.waistCm !== undefined) set.waistCm = input.waistCm;
  const q = db.insert(t.bodyMetrics).values({ userId, date: input.date, ...set });
  const [r] = Object.keys(set).length
    ? await q.onConflictDoUpdate({ target: [t.bodyMetrics.userId, t.bodyMetrics.date], set }).returning()
    : await q.onConflictDoNothing().returning();
  const row =
    r ??
    (
      await db
        .select()
        .from(t.bodyMetrics)
        .where(and(eq(t.bodyMetrics.userId, userId), eq(t.bodyMetrics.date, input.date)))
        .limit(1)
    )[0];
  return { date: row.date, weightKg: row.weightKg, bodyFatPct: row.bodyFatPct, waistCm: row.waistCm };
}

/** Body metrics for the last `days` days, oldest first (only rows with at least one body value). */
export async function getBodyMetrics(userId: string, days = 90): Promise<BodyMetricDTO[]> {
  const rows = await db
    .select({ date: t.bodyMetrics.date, weightKg: t.bodyMetrics.weightKg, bodyFatPct: t.bodyMetrics.bodyFatPct, waistCm: t.bodyMetrics.waistCm })
    .from(t.bodyMetrics)
    .where(
      and(
        eq(t.bodyMetrics.userId, userId),
        gte(t.bodyMetrics.date, addDays(isoDate(), -days)),
        or(isNotNull(t.bodyMetrics.weightKg), isNotNull(t.bodyMetrics.bodyFatPct), isNotNull(t.bodyMetrics.waistCm)),
      ),
    )
    .orderBy(asc(t.bodyMetrics.date));
  return rows;
}

/** Clears weight/body fat/waist for a date (keeps other columns such as sleep/steps owned by other modules). */
export async function clearBodyMetric(userId: string, date: string) {
  await db
    .update(t.bodyMetrics)
    .set({ weightKg: null, bodyFatPct: null, waistCm: null })
    .where(and(eq(t.bodyMetrics.userId, userId), eq(t.bodyMetrics.date, date)));
}

export async function getLatestWeight(userId: string): Promise<{ date: string; weightKg: number } | null> {
  const [r] = await db
    .select({ date: t.bodyMetrics.date, weightKg: t.bodyMetrics.weightKg })
    .from(t.bodyMetrics)
    .where(and(eq(t.bodyMetrics.userId, userId), isNotNull(t.bodyMetrics.weightKg)))
    .orderBy(desc(t.bodyMetrics.date))
    .limit(1);
  return r ? { date: r.date, weightKg: r.weightKg! } : null;
}

/* ─────────────────────────────── Labels (AI approval cards) ─────────────────────────────── */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Real names for ids referenced by a write tool, so an approval card shows what will actually change
 * (not the label the model supplied). Unknown / foreign ids are simply missing from the result.
 */
export async function resolveEntityNames(
  userId: string,
  ids: { programExerciseId?: string; exerciseIds?: string[]; programId?: string; dayId?: string; workoutId?: string },
) {
  const ok = (v?: string): v is string => !!v && UUID_RE.test(v);
  const out: { programExercise?: string; exercises: Record<string, string>; program?: string; day?: string; workout?: string } = { exercises: {} };
  if (ok(ids.programExerciseId)) {
    const [r] = await db
      .select({ name: t.exercises.name })
      .from(t.programExercises)
      .innerJoin(t.programDays, eq(t.programDays.id, t.programExercises.dayId))
      .innerJoin(t.programs, eq(t.programs.id, t.programDays.programId))
      .innerJoin(t.exercises, eq(t.exercises.id, t.programExercises.exerciseId))
      .where(and(eq(t.programExercises.id, ids.programExerciseId), eq(t.programs.userId, userId)))
      .limit(1);
    if (r) out.programExercise = r.name;
  }
  const exIds = (ids.exerciseIds ?? []).filter(ok);
  if (exIds.length) {
    const rows = await db
      .select({ id: t.exercises.id, name: t.exercises.name })
      .from(t.exercises)
      .where(and(inArray(t.exercises.id, exIds), visibleTo(userId)));
    for (const r of rows) out.exercises[r.id] = r.name;
  }
  if (ok(ids.programId)) {
    const [r] = await db
      .select({ name: t.programs.name })
      .from(t.programs)
      .where(and(eq(t.programs.id, ids.programId), eq(t.programs.userId, userId)))
      .limit(1);
    if (r) out.program = r.name;
  }
  if (ok(ids.dayId)) {
    const [r] = await db
      .select({ name: t.programDays.name })
      .from(t.programDays)
      .innerJoin(t.programs, eq(t.programs.id, t.programDays.programId))
      .where(and(eq(t.programDays.id, ids.dayId), eq(t.programs.userId, userId)))
      .limit(1);
    if (r) out.day = r.name;
  }
  if (ok(ids.workoutId)) {
    const [r] = await db
      .select({ name: t.workouts.name, startedAt: t.workouts.startedAt })
      .from(t.workouts)
      .where(and(eq(t.workouts.id, ids.workoutId), eq(t.workouts.userId, userId)))
      .limit(1);
    if (r) out.workout = `„${r.name}“ (${isoDate(r.startedAt)})`;
  }
  return out;
}

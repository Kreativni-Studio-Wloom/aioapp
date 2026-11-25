import { getActiveWorkout, getLatestWeight, getRecentWorkouts, getStagnation, getTodayPlan, getWeekStats } from "./service";

export type WorkoutSummary = {
  activeWorkoutId: string | null;
  today: { programName: string; dayName: string; dayId: string; exerciseCount: number } | null;
  lastWorkout: { id: string; name: string; date: string; volumeKg: number; sets: number } | null;
  weekWorkouts: number;
  weekVolumeKg: number;
  stagnating: { exerciseId: string; exerciseName: string; weightKg: number; sessions: number }[];
  latestWeightKg: number | null;
};

export async function getWorkoutSummary(userId: string): Promise<WorkoutSummary> {
  const [active, plan, recent, week, stagnation, weight] = await Promise.all([
    getActiveWorkout(userId),
    getTodayPlan(userId),
    getRecentWorkouts(userId, 1),
    getWeekStats(userId),
    getStagnation(userId),
    getLatestWeight(userId),
  ]);
  const last = recent[0];
  return {
    activeWorkoutId: active?.id ?? null,
    today: plan ? { programName: plan.programName, dayName: plan.day.name, dayId: plan.day.id, exerciseCount: plan.day.exercises.length } : null,
    lastWorkout: last ? { id: last.id, name: last.name, date: last.date, volumeKg: last.volumeKg, sets: last.sets } : null,
    weekWorkouts: week.workouts,
    weekVolumeKg: week.volumeKg,
    stagnating: stagnation.map((s) => ({ exerciseId: s.exerciseId, exerciseName: s.exerciseName, weightKg: s.weightKg, sessions: s.sessions })),
    latestWeightKg: weight?.weightKg ?? null,
  };
}

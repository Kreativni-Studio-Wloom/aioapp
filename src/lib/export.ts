import { eq, inArray } from "drizzle-orm";
import { db, t } from "@/db";

export type ExportModule = "all" | "body" | "workout" | "nutrition" | "income" | "portfolio";

/** Everything stored for a user, optionally limited to one module. */
export async function exportUserData(userId: string, module: ExportModule = "all") {
  const u = userId;
  const want = (m: ExportModule) => module === "all" || module === m;
  const out: Record<string, unknown> = { exportedAt: new Date().toISOString() };

  if (want("body")) {
    out.profile = await db.select().from(t.profiles).where(eq(t.profiles.userId, u));
    out.bodyMetrics = await db.select().from(t.bodyMetrics).where(eq(t.bodyMetrics.userId, u));
    out.goals = await db.select().from(t.goals).where(eq(t.goals.userId, u));
  }
  if (want("workout")) {
    const programs = await db.select().from(t.programs).where(eq(t.programs.userId, u));
    const programIds = programs.map((p) => p.id);
    const programDays = programIds.length ? await db.select().from(t.programDays).where(inArray(t.programDays.programId, programIds)) : [];
    const dayIds = programDays.map((d) => d.id);
    const programExercises = dayIds.length ? await db.select().from(t.programExercises).where(inArray(t.programExercises.dayId, dayIds)) : [];
    const workouts = await db.select().from(t.workouts).where(eq(t.workouts.userId, u));
    const workoutIds = workouts.map((w) => w.id);
    const workoutSets = workoutIds.length ? await db.select().from(t.workoutSets).where(inArray(t.workoutSets.workoutId, workoutIds)) : [];
    out.workout = {
      customExercises: await db.select().from(t.exercises).where(eq(t.exercises.userId, u)),
      programs,
      programDays,
      programExercises,
      workouts,
      workoutSets,
    };
  }
  if (want("nutrition")) {
    out.nutrition = {
      foods: await db.select().from(t.foods).where(eq(t.foods.userId, u)),
      foodLogs: await db.select().from(t.foodLogs).where(eq(t.foodLogs.userId, u)),
      waterLogs: await db.select().from(t.waterLogs).where(eq(t.waterLogs.userId, u)),
    };
  }
  if (want("income")) {
    out.income = {
      sources: await db.select().from(t.incomeSources).where(eq(t.incomeSources.userId, u)),
      events: await db.select().from(t.events).where(eq(t.events.userId, u)),
      transactions: await db.select().from(t.transactions).where(eq(t.transactions.userId, u)),
      recurringRules: await db.select().from(t.recurringRules).where(eq(t.recurringRules.userId, u)),
    };
  }
  if (want("portfolio")) {
    out.portfolio = {
      assets: await db.select().from(t.assets).where(eq(t.assets.userId, u)),
      transactions: await db.select().from(t.assetTransactions).where(eq(t.assetTransactions.userId, u)),
      liabilities: await db.select().from(t.liabilities).where(eq(t.liabilities.userId, u)),
      netWorthSnapshots: await db.select().from(t.netWorthSnapshots).where(eq(t.netWorthSnapshots.userId, u)),
    };
  }
  return out;
}

/**
 * Seed / update the built-in exercise library (userId = null). Idempotent: matches by name.
 * Run: npx tsx scripts/seed-exercises.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { db, t } = await import("../src/db");
  const { and, eq, isNull } = await import("drizzle-orm");
  const { BUILTIN_EXERCISES } = await import("../src/lib/workout/exercise-data");

  const existing = await db.select({ id: t.exercises.id, name: t.exercises.name }).from(t.exercises).where(isNull(t.exercises.userId));
  const byName = new Map(existing.map((x) => [x.name, x.id]));
  let inserted = 0;
  let updated = 0;
  for (const ex of BUILTIN_EXERCISES) {
    const values = {
      name: ex.name,
      primaryMuscle: ex.primaryMuscle,
      secondaryMuscles: ex.secondaryMuscles,
      pattern: ex.pattern,
      equipment: ex.equipment,
      isUnilateral: ex.isUnilateral ?? false,
    };
    const id = byName.get(ex.name);
    if (id) {
      await db.update(t.exercises).set(values).where(and(eq(t.exercises.id, id), isNull(t.exercises.userId)));
      updated++;
    } else {
      await db.insert(t.exercises).values({ ...values, userId: null });
      inserted++;
    }
  }
  console.log(`Exercises: ${inserted} inserted, ${updated} updated, ${BUILTIN_EXERCISES.length} total built-in.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

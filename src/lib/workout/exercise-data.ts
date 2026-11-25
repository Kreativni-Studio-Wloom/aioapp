import type { Equipment } from "@/db/schema";

export type SeedExercise = {
  name: string;
  primaryMuscle: string;
  secondaryMuscles: string[];
  pattern: string;
  equipment: Equipment;
  isUnilateral?: boolean;
};

const e = (
  name: string,
  primaryMuscle: string,
  pattern: string,
  equipment: Equipment,
  secondaryMuscles: string[] = [],
  isUnilateral = false,
): SeedExercise => ({ name, primaryMuscle, pattern, equipment, secondaryMuscles, isUnilateral });

/** Built-in exercise library (userId = null). Names are unique – the seed script upserts by name. */
export const BUILTIN_EXERCISES: SeedExercise[] = [
  // Chest – horizontal push
  e("Bench press", "chest", "horizontal_push", "barbell", ["triceps", "shoulders"]),
  e("Bench press s jednoručkami", "chest", "horizontal_push", "dumbbell", ["triceps", "shoulders"]),
  e("Šikmý bench press", "chest", "horizontal_push", "barbell", ["shoulders", "triceps"]),
  e("Šikmý tlak s jednoručkami", "chest", "horizontal_push", "dumbbell", ["shoulders", "triceps"]),
  e("Bench press na multipressu", "chest", "horizontal_push", "smith", ["triceps", "shoulders"]),
  e("Tlak na hrudník na stroji", "chest", "horizontal_push", "machine", ["triceps", "shoulders"]),
  e("Kliky", "chest", "horizontal_push", "bodyweight", ["triceps", "shoulders", "abs"]),
  e("Kliky na bradlech", "chest", "horizontal_push", "bodyweight", ["triceps", "shoulders"]),
  e("Úzký bench press", "triceps", "horizontal_push", "barbell", ["chest", "shoulders"]),
  // Chest – isolation
  e("Rozpažky s jednoručkami", "chest", "isolation_chest", "dumbbell", ["shoulders"]),
  e("Peck deck", "chest", "isolation_chest", "machine", ["shoulders"]),
  e("Křížení kladek", "chest", "isolation_chest", "cable", ["shoulders"]),
  // Shoulders – vertical push
  e("Tlak nad hlavu (OHP)", "shoulders", "vertical_push", "barbell", ["triceps", "abs"]),
  e("Tlak s jednoručkami vsedě", "shoulders", "vertical_push", "dumbbell", ["triceps"]),
  e("Arnoldův tlak", "shoulders", "vertical_push", "dumbbell", ["triceps"]),
  e("Tlak na ramena na stroji", "shoulders", "vertical_push", "machine", ["triceps"]),
  e("Landmine tlak", "shoulders", "vertical_push", "barbell", ["chest", "triceps"], true),
  // Shoulders – isolation
  e("Upažování s jednoručkami", "shoulders", "isolation_shoulders", "dumbbell"),
  e("Upažování na kladce", "shoulders", "isolation_shoulders", "cable", [], true),
  e("Upažování na stroji", "shoulders", "isolation_shoulders", "machine"),
  e("Předpažování s jednoručkami", "shoulders", "isolation_shoulders", "dumbbell", ["chest"]),
  e("Zapažování v předklonu", "shoulders", "isolation_shoulders", "dumbbell", ["back"]),
  e("Reverse peck deck", "shoulders", "isolation_shoulders", "machine", ["back"]),
  e("Face pull", "shoulders", "isolation_shoulders", "cable", ["back"]),
  e("Přitahování velké činky k bradě", "shoulders", "isolation_shoulders", "barbell", ["back"]),
  // Back – vertical pull
  e("Shyby", "back", "vertical_pull", "bodyweight", ["biceps", "forearms"]),
  e("Shyby podhmatem", "back", "vertical_pull", "bodyweight", ["biceps"]),
  e("Shyby s asistencí", "back", "vertical_pull", "machine", ["biceps"]),
  e("Stahování horní kladky", "back", "vertical_pull", "cable", ["biceps"]),
  e("Stahování horní kladky úzkým úchopem", "back", "vertical_pull", "cable", ["biceps"]),
  e("Stahování na stroji", "back", "vertical_pull", "machine", ["biceps"]),
  // Back – horizontal pull
  e("Přítahy velké činky v předklonu", "back", "horizontal_pull", "barbell", ["biceps", "hamstrings"]),
  e("Přítah jednoručky v předklonu", "back", "horizontal_pull", "dumbbell", ["biceps"], true),
  e("Přítahy spodní kladky vsedě", "back", "horizontal_pull", "cable", ["biceps"]),
  e("T-bar přítahy", "back", "horizontal_pull", "barbell", ["biceps"]),
  e("Přítahy na stroji", "back", "horizontal_pull", "machine", ["biceps"]),
  e("Přítahy na hrudníkové opoře", "back", "horizontal_pull", "dumbbell", ["biceps"]),
  e("Australské shyby", "back", "horizontal_pull", "bodyweight", ["biceps"]),
  e("Pendlay row", "back", "horizontal_pull", "barbell", ["biceps"]),
  // Back – isolation
  e("Pullover na kladce", "back", "isolation_back", "cable", ["chest"]),
  e("Pullover s jednoručkou", "back", "isolation_back", "dumbbell", ["chest"]),
  e("Krčení ramen", "back", "isolation_back", "dumbbell", ["forearms"]),
  e("Hyperextenze", "back", "isolation_back", "bodyweight", ["glutes", "hamstrings"]),
  // Biceps
  e("Bicepsový zdvih s velkou činkou", "biceps", "isolation_biceps", "barbell", ["forearms"]),
  e("Bicepsový zdvih s EZ činkou", "biceps", "isolation_biceps", "barbell", ["forearms"]),
  e("Bicepsový zdvih s jednoručkami", "biceps", "isolation_biceps", "dumbbell", ["forearms"]),
  e("Kladiva", "biceps", "isolation_biceps", "dumbbell", ["forearms"]),
  e("Bicepsový zdvih na kladce", "biceps", "isolation_biceps", "cable", ["forearms"]),
  e("Scottův zdvih", "biceps", "isolation_biceps", "machine"),
  e("Zdvih na šikmé lavici", "biceps", "isolation_biceps", "dumbbell"),
  // Triceps
  e("Francouzský tlak", "triceps", "isolation_triceps", "barbell"),
  e("Stahování kladky na triceps", "triceps", "isolation_triceps", "cable"),
  e("Stahování kladky lanem", "triceps", "isolation_triceps", "cable"),
  e("Tricepsové extenze nad hlavou", "triceps", "isolation_triceps", "cable"),
  e("Extenze s jednoručkou nad hlavou", "triceps", "isolation_triceps", "dumbbell"),
  e("Tricepsové kliky na lavici", "triceps", "isolation_triceps", "bodyweight", ["chest"]),
  // Quads – squat
  e("Dřep s činkou", "quads", "squat", "barbell", ["glutes", "hamstrings", "abs"]),
  e("Přední dřep", "quads", "squat", "barbell", ["glutes", "abs"]),
  e("Goblet dřep", "quads", "squat", "dumbbell", ["glutes"]),
  e("Hack dřep", "quads", "squat", "machine", ["glutes"]),
  e("Leg press", "quads", "squat", "machine", ["glutes", "hamstrings"]),
  e("Dřep na multipressu", "quads", "squat", "smith", ["glutes"]),
  e("Pendulum dřep", "quads", "squat", "machine", ["glutes"]),
  // Lunge
  e("Bulharský dřep", "quads", "lunge", "dumbbell", ["glutes"], true),
  e("Výpady s jednoručkami", "quads", "lunge", "dumbbell", ["glutes", "hamstrings"], true),
  e("Výpady s velkou činkou", "quads", "lunge", "barbell", ["glutes"], true),
  e("Výstupy na bednu", "quads", "lunge", "dumbbell", ["glutes"], true),
  // Quads – isolation
  e("Předkopávání", "quads", "isolation_quads", "machine"),
  // Hinge
  e("Mrtvý tah", "hamstrings", "hinge", "barbell", ["glutes", "back", "forearms"]),
  e("Rumunský mrtvý tah", "hamstrings", "hinge", "barbell", ["glutes", "back"]),
  e("Rumunský mrtvý tah s jednoručkami", "hamstrings", "hinge", "dumbbell", ["glutes"]),
  e("Sumo mrtvý tah", "glutes", "hinge", "barbell", ["hamstrings", "quads", "back"]),
  e("Mrtvý tah s trap bar činkou", "quads", "hinge", "barbell", ["glutes", "hamstrings", "back"]),
  e("Good morning", "hamstrings", "hinge", "barbell", ["glutes", "back"]),
  e("Hip thrust", "glutes", "hinge", "barbell", ["hamstrings"]),
  e("Hip thrust na stroji", "glutes", "hinge", "machine", ["hamstrings"]),
  e("Kettlebell swing", "glutes", "hinge", "kettlebell", ["hamstrings", "back"]),
  // Hamstrings / glutes – isolation
  e("Zakopávání vleže", "hamstrings", "isolation_hamstrings", "machine"),
  e("Zakopávání vsedě", "hamstrings", "isolation_hamstrings", "machine"),
  e("Nordic curl", "hamstrings", "isolation_hamstrings", "bodyweight"),
  e("Unožování na stroji", "glutes", "isolation_glutes", "machine"),
  e("Zanožování na kladce", "glutes", "isolation_glutes", "cable", ["hamstrings"], true),
  // Calves
  e("Výpony vestoje", "calves", "isolation_calves", "machine"),
  e("Výpony vsedě", "calves", "isolation_calves", "machine"),
  e("Výpony na leg pressu", "calves", "isolation_calves", "machine"),
  // Core
  e("Plank", "abs", "core", "bodyweight"),
  e("Zvedání nohou ve visu", "abs", "core", "bodyweight", ["forearms"]),
  e("Kladkové zkracovačky", "abs", "core", "cable"),
  e("Ab wheel", "abs", "core", "other", ["shoulders"]),
  e("Pallof press", "abs", "core", "cable"),
  e("Zkracovačky", "abs", "core", "bodyweight"),
  // Forearms / carry
  e("Farmářská chůze", "forearms", "carry", "dumbbell", ["back", "abs"]),
  e("Zápěstní zdvihy", "forearms", "isolation_forearms", "barbell"),
];

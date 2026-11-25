// Client-safe constants for the workout module (no DB imports).
import type { Equipment } from "@/db/schema";

export const MUSCLES = [
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "abs",
  "forearms",
] as const;
export type Muscle = (typeof MUSCLES)[number];

export const MUSCLE_LABELS: Record<string, string> = {
  chest: "Hrudník",
  back: "Záda",
  shoulders: "Ramena",
  biceps: "Biceps",
  triceps: "Triceps",
  quads: "Kvadricepsy",
  hamstrings: "Hamstringy",
  glutes: "Hýždě",
  calves: "Lýtka",
  abs: "Břicho",
  forearms: "Předloktí",
  traps: "Trapézy",
  lats: "Široký sval zádový",
  lower_back: "Spodní záda",
};

export const EQUIPMENT: Equipment[] = ["barbell", "dumbbell", "machine", "cable", "bodyweight", "kettlebell", "band", "smith", "other"];

export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  barbell: "Velká činka",
  dumbbell: "Jednoručky",
  machine: "Stroj",
  cable: "Kladka",
  bodyweight: "Vlastní váha",
  kettlebell: "Kettlebell",
  band: "Guma",
  smith: "Multipress",
  other: "Jiné",
};

export const PATTERNS = [
  "horizontal_push",
  "vertical_push",
  "horizontal_pull",
  "vertical_pull",
  "squat",
  "hinge",
  "lunge",
  "isolation_chest",
  "isolation_back",
  "isolation_shoulders",
  "isolation_biceps",
  "isolation_triceps",
  "isolation_quads",
  "isolation_hamstrings",
  "isolation_glutes",
  "isolation_calves",
  "isolation_forearms",
  "core",
  "carry",
] as const;

export const PATTERN_LABELS: Record<string, string> = {
  horizontal_push: "Horizontální tlak",
  vertical_push: "Vertikální tlak",
  horizontal_pull: "Horizontální tah",
  vertical_pull: "Vertikální tah",
  squat: "Dřep",
  hinge: "Hinge (předklon)",
  lunge: "Výpad",
  isolation_chest: "Izolace – hrudník",
  isolation_back: "Izolace – záda",
  isolation_shoulders: "Izolace – ramena",
  isolation_biceps: "Izolace – biceps",
  isolation_triceps: "Izolace – triceps",
  isolation_quads: "Izolace – kvadricepsy",
  isolation_hamstrings: "Izolace – hamstringy",
  isolation_glutes: "Izolace – hýždě",
  isolation_calves: "Izolace – lýtka",
  isolation_forearms: "Izolace – předloktí",
  core: "Core",
  carry: "Nošení",
};

export const WEEKDAYS_CS = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"]; // index 0 = Monday (weekday 1)
export const WEEKDAYS_LONG_CS = ["Pondělí", "Úterý", "Středa", "Čtvrtek", "Pátek", "Sobota", "Neděle"];

export const muscleLabel = (m: string) => MUSCLE_LABELS[m] ?? m;
export const equipmentLabel = (e: string) => EQUIPMENT_LABELS[e as Equipment] ?? e;
export const patternLabel = (p: string) => PATTERN_LABELS[p] ?? p;

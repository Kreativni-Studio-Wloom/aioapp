/**
 * Pure nutrition math + shared constants/types. No DB / server imports –
 * safe to use from client components (profile form live preview).
 */

export type Sex = "male" | "female";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";
export type Goal = "lose" | "maintain" | "gain";
export type MealType = "breakfast" | "lunch" | "dinner" | "snack";
export type LogSource = "food" | "ai_photo" | "ai_text" | "quick";

export const MEALS: { value: MealType; label: string }[] = [
  { value: "breakfast", label: "Snídaně" },
  { value: "lunch", label: "Oběd" },
  { value: "dinner", label: "Večeře" },
  { value: "snack", label: "Svačina" },
];
export const MEAL_LABEL: Record<MealType, string> = { breakfast: "Snídaně", lunch: "Oběd", dinner: "Večeře", snack: "Svačina" };

export const ACTIVITY: { value: ActivityLevel; label: string; factor: number; hint: string }[] = [
  { value: "sedentary", label: "Sedavý", factor: 1.2, hint: "kancelář, minimum pohybu" },
  { value: "light", label: "Lehce aktivní", factor: 1.375, hint: "1–3× týdně trénink" },
  { value: "moderate", label: "Středně aktivní", factor: 1.55, hint: "3–5× týdně trénink" },
  { value: "active", label: "Velmi aktivní", factor: 1.725, hint: "6–7× týdně trénink" },
  { value: "very_active", label: "Extrémně aktivní", factor: 1.9, hint: "fyzická práce + trénink" },
];
export const ACTIVITY_FACTOR: Record<ActivityLevel, number> = Object.fromEntries(ACTIVITY.map((a) => [a.value, a.factor])) as Record<
  ActivityLevel,
  number
>;

export const GOALS: { value: Goal; label: string }[] = [
  { value: "lose", label: "Hubnout" },
  { value: "maintain", label: "Udržovat" },
  { value: "gain", label: "Nabírat" },
];

export const KCAL_PER_KG = 7700;
export const MAX_DEFICIT = 1000;
export const MAX_SURPLUS = 750;
export const MIN_KCAL: Record<Sex, number> = { male: 1500, female: 1200 };
/** Fallback targets when the profile is incomplete. */
export const DEFAULT_KCAL = 2000;

/** Suggest meal by local hour. */
export function mealForHour(h: number): MealType {
  if (h < 10) return "breakfast";
  if (h >= 11 && h < 14) return "lunch";
  if (h >= 17 && h < 22) return "dinner";
  return "snack";
}

export function ageFromBirthDate(birthDate: string | null | undefined, today = new Date()): number | null {
  if (!birthDate) return null;
  const b = new Date(birthDate + "T12:00:00Z");
  if (Number.isNaN(b.getTime())) return null;
  let age = today.getUTCFullYear() - b.getUTCFullYear();
  const m = today.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && today.getUTCDate() < b.getUTCDate())) age--;
  return age;
}

/** Mifflin-St Jeor. */
export function bmrMifflin(sex: Sex, weightKg: number, heightCm: number, age: number) {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === "male" ? 5 : -161);
}

export type ProfileInput = {
  sex: Sex | null;
  birthDate: string | null;
  heightCm: number | null;
  activityLevel: ActivityLevel | null;
  goal: Goal | null;
  rateKgPerWeek: number | null;
  proteinPerKg: number | null;
  fatPct: number | null; // 0–1
  kcalOverride: number | null;
};

export type TargetsDetail = {
  profileComplete: boolean;
  weightKg: number | null;
  age: number | null;
  bmr: number;
  activityFactor: number;
  tdee: number;
  /** goal delta per day (negative = deficit) after clamping */
  delta: number;
  /** raw delta before clamping */
  rawDelta: number;
  clamped: boolean;
  formulaKcal: number;
  kcal: number;
  overridden: boolean;
  protein: number;
  fat: number;
  carbs: number;
  proteinPerKg: number;
  fatPct: number;
};

/** Daily goal delta (kcal) for a goal + rate, before clamping. */
export function goalDelta(goal: Goal | null, rateKgPerWeek: number | null) {
  const rate = Math.abs(rateKgPerWeek ?? 0);
  if (goal === "lose") return -(rate * KCAL_PER_KG) / 7;
  if (goal === "gain") return (rate * KCAL_PER_KG) / 7;
  return 0;
}

/** Apply a goal delta to a TDEE with sensible clamps. */
export function applyGoal(tdee: number, rawDelta: number, sex: Sex | null) {
  let delta = Math.max(-MAX_DEFICIT, Math.min(MAX_SURPLUS, rawDelta));
  const floor = MIN_KCAL[sex ?? "female"];
  if (tdee + delta < floor && delta < 0) delta = Math.min(0, floor - tdee);
  return { delta: Math.round(delta), kcal: Math.round(tdee + delta), clamped: Math.round(delta) !== Math.round(rawDelta) };
}

export function computeTargets(p: ProfileInput, weightKg: number | null, today = new Date()): TargetsDetail {
  const age = ageFromBirthDate(p.birthDate, today);
  const profileComplete = !!(p.sex && age != null && age > 0 && p.heightCm && weightKg);
  const activityFactor = ACTIVITY_FACTOR[p.activityLevel ?? "moderate"] ?? 1.55;
  const proteinPerKg = p.proteinPerKg ?? 2;
  const fatPct = p.fatPct ?? 0.25;

  let bmr = 0;
  let tdee = 0;
  let delta = 0;
  let rawDelta = 0;
  let clamped = false;
  let formulaKcal = DEFAULT_KCAL;
  if (profileComplete) {
    bmr = Math.round(bmrMifflin(p.sex!, weightKg!, p.heightCm!, age!));
    tdee = Math.round(bmr * activityFactor);
    rawDelta = Math.round(goalDelta(p.goal, p.rateKgPerWeek));
    const g = applyGoal(tdee, rawDelta, p.sex);
    delta = g.delta;
    clamped = g.clamped;
    formulaKcal = g.kcal;
  }
  const overridden = p.kcalOverride != null && p.kcalOverride > 0;
  const kcal = overridden ? p.kcalOverride! : formulaKcal;
  const macros = macrosFor(kcal, weightKg, proteinPerKg, fatPct);
  return {
    profileComplete,
    weightKg,
    age,
    bmr,
    activityFactor,
    tdee,
    delta,
    rawDelta,
    clamped,
    formulaKcal,
    kcal,
    overridden,
    ...macros,
    proteinPerKg,
    fatPct,
  };
}

export function macrosFor(kcal: number, weightKg: number | null, proteinPerKg: number, fatPct: number) {
  // without a weight, fall back to 30 % of kcal from protein
  const protein = Math.round(weightKg ? proteinPerKg * weightKg : (kcal * 0.3) / 4);
  const fat = Math.round((kcal * fatPct) / 9);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { protein, fat, carbs };
}

/** Least-squares slope of y over x. */
export function linearSlope(points: { x: number; y: number }[]): number | null {
  const n = points.length;
  if (n < 2) return null;
  const mx = points.reduce((s, p) => s + p.x, 0) / n;
  const my = points.reduce((s, p) => s + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) ** 2;
  }
  return den === 0 ? null : num / den;
}

/** Scale per-100 g values to a portion. */
export function scalePer100<T extends { kcal: number; protein: number; carbs: number; fat: number; fiber?: number | null }>(food: T, grams: number) {
  const f = grams / 100;
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return {
    kcal: Math.round(food.kcal * f),
    protein: r1(food.protein * f),
    carbs: r1(food.carbs * f),
    fat: r1(food.fat * f),
    fiber: food.fiber == null ? null : r1(food.fiber * f),
  };
}

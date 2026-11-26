import { and, asc, desc, eq, gte, ilike, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { db, t } from "@/db";
import { addDays, isoDate } from "@/lib/format";
import {
  applyGoal,
  computeTargets,
  goalDelta,
  linearSlope,
  scalePer100,
  trainingDayBonus,
  KCAL_PER_KG,
  type ActivityLevel,
  type Goal,
  type LogSource,
  type MealType,
  type ProfileInput,
  type Sex,
  type TargetsDetail,
} from "./calc";
import { offProduct, offSearch, type OffProduct } from "./off";

export { estimateFromText, estimateFromImage, type AiFoodItem } from "./estimate";
export type { MealType, LogSource } from "./calc";

/* ───────────────────────────── Types ───────────────────────────── */

export type Targets = {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  bmr: number;
  tdee: number;
  adaptiveTdee: number | null;
  profileComplete: boolean;
  weightKg: number | null;
};

export type AdaptiveInfo = {
  tdee: number | null;
  foodDays: number;
  weightDays: number;
  avgIntake: number | null;
  /** kg per week (negative = losing) */
  trendKgPerWeek: number | null;
  requiredDays: number;
};

export type NutritionProfile = ProfileInput & { updatedAt: string | null };

export type FoodLogEntry = {
  id: string;
  date: string;
  mealType: MealType;
  foodId: string | null;
  name: string;
  grams: number | null;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number | null;
  source: LogSource;
  createdAt: string;
};

export type Totals = { kcal: number; protein: number; carbs: number; fat: number; fiber: number };

export type Day = {
  date: string;
  entries: FoodLogEntry[];
  totals: Totals;
  waterMl: number;
  targets: Targets;
  /** a workout was started on this date */
  trainingDay: boolean;
  /** training-day bump already included in `targets` (null on rest days) */
  trainingBonus: { kcal: number; carbs: number } | null;
};

export type Food = {
  id: string;
  userId: string | null;
  name: string;
  brand: string | null;
  ean: string | null;
  source: "off" | "custom" | "ai";
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number | null;
  sugar: number | null;
  salt: number | null;
  servingG: number | null;
  isFavorite: boolean;
};

/** Search result; `id` is null for Open Food Facts hits not yet cached. Values per 100 g. */
export type FoodHit = {
  id: string | null;
  ean: string | null;
  name: string;
  brand: string | null;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number | null;
  servingG: number | null;
  isFavorite: boolean;
  origin: "mine" | "cache" | "off";
  lastUsedAt?: string | null;
};

export type DayTotals = Totals & { date: string; waterMl: number; weightKg: number | null; entries: number };

/* ───────────────────────────── Helpers ───────────────────────────── */

const r1 = (n: number) => Math.round(n * 10) / 10;

function emptyTotals(): Totals {
  return { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
}

function sumTotals(rows: { kcal: number; protein: number; carbs: number; fat: number; fiber: number | null }[]): Totals {
  const tt = emptyTotals();
  for (const r of rows) {
    tt.kcal += r.kcal;
    tt.protein += r.protein;
    tt.carbs += r.carbs;
    tt.fat += r.fat;
    tt.fiber += r.fiber ?? 0;
  }
  return { kcal: Math.round(tt.kcal), protein: r1(tt.protein), carbs: r1(tt.carbs), fat: r1(tt.fat), fiber: r1(tt.fiber) };
}

function toFood(r: typeof t.foods.$inferSelect): Food {
  return {
    id: r.id,
    userId: r.userId,
    name: r.name,
    brand: r.brand,
    ean: r.ean,
    source: r.source,
    kcal: r.kcal,
    protein: r.protein,
    carbs: r.carbs,
    fat: r.fat,
    fiber: r.fiber,
    sugar: r.sugar,
    salt: r.salt,
    servingG: r.servingG,
    isFavorite: r.isFavorite,
  };
}

function toEntry(r: typeof t.foodLogs.$inferSelect): FoodLogEntry {
  return {
    id: r.id,
    date: r.date,
    mealType: r.mealType,
    foodId: r.foodId,
    name: r.name,
    grams: r.grams,
    kcal: r.kcal,
    protein: r.protein,
    carbs: r.carbs,
    fat: r.fat,
    fiber: r.fiber,
    source: r.source,
    createdAt: r.createdAt.toISOString(),
  };
}

/** Foods visible to a user: own + shared cache. */
const visibleFood = (userId: string) => or(eq(t.foods.userId, userId), isNull(t.foods.userId));

/* ───────────────────────────── Profile & targets ───────────────────────────── */

export async function getProfile(userId: string): Promise<NutritionProfile> {
  const [p] = await db.select().from(t.profiles).where(eq(t.profiles.userId, userId)).limit(1);
  return {
    sex: p?.sex ?? null,
    birthDate: p?.birthDate ?? null,
    heightCm: p?.heightCm ?? null,
    activityLevel: p?.activityLevel ?? "moderate",
    goal: p?.goal ?? "maintain",
    rateKgPerWeek: p?.rateKgPerWeek ?? 0.5,
    proteinPerKg: p?.proteinPerKg ?? 2,
    fatPct: p?.fatPct ?? 0.25,
    kcalOverride: p?.kcalOverride ?? null,
    updatedAt: p?.updatedAt?.toISOString() ?? null,
  };
}

export type ProfileUpdate = {
  sex?: Sex | null;
  birthDate?: string | null;
  heightCm?: number | null;
  activityLevel?: ActivityLevel;
  goal?: Goal;
  rateKgPerWeek?: number;
  proteinPerKg?: number;
  fatPct?: number;
  kcalOverride?: number | null;
};

/** Upsert only the nutrition-related profile fields. */
export async function updateProfile(userId: string, data: ProfileUpdate) {
  const values = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) as ProfileUpdate;
  await db
    .insert(t.profiles)
    .values({ userId, ...values, updatedAt: new Date() })
    .onConflictDoUpdate({ target: t.profiles.userId, set: { ...values, updatedAt: new Date() } });
}

export async function setKcalOverride(userId: string, kcal: number | null) {
  await updateProfile(userId, { kcalOverride: kcal == null ? null : Math.round(kcal) });
}

/** Latest known body weight. */
export async function getLatestWeight(userId: string): Promise<{ weightKg: number; date: string } | null> {
  const [r] = await db
    .select({ weightKg: t.bodyMetrics.weightKg, date: t.bodyMetrics.date })
    .from(t.bodyMetrics)
    .where(and(eq(t.bodyMetrics.userId, userId), isNotNull(t.bodyMetrics.weightKg)))
    .orderBy(desc(t.bodyMetrics.date))
    .limit(1);
  return r?.weightKg != null ? { weightKg: r.weightKg, date: r.date } : null;
}

/** Upsert body weight for a date (default today). */
export async function setWeight(userId: string, weightKg: number, date: string = isoDate()) {
  await db
    .insert(t.bodyMetrics)
    .values({ userId, date, weightKg })
    .onConflictDoUpdate({ target: [t.bodyMetrics.userId, t.bodyMetrics.date], set: { weightKg } });
}

const ADAPTIVE_WINDOW = 28;
const ADAPTIVE_MIN_DAYS = 14;
/** A day counts as "fully logged" with entries in at least this many distinct meals… */
const ADAPTIVE_MIN_MEALS = 2;
/** …or with at least this share of the daily kcal target. */
const ADAPTIVE_MIN_TARGET_SHARE = 0.5;

/**
 * Adaptive TDEE from the last 28 days (excluding today):
 * avg intake − weight trend (kg/day) × 7700.
 *
 * Heuristic against partially logged days (which would drag the average intake down and
 * underestimate TDEE): only days that look fully logged are used – entries in ≥ 2 distinct
 * meals OR total ≥ 50 % of the kcal target. Needs ≥ 14 such days and ≥ 14 weigh-ins.
 * `foodDays` reports the number of these complete days.
 */
export async function getAdaptiveTdee(userId: string, today: string = isoDate(), targetKcal?: number): Promise<AdaptiveInfo> {
  const to = addDays(today, -1);
  const from = addDays(today, -ADAPTIVE_WINDOW);
  const [intake, weights, target] = await Promise.all([
    db
      .select({
        date: t.foodLogs.date,
        kcal: sql<number>`sum(${t.foodLogs.kcal})`.mapWith(Number),
        meals: sql<number>`count(distinct ${t.foodLogs.mealType})`.mapWith(Number),
      })
      .from(t.foodLogs)
      .where(and(eq(t.foodLogs.userId, userId), gte(t.foodLogs.date, from), lte(t.foodLogs.date, to)))
      .groupBy(t.foodLogs.date),
    db
      .select({ date: t.bodyMetrics.date, w: t.bodyMetrics.weightKg })
      .from(t.bodyMetrics)
      .where(and(eq(t.bodyMetrics.userId, userId), isNotNull(t.bodyMetrics.weightKg), gte(t.bodyMetrics.date, from), lte(t.bodyMetrics.date, to))),
    targetKcal != null
      ? Promise.resolve(targetKcal)
      : Promise.all([getProfile(userId), getLatestWeight(userId)]).then(([p, w]) => computeTargets(p, w?.weightKg ?? null).kcal),
  ]);
  const minKcal = target * ADAPTIVE_MIN_TARGET_SHARE;
  const days = intake.filter((d) => d.kcal > 0 && (d.meals >= ADAPTIVE_MIN_MEALS || d.kcal >= minKcal));
  const base: AdaptiveInfo = {
    tdee: null,
    foodDays: days.length,
    weightDays: weights.length,
    avgIntake: days.length ? Math.round(days.reduce((s, d) => s + d.kcal, 0) / days.length) : null,
    trendKgPerWeek: null,
    requiredDays: ADAPTIVE_MIN_DAYS,
  };
  const t0 = new Date(from + "T12:00:00Z").getTime();
  const slope = linearSlope(weights.map((w) => ({ x: (new Date(w.date + "T12:00:00Z").getTime() - t0) / 864e5, y: w.w! })));
  if (slope != null) base.trendKgPerWeek = Math.round(slope * 7 * 100) / 100;
  if (days.length < ADAPTIVE_MIN_DAYS || weights.length < ADAPTIVE_MIN_DAYS || slope == null || base.avgIntake == null) return base;
  const est = Math.round(base.avgIntake - slope * KCAL_PER_KG);
  base.tdee = est >= 1000 && est <= 6000 ? est : null;
  return base;
}

/** Full breakdown for the profile page. */
export async function getTargetsDetail(userId: string): Promise<{
  profile: NutritionProfile;
  detail: TargetsDetail;
  latestWeight: { weightKg: number; date: string } | null;
  adaptive: AdaptiveInfo;
  /** kcal target if the adaptive TDEE were adopted (with the same goal delta) */
  adaptiveKcal: number | null;
}> {
  const [profile, latestWeight] = await Promise.all([getProfile(userId), getLatestWeight(userId)]);
  const detail = computeTargets(profile, latestWeight?.weightKg ?? null);
  const adaptive = await getAdaptiveTdee(userId, isoDate(), detail.kcal);
  const adaptiveKcal = adaptive.tdee != null ? applyGoal(adaptive.tdee, goalDelta(profile.goal, profile.rateKgPerWeek), profile.sex).kcal : null;
  return { profile, detail, latestWeight, adaptive, adaptiveKcal };
}

export async function getTargets(userId: string): Promise<Targets> {
  const { detail, adaptive } = await getTargetsDetail(userId);
  return {
    kcal: detail.kcal,
    protein: detail.protein,
    carbs: detail.carbs,
    fat: detail.fat,
    bmr: detail.bmr,
    tdee: detail.tdee,
    adaptiveTdee: adaptive.tdee,
    profileComplete: detail.profileComplete,
    weightKg: detail.weightKg,
  };
}

/** Adopt the adaptive TDEE: sets kcalOverride to adaptive TDEE ± goal delta. Returns the new target or null. */
export async function adoptAdaptiveTdee(userId: string): Promise<number | null> {
  const { adaptiveKcal } = await getTargetsDetail(userId);
  if (adaptiveKcal == null) return null;
  await setKcalOverride(userId, adaptiveKcal);
  return adaptiveKcal;
}

/* ───────────────────────────── Daily log ───────────────────────────── */

export async function isTrainingDay(userId: string, date: string): Promise<boolean> {
  const [r] = await db
    .select({ id: t.workouts.id })
    .from(t.workouts)
    .where(and(eq(t.workouts.userId, userId), sql`(${t.workouts.startedAt} at time zone 'Europe/Prague')::date = ${date}::date`))
    .limit(1);
  return !!r;
}

export async function getWaterMl(userId: string, date: string): Promise<number> {
  const [r] = await db
    .select({ ml: sql<number>`coalesce(sum(${t.waterLogs.ml}), 0)`.mapWith(Number) })
    .from(t.waterLogs)
    .where(and(eq(t.waterLogs.userId, userId), eq(t.waterLogs.date, date)));
  return Math.max(0, r?.ml ?? 0);
}

export async function getDay(userId: string, date: string): Promise<Day> {
  const [rows, waterMl, targets, trainingDay] = await Promise.all([
    db
      .select()
      .from(t.foodLogs)
      .where(and(eq(t.foodLogs.userId, userId), eq(t.foodLogs.date, date)))
      .orderBy(asc(t.foodLogs.createdAt)),
    getWaterMl(userId, date),
    getTargets(userId),
    isTrainingDay(userId, date),
  ]);
  const entries = rows.map(toEntry);
  const trainingBonus = trainingDay ? trainingDayBonus(targets.carbs) : null;
  const dayTargets = trainingBonus ? { ...targets, kcal: targets.kcal + trainingBonus.kcal, carbs: targets.carbs + trainingBonus.carbs } : targets;
  return { date, entries, totals: sumTotals(entries), waterMl, targets: dayTargets, trainingDay, trainingBonus };
}

export async function countEntries(userId: string, date: string): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(t.foodLogs)
    .where(and(eq(t.foodLogs.userId, userId), eq(t.foodLogs.date, date)));
  return r?.n ?? 0;
}

export type LogFoodInput = {
  date: string;
  mealType: MealType;
  foodId?: string | null;
  name: string;
  grams?: number | null;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number | null;
  source: LogSource;
};

export async function logFood(userId: string, input: LogFoodInput): Promise<FoodLogEntry> {
  let foodId = input.foodId ?? null;
  if (foodId) {
    const [f] = await db.select({ id: t.foods.id }).from(t.foods).where(and(eq(t.foods.id, foodId), visibleFood(userId))).limit(1);
    if (!f) foodId = null;
  }
  const [row] = await db
    .insert(t.foodLogs)
    .values({
      userId,
      date: input.date,
      mealType: input.mealType,
      foodId,
      name: input.name.trim().slice(0, 200) || "Záznam",
      grams: input.grams ?? null,
      kcal: Math.max(0, Math.round(input.kcal)),
      protein: Math.max(0, r1(input.protein)),
      carbs: Math.max(0, r1(input.carbs)),
      fat: Math.max(0, r1(input.fat)),
      fiber: input.fiber == null ? null : Math.max(0, r1(input.fiber)),
      source: input.source,
    })
    .returning();
  return toEntry(row);
}

export async function logMany(userId: string, inputs: LogFoodInput[]): Promise<FoodLogEntry[]> {
  const out: FoodLogEntry[] = [];
  for (const i of inputs) out.push(await logFood(userId, i));
  return out;
}

export async function getFood(userId: string, foodId: string): Promise<Food | null> {
  const [f] = await db.select().from(t.foods).where(and(eq(t.foods.id, foodId), visibleFood(userId))).limit(1);
  return f ? toFood(f) : null;
}

export async function logFoodByGrams(
  userId: string,
  input: { date: string; mealType: MealType; foodId: string; grams: number },
): Promise<FoodLogEntry> {
  const food = await getFood(userId, input.foodId);
  if (!food) throw new Error("Potravina nenalezena");
  const v = scalePer100(food, input.grams);
  return logFood(userId, {
    date: input.date,
    mealType: input.mealType,
    foodId: food.id,
    name: food.brand ? `${food.name} (${food.brand})` : food.name,
    grams: input.grams,
    ...v,
    source: "food",
  });
}

/** Change grams (rescales values from the food or proportionally) and/or meal of an entry. */
export async function updateFoodLog(userId: string, id: string, data: { grams?: number | null; mealType?: MealType }) {
  const [row] = await db.select().from(t.foodLogs).where(and(eq(t.foodLogs.id, id), eq(t.foodLogs.userId, userId))).limit(1);
  if (!row) throw new Error("Záznam nenalezen");
  const set: Partial<typeof t.foodLogs.$inferInsert> = {};
  if (data.mealType) set.mealType = data.mealType;
  if (data.grams != null && data.grams > 0 && data.grams !== row.grams) {
    const food = row.foodId ? await getFood(userId, row.foodId) : null;
    if (food) {
      Object.assign(set, scalePer100(food, data.grams));
    } else if (row.grams && row.grams > 0) {
      const f = data.grams / row.grams;
      set.kcal = Math.round(row.kcal * f);
      set.protein = r1(row.protein * f);
      set.carbs = r1(row.carbs * f);
      set.fat = r1(row.fat * f);
      set.fiber = row.fiber == null ? null : r1(row.fiber * f);
    }
    set.grams = data.grams;
  }
  if (Object.keys(set).length === 0) return toEntry(row);
  const [upd] = await db.update(t.foodLogs).set(set).where(and(eq(t.foodLogs.id, id), eq(t.foodLogs.userId, userId))).returning();
  return toEntry(upd);
}

export async function deleteFoodLog(userId: string, id: string): Promise<boolean> {
  const res = await db.delete(t.foodLogs).where(and(eq(t.foodLogs.id, id), eq(t.foodLogs.userId, userId))).returning({ id: t.foodLogs.id });
  return res.length > 0;
}

/** Copy all entries from one day into another (e.g. "copy yesterday"). Returns the number copied. */
export async function copyDay(userId: string, fromDate: string, toDate: string): Promise<number> {
  const rows = await db
    .select()
    .from(t.foodLogs)
    .where(and(eq(t.foodLogs.userId, userId), eq(t.foodLogs.date, fromDate)))
    .orderBy(asc(t.foodLogs.createdAt));
  if (rows.length === 0) return 0;
  await db.insert(t.foodLogs).values(
    rows.map((r) => ({
      userId,
      date: toDate,
      mealType: r.mealType,
      foodId: r.foodId,
      name: r.name,
      grams: r.grams,
      kcal: r.kcal,
      protein: r.protein,
      carbs: r.carbs,
      fat: r.fat,
      fiber: r.fiber,
      source: r.source,
    })),
  );
  return rows.length;
}

/** Add (or with negative ml, remove) water. Total never drops below 0. Returns the new total. */
export async function addWater(userId: string, date: string, ml: number): Promise<number> {
  const amount = Math.round(ml);
  if (amount === 0) return getWaterMl(userId, date);
  if (amount < 0) {
    const cur = await getWaterMl(userId, date);
    const take = Math.min(cur, -amount);
    if (take > 0) await db.insert(t.waterLogs).values({ userId, date, ml: -take });
    return cur - take;
  }
  await db.insert(t.waterLogs).values({ userId, date, ml: amount });
  return getWaterMl(userId, date);
}

/* ───────────────────────────── Foods ───────────────────────────── */

function foodToHit(f: Food, lastUsedAt: string | null = null): FoodHit {
  return {
    id: f.id,
    ean: f.ean,
    name: f.name,
    brand: f.brand,
    kcal: f.kcal,
    protein: f.protein,
    carbs: f.carbs,
    fat: f.fat,
    fiber: f.fiber,
    servingG: f.servingG,
    isFavorite: f.isFavorite,
    origin: f.userId ? "mine" : "cache",
    lastUsedAt,
  };
}

function offToHit(p: OffProduct): FoodHit {
  return {
    id: null,
    ean: p.ean,
    name: p.name,
    brand: p.brand,
    kcal: p.kcal,
    protein: p.protein,
    carbs: p.carbs,
    fat: p.fat,
    fiber: p.fiber,
    servingG: p.servingG,
    isFavorite: false,
    origin: "off",
  };
}

/** Last-use timestamp per food for a user. */
async function lastUsedMap(userId: string, foodIds: string[]) {
  if (foodIds.length === 0) return new Map<string, string>();
  const rows = await db
    .select({ foodId: t.foodLogs.foodId, last: sql<Date>`max(${t.foodLogs.createdAt})`.mapWith((v) => new Date(v)) })
    .from(t.foodLogs)
    .where(and(eq(t.foodLogs.userId, userId), inArray(t.foodLogs.foodId, foodIds)))
    .groupBy(t.foodLogs.foodId);
  return new Map(rows.filter((r) => r.foodId).map((r) => [r.foodId!, r.last.toISOString()]));
}

/** De-duplicate by EAN preferring own rows; sort favourites → recently used → name. */
function rankHits(hits: FoodHit[]): FoodHit[] {
  const byKey = new Map<string, FoodHit>();
  for (const h of hits) {
    const key = h.ean ? `ean:${h.ean}` : `id:${h.id}`;
    const prev = byKey.get(key);
    if (!prev || (prev.origin !== "mine" && h.origin === "mine")) byKey.set(key, { ...h, lastUsedAt: h.lastUsedAt ?? prev?.lastUsedAt ?? null });
  }
  return [...byKey.values()].sort((a, b) => {
    if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
    const la = a.lastUsedAt ?? "";
    const lb = b.lastUsedAt ?? "";
    if (la !== lb) return la < lb ? 1 : -1;
    if (a.origin !== b.origin) return a.origin === "mine" ? -1 : 1;
    return a.name.localeCompare(b.name, "cs");
  });
}

/** Favourites + recently used foods (for an empty search box). */
export async function recentFoods(userId: string, limit = 20): Promise<FoodHit[]> {
  const recent = await db
    .select({ foodId: t.foodLogs.foodId, last: sql<Date>`max(${t.foodLogs.createdAt})`.mapWith((v) => new Date(v)) })
    .from(t.foodLogs)
    .where(and(eq(t.foodLogs.userId, userId), isNotNull(t.foodLogs.foodId)))
    .groupBy(t.foodLogs.foodId)
    .orderBy(desc(sql`max(${t.foodLogs.createdAt})`))
    .limit(limit);
  const ids = recent.map((r) => r.foodId!).filter(Boolean);
  const [foods, favs] = await Promise.all([
    ids.length ? db.select().from(t.foods).where(and(inArray(t.foods.id, ids), visibleFood(userId))) : Promise.resolve([]),
    db
      .select()
      .from(t.foods)
      .where(and(eq(t.foods.userId, userId), eq(t.foods.isFavorite, true)))
      .limit(limit),
  ]);
  const last = new Map(recent.map((r) => [r.foodId!, r.last.toISOString()]));
  const hits = [...favs, ...foods].map((f) => foodToHit(toFood(f), last.get(f.id) ?? null));
  return rankHits(hits).slice(0, limit);
}

/** Search own + cached foods by name / brand / EAN. */
export async function searchLocalFoods(userId: string, q: string, limit = 30): Promise<FoodHit[]> {
  const query = q.trim();
  if (!query) return recentFoods(userId, limit);
  const words = query.split(/\s+/).filter(Boolean).slice(0, 5);
  const conds = words.map((w) => {
    const like = `%${w.replace(/[%_\\]/g, (m) => "\\" + m)}%`;
    return or(ilike(t.foods.name, like), ilike(t.foods.brand, like));
  });
  const where = /^\d{8,14}$/.test(query) ? eq(t.foods.ean, query) : and(...conds);
  const rows = await db
    .select()
    .from(t.foods)
    .where(and(visibleFood(userId), where))
    .orderBy(desc(t.foods.isFavorite), asc(t.foods.name))
    .limit(limit);
  const last = await lastUsedMap(
    userId,
    rows.map((r) => r.id),
  );
  return rankHits(rows.map((r) => foodToHit(toFood(r), last.get(r.id) ?? null)));
}

/** Open Food Facts search, minus products already known locally. */
export async function searchOffFoods(userId: string, q: string, limit = 20): Promise<FoodHit[]> {
  const products = await offSearch(q, limit);
  if (products.length === 0) return [];
  const eans = products.map((p) => p.ean);
  const known = await db.select({ ean: t.foods.ean }).from(t.foods).where(and(visibleFood(userId), inArray(t.foods.ean, eans)));
  const knownSet = new Set(known.map((k) => k.ean));
  return products.filter((p) => !knownSet.has(p.ean)).map(offToHit);
}

/** Local + Open Food Facts results merged (local first). */
export async function searchFoods(userId: string, q: string): Promise<FoodHit[]> {
  const [local, off] = await Promise.all([searchLocalFoods(userId, q), q.trim().length >= 2 ? searchOffFoods(userId, q) : Promise.resolve([])]);
  return [...local, ...off];
}

/** Insert or refresh an Open Food Facts product in the shared cache. Returns the food. */
export async function cacheOffProduct(p: OffProduct): Promise<Food> {
  const [existing] = await db
    .select()
    .from(t.foods)
    .where(and(isNull(t.foods.userId), eq(t.foods.ean, p.ean)))
    .limit(1);
  const values = {
    name: p.name,
    brand: p.brand,
    ean: p.ean,
    source: "off" as const,
    kcal: p.kcal,
    protein: p.protein,
    carbs: p.carbs,
    fat: p.fat,
    fiber: p.fiber,
    sugar: p.sugar,
    salt: p.salt,
    servingG: p.servingG,
  };
  if (existing) {
    const [u] = await db.update(t.foods).set(values).where(eq(t.foods.id, existing.id)).returning();
    return toFood(u);
  }
  const [row] = await db
    .insert(t.foods)
    .values({ userId: null, ...values })
    .returning();
  return toFood(row);
}

/**
 * Resolve a search hit to a stored food.
 *
 * The hit comes from the client, so its values are untrusted: the shared cache (userId null)
 * is only ever written with data re-fetched server-side from Open Food Facts by EAN. If that
 * fails (offline / unknown product), the client-supplied values are stored as a user-owned food.
 */
export async function ensureFoodFromHit(userId: string, hit: FoodHit): Promise<Food> {
  if (hit.id) {
    const f = await getFood(userId, hit.id);
    if (f) return f;
  }
  const ean = hit.ean?.replace(/\D/g, "") || null;
  if (ean) {
    const local = await findByEan(userId, ean);
    if (local) return local;
    const p = await offProduct(ean);
    if (p) return cacheOffProduct(p);
  }
  if (!hit.name.trim()) throw new Error("Potravina nenalezena");
  return createFood(userId, {
    name: hit.name,
    brand: hit.brand,
    ean,
    kcal: hit.kcal,
    protein: hit.protein,
    carbs: hit.carbs,
    fat: hit.fat,
    fiber: hit.fiber,
    servingG: hit.servingG,
  });
}

async function findByEan(userId: string, ean: string): Promise<Food | null> {
  const rows = await db
    .select()
    .from(t.foods)
    .where(and(eq(t.foods.ean, ean), visibleFood(userId)))
    .orderBy(sql`${t.foods.userId} is null`) // own first
    .limit(1);
  return rows[0] ? toFood(rows[0]) : null;
}

/** Barcode lookup: local foods first, then Open Food Facts (cached). Null when unknown. */
export async function lookupEan(userId: string, ean: string): Promise<Food | null> {
  const code = ean.replace(/\D/g, "");
  if (code.length < 6) return null;
  const local = await findByEan(userId, code);
  if (local) return local;
  const p = await offProduct(code);
  return p ? cacheOffProduct(p) : null;
}

export async function listMyFoods(userId: string, opts: { favoritesOnly?: boolean } = {}): Promise<(Food & { lastUsedAt: string | null; uses: number })[]> {
  const rows = await db
    .select()
    .from(t.foods)
    .where(and(eq(t.foods.userId, userId), opts.favoritesOnly ? eq(t.foods.isFavorite, true) : undefined))
    .orderBy(desc(t.foods.isFavorite), asc(t.foods.name));
  if (rows.length === 0) return [];
  const stats = await db
    .select({
      foodId: t.foodLogs.foodId,
      uses: sql<number>`count(*)`.mapWith(Number),
      last: sql<Date>`max(${t.foodLogs.createdAt})`.mapWith((v) => new Date(v)),
    })
    .from(t.foodLogs)
    .where(and(eq(t.foodLogs.userId, userId), inArray(t.foodLogs.foodId, rows.map((r) => r.id))))
    .groupBy(t.foodLogs.foodId);
  const m = new Map(stats.map((s) => [s.foodId!, s]));
  return rows.map((r) => ({ ...toFood(r), lastUsedAt: m.get(r.id)?.last.toISOString() ?? null, uses: m.get(r.id)?.uses ?? 0 }));
}

export type FoodInput = {
  name: string;
  brand?: string | null;
  ean?: string | null;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number | null;
  sugar?: number | null;
  salt?: number | null;
  servingG?: number | null;
  isFavorite?: boolean;
};

export async function createFood(userId: string, input: FoodInput): Promise<Food> {
  const [row] = await db
    .insert(t.foods)
    .values({
      userId,
      source: "custom",
      name: input.name.trim(),
      brand: input.brand?.trim() || null,
      ean: input.ean?.replace(/\D/g, "") || null,
      kcal: input.kcal,
      protein: input.protein,
      carbs: input.carbs,
      fat: input.fat,
      fiber: input.fiber ?? null,
      sugar: input.sugar ?? null,
      salt: input.salt ?? null,
      servingG: input.servingG ?? null,
      isFavorite: input.isFavorite ?? false,
    })
    .returning();
  return toFood(row);
}

export async function updateFood(userId: string, id: string, input: FoodInput): Promise<Food> {
  const [row] = await db
    .update(t.foods)
    .set({
      name: input.name.trim(),
      brand: input.brand?.trim() || null,
      ean: input.ean?.replace(/\D/g, "") || null,
      kcal: input.kcal,
      protein: input.protein,
      carbs: input.carbs,
      fat: input.fat,
      fiber: input.fiber ?? null,
      sugar: input.sugar ?? null,
      salt: input.salt ?? null,
      servingG: input.servingG ?? null,
      ...(input.isFavorite != null ? { isFavorite: input.isFavorite } : {}),
    })
    .where(and(eq(t.foods.id, id), eq(t.foods.userId, userId)))
    .returning();
  if (!row) throw new Error("Potravina nenalezena");
  return toFood(row);
}

export async function deleteFood(userId: string, id: string): Promise<boolean> {
  const res = await db.delete(t.foods).where(and(eq(t.foods.id, id), eq(t.foods.userId, userId))).returning({ id: t.foods.id });
  return res.length > 0;
}

/**
 * Toggle favourite. Shared (cached) foods are copied into the user's own foods first,
 * so favourites never leak between users. Returns the (possibly new) food.
 */
export async function setFavorite(userId: string, id: string, favorite: boolean): Promise<Food> {
  const [row] = await db.select().from(t.foods).where(and(eq(t.foods.id, id), visibleFood(userId))).limit(1);
  if (!row) throw new Error("Potravina nenalezena");
  if (row.userId === userId) {
    const [u] = await db.update(t.foods).set({ isFavorite: favorite }).where(eq(t.foods.id, id)).returning();
    return toFood(u);
  }
  if (row.ean) {
    const [own] = await db
      .select()
      .from(t.foods)
      .where(and(eq(t.foods.userId, userId), eq(t.foods.ean, row.ean)))
      .limit(1);
    if (own) {
      const [u] = await db.update(t.foods).set({ isFavorite: favorite }).where(eq(t.foods.id, own.id)).returning();
      return toFood(u);
    }
  }
  const { id: _id, createdAt: _c, ...rest } = row;
  void _id;
  void _c;
  const [copy] = await db
    .insert(t.foods)
    .values({ ...rest, userId, isFavorite: favorite })
    .returning();
  return toFood(copy);
}

/* ───────────────────────────── Range / trends ───────────────────────────── */

/** Daily totals for every date in [from, to] (inclusive), including empty days. */
export async function getRange(userId: string, from: string, to: string): Promise<DayTotals[]> {
  const [food, water, weights] = await Promise.all([
    db
      .select({
        date: t.foodLogs.date,
        kcal: sql<number>`sum(${t.foodLogs.kcal})`.mapWith(Number),
        protein: sql<number>`sum(${t.foodLogs.protein})`.mapWith(Number),
        carbs: sql<number>`sum(${t.foodLogs.carbs})`.mapWith(Number),
        fat: sql<number>`sum(${t.foodLogs.fat})`.mapWith(Number),
        fiber: sql<number>`coalesce(sum(${t.foodLogs.fiber}), 0)`.mapWith(Number),
        entries: sql<number>`count(*)`.mapWith(Number),
      })
      .from(t.foodLogs)
      .where(and(eq(t.foodLogs.userId, userId), gte(t.foodLogs.date, from), lte(t.foodLogs.date, to)))
      .groupBy(t.foodLogs.date),
    db
      .select({ date: t.waterLogs.date, ml: sql<number>`sum(${t.waterLogs.ml})`.mapWith(Number) })
      .from(t.waterLogs)
      .where(and(eq(t.waterLogs.userId, userId), gte(t.waterLogs.date, from), lte(t.waterLogs.date, to)))
      .groupBy(t.waterLogs.date),
    db
      .select({ date: t.bodyMetrics.date, w: t.bodyMetrics.weightKg })
      .from(t.bodyMetrics)
      .where(and(eq(t.bodyMetrics.userId, userId), isNotNull(t.bodyMetrics.weightKg), gte(t.bodyMetrics.date, from), lte(t.bodyMetrics.date, to))),
  ]);
  const fm = new Map(food.map((f) => [f.date, f]));
  const wm = new Map(water.map((w) => [w.date, w.ml]));
  const bm = new Map(weights.map((w) => [w.date, w.w]));
  const out: DayTotals[] = [];
  for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) {
    const f = fm.get(d);
    out.push({
      date: d,
      kcal: Math.round(f?.kcal ?? 0),
      protein: r1(f?.protein ?? 0),
      carbs: r1(f?.carbs ?? 0),
      fat: r1(f?.fat ?? 0),
      fiber: r1(f?.fiber ?? 0),
      entries: f?.entries ?? 0,
      waterMl: Math.max(0, wm.get(d) ?? 0),
      weightKg: bm.get(d) ?? null,
    });
  }
  return out;
}

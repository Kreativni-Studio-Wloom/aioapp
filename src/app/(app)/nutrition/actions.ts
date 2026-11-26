"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { AiDisabledError } from "@/lib/ai";
import type { ActionResult } from "@/lib/utils";
import * as svc from "@/lib/nutrition/service";
import { foodShape, profileShape } from "@/lib/nutrition/schemas";
import { isoDate } from "@/lib/format";

const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const zMeal = z.enum(["breakfast", "lunch", "dinner", "snack"]);
const zNum = z.coerce.number().finite();
const zPos = zNum.min(0).max(100000);

function revalidate() {
  revalidatePath("/nutrition", "layout");
  revalidatePath("/");
}

async function run<T>(fn: (userId: string) => Promise<T>): Promise<ActionResult<T>> {
  const user = await requireUser();
  try {
    const data = await fn(user.id);
    return { ok: true, data };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: "Neplatné údaje: " + e.issues.map((i) => i.path.join(".")).join(", ") };
    if (e instanceof AiDisabledError) return { ok: false, error: "AI_DISABLED" };
    console.error("[nutrition]", e);
    return { ok: false, error: e instanceof Error ? e.message : "Něco se pokazilo" };
  }
}

/* ── Profile ── */

const ProfileSchema = z.object({
  ...profileShape(() => z.coerce.number()),
  weightKg: zNum.min(25).max(400).nullable().optional(),
});

export async function saveProfileAction(input: z.input<typeof ProfileSchema>) {
  return run(async (userId) => {
    const { weightKg, ...p } = ProfileSchema.parse(input);
    await svc.updateProfile(userId, p);
    if (weightKg != null) {
      // Record a weigh-in when the weight changed, or when the last one isn't from today
      // (re-confirming the same weight is still a data point for the adaptive TDEE).
      const latest = await svc.getLatestWeight(userId);
      if (!latest || latest.weightKg !== weightKg || latest.date !== isoDate()) await svc.setWeight(userId, weightKg);
    }
    revalidate();
  });
}

export async function setKcalOverrideAction(kcal: number | null) {
  return run(async (userId) => {
    const v = z.union([zNum.int().min(800).max(8000), z.null()]).parse(kcal == null ? null : Math.round(kcal));
    await svc.setKcalOverride(userId, v);
    revalidate();
  });
}

export async function adoptAdaptiveAction() {
  return run(async (userId) => {
    const kcal = await svc.adoptAdaptiveTdee(userId);
    if (kcal == null) throw new Error("Zatím není dost dat pro adaptivní odhad.");
    revalidate();
    return kcal;
  });
}

/* ── Logging ── */

const HitSchema = z.object({
  id: z.string().uuid().nullable(),
  ean: z.string().max(20).nullable(),
  name: z.string().min(1).max(200),
  brand: z.string().max(200).nullable(),
  kcal: zPos.max(1000),
  protein: zPos.max(100),
  carbs: zPos.max(100),
  fat: zPos.max(100),
  fiber: zPos.max(100).nullable(),
  servingG: zPos.max(5000).nullable(),
  isFavorite: z.boolean(),
  origin: z.enum(["mine", "cache", "off"]),
  lastUsedAt: z.string().nullable().optional(),
});

export async function logHitAction(input: { date: string; mealType: string; grams: number; hit: svc.FoodHit }) {
  return run(async (userId) => {
    const p = z.object({ date: zDate, mealType: zMeal, grams: zNum.positive().max(5000), hit: HitSchema }).parse(input);
    const food = await svc.ensureFoodFromHit(userId, p.hit);
    const entry = await svc.logFoodByGrams(userId, { date: p.date, mealType: p.mealType, foodId: food.id, grams: p.grams });
    revalidate();
    return entry;
  });
}

const ItemSchema = z.object({
  name: z.string().trim().min(1).max(200),
  grams: zPos.nullable().optional(),
  kcal: zPos,
  protein: zPos,
  carbs: zPos,
  fat: zPos,
  fiber: zPos.nullable().optional(),
});

export async function logItemsAction(input: { date: string; mealType: string; source: "ai_photo" | "ai_text" | "quick"; items: z.input<typeof ItemSchema>[] }) {
  return run(async (userId) => {
    const p = z
      .object({ date: zDate, mealType: zMeal, source: z.enum(["ai_photo", "ai_text", "quick"]), items: z.array(ItemSchema).min(1).max(50) })
      .parse(input);
    const entries = await svc.logMany(
      userId,
      p.items.map((i) => ({ ...i, grams: i.grams || null, date: p.date, mealType: p.mealType, source: p.source })),
    );
    revalidate();
    return entries.length;
  });
}

export async function updateEntryAction(id: string, data: { grams?: number | null; mealType?: string }) {
  return run(async (userId) => {
    const p = z.object({ grams: zNum.positive().max(5000).nullable().optional(), mealType: zMeal.optional() }).parse(data);
    await svc.updateFoodLog(userId, z.string().uuid().parse(id), p);
    revalidate();
  });
}

export async function deleteEntryAction(id: string) {
  return run(async (userId) => {
    await svc.deleteFoodLog(userId, z.string().uuid().parse(id));
    revalidate();
  });
}

export async function copyDayAction(fromDate: string, toDate: string) {
  return run(async (userId) => {
    const n = await svc.copyDay(userId, zDate.parse(fromDate), zDate.parse(toDate));
    revalidate();
    return n;
  });
}

export async function addWaterAction(date: string, ml: number) {
  return run(async (userId) => {
    const total = await svc.addWater(userId, zDate.parse(date), zNum.min(-5000).max(5000).parse(ml));
    revalidate();
    return total;
  });
}

/* ── Lookup / AI ── */

export async function lookupEanAction(ean: string) {
  return run(async (userId) => svc.lookupEan(userId, z.string().trim().min(6).max(20).parse(ean)));
}

export async function estimateTextAction(text: string) {
  return run(async () => svc.estimateFromText(z.string().trim().min(2).max(2000).parse(text)));
}

export async function estimateImageAction(dataUrl: string, hint?: string | null) {
  return run(async () => {
    const url = z
      .string()
      .max(7_000_000)
      .regex(/^data:image\/(jpeg|png|webp|gif);base64,/)
      .parse(dataUrl);
    return svc.estimateFromImage(url, hint ? String(hint).slice(0, 500) : null);
  });
}

/* ── Foods ── */

const FoodSchema = z.object(foodShape(() => z.coerce.number()));

export async function saveFoodAction(id: string | null, input: z.input<typeof FoodSchema>) {
  return run(async (userId) => {
    const p = FoodSchema.parse(input);
    const food = id ? await svc.updateFood(userId, z.string().uuid().parse(id), p) : await svc.createFood(userId, p);
    revalidate();
    return food;
  });
}

export async function deleteFoodAction(id: string) {
  return run(async (userId) => {
    await svc.deleteFood(userId, z.string().uuid().parse(id));
    revalidate();
  });
}

export async function setFavoriteAction(id: string, favorite: boolean) {
  return run(async (userId) => {
    const food = await svc.setFavorite(userId, z.string().uuid().parse(id), !!favorite);
    revalidate();
    return food;
  });
}

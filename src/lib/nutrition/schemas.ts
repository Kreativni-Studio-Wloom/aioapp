/**
 * Shared zod limits for nutrition inputs – used by the server actions and the AI tool
 * registry (`src/lib/ai-tools.ts`), so both entry points enforce the same bounds.
 *
 * Each builder takes a number-schema factory: server actions pass `z.coerce.number()`
 * (form values), the AI tools pass `z.number()` (needs a clean JSON schema).
 */
import { z } from "zod";

type Num = z._ZodNumber<z.core.$ZodNumberInternals<unknown>>;
type NumFactory<N extends Num> = () => N;

const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Nutrition profile fields (all required – wrap with `.partial()` for patch updates). */
export function profileShape<N extends Num>(num: NumFactory<N>) {
  return {
    sex: z.enum(["male", "female"]).nullable(),
    birthDate: zDate.nullable(),
    heightCm: num().min(100).max(250).nullable(),
    activityLevel: z.enum(["sedentary", "light", "moderate", "active", "very_active"]),
    goal: z.enum(["lose", "maintain", "gain"]),
    rateKgPerWeek: num().min(0).max(1.5),
    proteinPerKg: num().min(0.5).max(4),
    fatPct: num().min(0.1).max(0.6),
    kcalOverride: num().int().min(800).max(8000).nullable(),
  };
}

/** Food fields, values per 100 g. */
export function foodShape<N extends Num>(num: NumFactory<N>) {
  const per100 = () => num().min(0).max(100);
  return {
    name: z.string().trim().min(1).max(200),
    brand: z.string().trim().max(200).nullable().optional(),
    ean: z.string().trim().max(20).nullable().optional(),
    kcal: num().min(0).max(1000),
    protein: per100(),
    carbs: per100(),
    fat: per100(),
    fiber: per100().nullable().optional(),
    sugar: per100().nullable().optional(),
    salt: per100().nullable().optional(),
    servingG: num().min(0).max(5000).nullable().optional(),
    isFavorite: z.boolean().optional(),
  };
}

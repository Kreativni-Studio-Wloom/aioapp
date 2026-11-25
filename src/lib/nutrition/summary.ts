import { isoDate } from "@/lib/format";
import { getDay } from "./service";

export type NutritionSummary = {
  date: string;
  kcal: number;
  kcalTarget: number;
  protein: number;
  proteinTarget: number;
  carbs: number;
  carbsTarget: number;
  fat: number;
  fatTarget: number;
  waterMl: number;
  profileComplete: boolean;
};

/** Today's intake vs targets for the home dashboard. */
export async function getNutritionSummary(userId: string): Promise<NutritionSummary> {
  const day = await getDay(userId, isoDate());
  return {
    date: day.date,
    kcal: day.totals.kcal,
    kcalTarget: day.targets.kcal,
    protein: day.totals.protein,
    proteinTarget: day.targets.protein,
    carbs: day.totals.carbs,
    carbsTarget: day.targets.carbs,
    fat: day.totals.fat,
    fatTarget: day.targets.fat,
    waterMl: day.waterMl,
    profileComplete: day.targets.profileComplete,
  };
}

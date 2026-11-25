import { requireUser } from "@/lib/auth";
import { addDays, isoDate } from "@/lib/format";
import { aiEnabled } from "@/lib/ai";
import { countEntries, getDay, recentFoods } from "@/lib/nutrition/service";
import { DayView } from "./day-view";

export default async function NutritionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const today = isoDate();
  const raw = typeof sp.d === "string" ? sp.d : "";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) && !Number.isNaN(Date.parse(raw)) ? raw : today;
  const [day, yesterday, recent] = await Promise.all([getDay(user.id, date), countEntries(user.id, addDays(date, -1)), recentFoods(user.id, 15)]);
  return <DayView day={day} today={today} prevDayCount={yesterday} recent={recent} aiEnabled={aiEnabled()} autoAdd={sp.add === "1"} />;
}

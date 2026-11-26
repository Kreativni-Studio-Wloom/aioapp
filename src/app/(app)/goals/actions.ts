"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createGoal, deleteGoal, type GoalMetric } from "@/lib/goals/service";
import { toNum, type ActionResult } from "@/lib/utils";

const input = z.object({
  kind: z.enum(["body_weight", "exercise_1rm", "income_year", "net_worth", "portfolio_value"]),
  ref: z.string().uuid().optional(),
  title: z.string().trim().max(120).optional(),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function saveGoal(_: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = input.safeParse({
    kind: form.get("kind"),
    ref: form.get("ref") || undefined,
    title: form.get("title") || undefined,
    deadline: form.get("deadline") || undefined,
  });
  const target = toNum(form.get("target"));
  if (!parsed.success || !target || target <= 0) return { ok: false, error: "Vyplň typ cíle a kladnou cílovou hodnotu." };
  const { kind, ref, title, deadline } = parsed.data;
  let metric: GoalMetric;
  if (kind === "exercise_1rm") {
    if (!ref) return { ok: false, error: "Vyber cvik." };
    metric = { kind, exerciseId: ref };
  } else if (kind === "income_year") metric = { kind, sourceId: ref };
  else metric = { kind };
  try {
    await createGoal(user.id, { metric, target, title, deadline });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Nepodařilo se uložit cíl." };
  }
  revalidatePath("/goals");
  revalidatePath("/");
  return { ok: true };
}

export async function removeGoal(id: string) {
  const user = await requireUser();
  await deleteGoal(user.id, id);
  revalidatePath("/goals");
  revalidatePath("/");
}

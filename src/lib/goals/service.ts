/**
 * Cross-module goals ("100 kg bench by June", "500k from Matcha this year", "78 kg body weight").
 * The current value is always computed live from the module data, never stored.
 */
import { and, asc, desc, eq, gt, isNotNull, lte } from "drizzle-orm";
import { db, t } from "@/db";
import { isoDate } from "@/lib/format";
import { getExerciseHistory, getLatestWeight, getExercise } from "@/lib/workout/service";
import { sumTransactions } from "@/lib/income/service";
import { getPortfolioOverview } from "@/lib/portfolio/service";

export type GoalMetric =
  | { kind: "body_weight" }
  | { kind: "exercise_1rm"; exerciseId: string }
  | { kind: "income_year"; sourceId?: string }
  | { kind: "net_worth" }
  | { kind: "portfolio_value" };

export const METRIC_LABEL: Record<GoalMetric["kind"], string> = {
  body_weight: "Tělesná váha (kg)",
  exercise_1rm: "Odhad 1RM cviku (kg)",
  income_year: "Čistý příjem za rok (Kč)",
  net_worth: "Čisté jmění (Kč)",
  portfolio_value: "Hodnota portfolia (Kč)",
};

const MODULE: Record<GoalMetric["kind"], string> = {
  body_weight: "body",
  exercise_1rm: "workout",
  income_year: "income",
  net_worth: "portfolio",
  portfolio_value: "portfolio",
};

export function encodeMetric(m: GoalMetric): string {
  if (m.kind === "exercise_1rm") return `exercise_1rm:${m.exerciseId}`;
  if (m.kind === "income_year") return m.sourceId ? `income_year:${m.sourceId}` : "income_year";
  return m.kind;
}

export function decodeMetric(s: string): GoalMetric | null {
  const [kind, arg] = s.split(":");
  if (kind === "exercise_1rm" && arg) return { kind, exerciseId: arg };
  if (kind === "income_year") return arg ? { kind, sourceId: arg } : { kind };
  if (kind === "body_weight" || kind === "net_worth" || kind === "portfolio_value") return { kind };
  return null;
}

export type GoalDTO = {
  id: string;
  title: string;
  metric: string;
  metricKind: GoalMetric["kind"] | null;
  unit: "kg" | "CZK";
  target: number;
  current: number | null;
  /** value when the goal was created (body weight only) – lets a "lose weight" goal show progress */
  start: number | null;
  /** 0–1 */
  progress: number;
  deadline: string | null;
  daysLeft: number | null;
  achievedAt: string | null;
  href: string;
  createdAt: string;
};

async function currentValue(userId: string, m: GoalMetric, createdAt: Date): Promise<{ current: number | null; start: number | null; href: string }> {
  switch (m.kind) {
    case "body_weight": {
      const latest = await getLatestWeight(userId);
      // Baseline = the last weigh-in on/before the day the goal was set; if there was none yet,
      // the first one after. Kept stable so new weigh-ins move progress instead of the start.
      const created = isoDate(createdAt);
      const base = (order: "before" | "after") =>
        db
          .select({ w: t.bodyMetrics.weightKg })
          .from(t.bodyMetrics)
          .where(
            and(
              eq(t.bodyMetrics.userId, userId),
              isNotNull(t.bodyMetrics.weightKg),
              order === "before" ? lte(t.bodyMetrics.date, created) : gt(t.bodyMetrics.date, created),
            ),
          )
          .orderBy(order === "before" ? desc(t.bodyMetrics.date) : asc(t.bodyMetrics.date))
          .limit(1);
      const [before] = await base("before").then((r) => (r.length ? r : base("after")));
      return { current: latest?.weightKg ?? null, start: before?.w ?? null, href: "/workout/body" };
    }
    case "exercise_1rm": {
      const h = await getExerciseHistory(userId, m.exerciseId, 1);
      return { current: h?.prs.bestE1rm ? Math.round(h.prs.bestE1rm.value * 10) / 10 : null, start: null, href: `/workout/exercises/${m.exerciseId}` };
    }
    case "income_year": {
      const y = isoDate().slice(0, 4);
      const s = await sumTransactions(userId, { from: `${y}-01-01`, to: `${y}-12-31`, ...(m.sourceId ? { sourceId: m.sourceId } : {}) });
      return { current: s.net, start: null, href: m.sourceId ? `/income/sources/${m.sourceId}` : "/income?y=" + y };
    }
    case "net_worth": {
      const o = await getPortfolioOverview(userId);
      return { current: o.netWorthCzk, start: null, href: "/portfolio" };
    }
    case "portfolio_value": {
      const o = await getPortfolioOverview(userId);
      return { current: o.totalCzk, start: null, href: "/portfolio" };
    }
  }
}

function progressOf(current: number | null, target: number, start: number | null) {
  if (current == null || target === 0) return 0;
  if (start != null && start !== target) {
    // works in both directions (losing or gaining weight)
    return Math.max(0, Math.min(1, (current - start) / (target - start)));
  }
  return Math.max(0, Math.min(1, current / target));
}

export async function listGoals(userId: string): Promise<GoalDTO[]> {
  const rows = await db.select().from(t.goals).where(eq(t.goals.userId, userId)).orderBy(asc(t.goals.achievedAt), desc(t.goals.createdAt));
  const today = isoDate();
  const out = await Promise.all(
    rows.map(async (g): Promise<GoalDTO> => {
      const m = decodeMetric(g.metric);
      const v = m ? await currentValue(userId, m, g.createdAt).catch(() => ({ current: null, start: null, href: "/goals" })) : { current: null, start: null, href: "/goals" };
      const progress = progressOf(v.current, g.target, v.start);
      // mark achieved once (kept even if the value later drops)
      let achievedAt = g.achievedAt;
      if (!achievedAt && progress >= 1) {
        achievedAt = new Date();
        await db.update(t.goals).set({ achievedAt }).where(and(eq(t.goals.id, g.id), eq(t.goals.userId, userId)));
      }
      const daysLeft = g.deadline ? Math.round((Date.parse(g.deadline) - Date.parse(today)) / 86_400_000) : null;
      return {
        id: g.id,
        title: g.title,
        metric: g.metric,
        metricKind: m?.kind ?? null,
        unit: m && (m.kind === "body_weight" || m.kind === "exercise_1rm") ? "kg" : "CZK",
        target: g.target,
        current: v.current,
        start: v.start,
        progress,
        deadline: g.deadline,
        daysLeft,
        achievedAt: achievedAt ? isoDate(achievedAt) : null,
        href: v.href,
        createdAt: isoDate(g.createdAt),
      };
    }),
  );
  return out;
}

export type GoalInput = { title?: string | null; metric: GoalMetric; target: number; deadline?: string | null };

async function defaultTitle(userId: string, m: GoalMetric, target: number) {
  const fmt = (n: number) => new Intl.NumberFormat("cs-CZ").format(n);
  switch (m.kind) {
    case "body_weight":
      return `Váha ${fmt(target)} kg`;
    case "exercise_1rm": {
      const ex = await getExercise(userId, m.exerciseId);
      return `${ex?.name ?? "Cvik"} ${fmt(target)} kg (1RM)`;
    }
    case "income_year": {
      if (!m.sourceId) return `Příjem ${fmt(target)} Kč za rok`;
      const [s] = await db.select({ name: t.incomeSources.name }).from(t.incomeSources).where(and(eq(t.incomeSources.id, m.sourceId), eq(t.incomeSources.userId, userId)));
      return `${s?.name ?? "Zdroj"}: ${fmt(target)} Kč za rok`;
    }
    case "net_worth":
      return `Čisté jmění ${fmt(target)} Kč`;
    case "portfolio_value":
      return `Portfolio ${fmt(target)} Kč`;
  }
}

export async function createGoal(userId: string, input: GoalInput) {
  if (!Number.isFinite(input.target) || input.target <= 0) throw new Error("Cíl musí být kladné číslo");
  const m = input.metric;
  if (m.kind === "exercise_1rm" && !(await getExercise(userId, m.exerciseId))) throw new Error("Cvik nenalezen");
  if (m.kind === "income_year" && m.sourceId) {
    const [s] = await db.select({ id: t.incomeSources.id }).from(t.incomeSources).where(and(eq(t.incomeSources.id, m.sourceId), eq(t.incomeSources.userId, userId)));
    if (!s) throw new Error("Zdroj příjmů nenalezen");
  }
  if (input.deadline && !/^\d{4}-\d{2}-\d{2}$/.test(input.deadline)) throw new Error("Neplatný termín");
  const title = input.title?.trim() || (await defaultTitle(userId, m, input.target));
  const [row] = await db
    .insert(t.goals)
    .values({ userId, module: MODULE[m.kind], title: title.slice(0, 120), metric: encodeMetric(m), target: input.target, deadline: input.deadline || null })
    .returning({ id: t.goals.id });
  return row;
}

export async function deleteGoal(userId: string, goalId: string) {
  await db.delete(t.goals).where(and(eq(t.goals.id, goalId), eq(t.goals.userId, userId)));
}

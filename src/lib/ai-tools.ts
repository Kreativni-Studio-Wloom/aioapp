/* eslint-disable @typescript-eslint/no-unused-vars -- destructuring drops label-only fields */
/**
 * One registry of tools over all modules. Used by:
 *  - the in-app AI assistant (Claude tool use; write tools become proposals the user approves)
 *  - the MCP server at /api/mcp (Claude desktop / Claude Code; the MCP client asks for approval)
 *  - the REST API at /api/v1/tools/{name}
 */
import { z } from "zod";
import { isoDate } from "@/lib/format";
import * as workout from "@/lib/workout/service";
import * as nutrition from "@/lib/nutrition/service";
import { foodShape as nutritionFoodShape, profileShape as nutritionProfileShape } from "@/lib/nutrition/schemas";
import * as income from "@/lib/income/service";
import * as portfolio from "@/lib/portfolio/service";
import * as goals from "@/lib/goals/service";
import { getWorkoutSummary } from "@/lib/workout/summary";
import { getNutritionSummary } from "@/lib/nutrition/summary";
import { getIncomeSummary } from "@/lib/income/summary";
import { getPortfolioSummary } from "@/lib/portfolio/summary";
import { exportUserData } from "@/lib/export";

export type ToolDef<S extends z.ZodObject = z.ZodObject> = {
  name: string;
  description: string;
  module: "general" | "workout" | "nutrition" | "income" | "portfolio";
  write: boolean;
  schema: S;
  /** Human readable description of a write, shown on the approval card. */
  summarize?: (input: z.infer<S>) => string;
  run: (userId: string, input: z.infer<S>) => Promise<unknown>;
};

function tool<S extends z.ZodObject>(def: ToolDef<S>): ToolDef {
  return def as unknown as ToolDef;
}

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("YYYY-MM-DD");
const mealType = z.enum(["breakfast", "lunch", "dinner", "snack"]);

export const TOOLS: ToolDef[] = [
  /* ── General ── */
  tool({
    name: "get_overview",
    description: "Today's snapshot across all modules: workout plan & stagnation, nutrition progress vs targets, income this month/year, portfolio value and net worth.",
    module: "general",
    write: false,
    schema: z.object({}),
    run: async (u) => {
      const [w, n, i, p] = await Promise.allSettled([getWorkoutSummary(u), getNutritionSummary(u), getIncomeSummary(u), getPortfolioSummary(u)]);
      const v = <T,>(r: PromiseSettledResult<T>) => (r.status === "fulfilled" ? r.value : { error: String(r.reason) });
      return { today: isoDate(), workout: v(w), nutrition: v(n), income: v(i), portfolio: v(p) };
    },
  }),
  tool({
    name: "list_goals",
    description: "The user's goals across modules (strength 1RM, body weight, yearly income, net worth, portfolio value) with live current value, progress 0–1, deadline and days left.",
    module: "general",
    write: false,
    schema: z.object({}),
    run: (u) => goals.listGoals(u),
  }),
  tool({
    name: "create_goal",
    description:
      "Create a goal. kind: exercise_1rm (needs exerciseId from search_exercises, target kg), body_weight (target kg), income_year (net CZK this calendar year, optional sourceId from list_income_sources), net_worth (CZK), portfolio_value (CZK).",
    module: "general",
    write: true,
    schema: z.object({
      kind: z.enum(["exercise_1rm", "body_weight", "income_year", "net_worth", "portfolio_value"]),
      target: z.number().positive(),
      exerciseId: z.string().uuid().optional(),
      sourceId: z.string().uuid().optional(),
      deadline: date.optional(),
      title: z.string().max(120).optional(),
    }),
    summarize: (i) => `Nový cíl: ${i.title ?? i.kind} → ${i.target}${i.deadline ? ` do ${i.deadline}` : ""}`,
    run: (u, i) => {
      const metric: goals.GoalMetric =
        i.kind === "exercise_1rm"
          ? (() => {
              if (!i.exerciseId) throw new Error("exerciseId is required for exercise_1rm");
              return { kind: "exercise_1rm" as const, exerciseId: i.exerciseId };
            })()
          : i.kind === "income_year"
            ? { kind: "income_year", sourceId: i.sourceId }
            : { kind: i.kind };
      return goals.createGoal(u, { metric, target: i.target, deadline: i.deadline, title: i.title });
    },
  }),
  tool({
    name: "delete_goal",
    description: "Delete a goal by id (from list_goals).",
    module: "general",
    write: true,
    schema: z.object({ goalId: z.string().uuid() }),
    summarize: () => "Smazat cíl",
    run: async (u, i) => {
      await goals.deleteGoal(u, i.goalId);
      return { ok: true };
    },
  }),

  /* ── Workout ── */
  tool({
    name: "list_programs",
    description: "List the user's training programs (which one is active).",
    module: "workout",
    write: false,
    schema: z.object({}),
    run: (u) => workout.listPrograms(u),
  }),
  tool({
    name: "get_program",
    description: "Full program detail: days with exercises, sets, rep ranges, rest, RPE, progression. Use programId from list_programs; omit to get the active program.",
    module: "workout",
    write: false,
    schema: z.object({ programId: z.string().optional() }),
    run: (u, i) => (i.programId ? workout.getProgram(u, i.programId) : workout.getActiveProgram(u)),
  }),
  tool({
    name: "search_exercises",
    description: "Search the exercise library (built-in + custom). Returns ids, names, muscles, pattern, equipment.",
    module: "workout",
    write: false,
    schema: z.object({ query: z.string().optional() }),
    run: (u, i) => workout.listExercises(u, i.query),
  }),
  tool({
    name: "get_alternatives",
    description: "Alternative exercises for a given exercise (same movement pattern / muscle), e.g. when equipment is busy or it hurts.",
    module: "workout",
    write: false,
    schema: z.object({ exerciseId: z.string() }),
    run: (u, i) => workout.getAlternatives(u, i.exerciseId),
  }),
  tool({
    name: "get_recent_workouts",
    description: "Recent finished workouts with sets (weight × reps).",
    module: "workout",
    write: false,
    schema: z.object({ limit: z.number().int().min(1).max(30).optional() }),
    run: (u, i) => workout.getRecentWorkouts(u, i.limit ?? 8),
  }),
  tool({
    name: "get_exercise_history",
    description: "History of one exercise: sessions with sets and estimated 1RM, for progress analysis.",
    module: "workout",
    write: false,
    schema: z.object({ exerciseId: z.string(), limit: z.number().int().min(1).max(50).optional() }),
    run: (u, i) => workout.getExerciseHistory(u, i.exerciseId, i.limit ?? 15),
  }),
  tool({
    name: "get_stagnation",
    description: "Exercises where the user has been stuck on the same weight/reps for several sessions, with suggestions.",
    module: "workout",
    write: false,
    schema: z.object({}),
    run: (u) => workout.getStagnation(u),
  }),
  tool({
    name: "get_body_metrics",
    description: "Body weight (and body fat/waist) entries for the last N days.",
    module: "workout",
    write: false,
    schema: z.object({ days: z.number().int().min(7).max(365).optional() }),
    run: (u, i) => workout.getBodyMetrics(u, i.days ?? 60),
  }),
  tool({
    name: "create_program",
    description: "Create a new training program with days and exercises (use exercise ids from search_exercises).",
    module: "workout",
    write: true,
    schema: z.object({
      name: z.string(),
      description: z.string().optional(),
      days: z.array(
        z.object({
          name: z.string(),
          weekday: z.number().int().min(1).max(7).optional().describe("1=Monday … 7=Sunday"),
          exercises: z.array(
            z.object({
              exerciseId: z.string(),
              sets: z.number().int().min(1).max(10),
              repMin: z.number().int().min(1).max(50),
              repMax: z.number().int().min(1).max(50),
              restSeconds: z.number().int().optional(),
              targetRpe: z.number().optional(),
              incrementKg: z.number().optional(),
              notes: z.string().optional(),
            }),
          ),
        }),
      ),
    }),
    summarize: (i) => `Vytvořit program „${i.name}“ (${i.days.length} dny, ${i.days.reduce((a, d) => a + d.exercises.length, 0)} cviků)`,
    run: (u, i) => workout.createProgram(u, i),
  }),
  tool({
    name: "add_program_exercise",
    description: "Add an exercise to a program day.",
    module: "workout",
    write: true,
    schema: z.object({
      dayId: z.string(),
      exerciseId: z.string(),
      exerciseName: z.string().describe("Name, for the approval card"),
      sets: z.number().int().min(1).max(10),
      repMin: z.number().int(),
      repMax: z.number().int(),
      restSeconds: z.number().int().optional(),
      targetRpe: z.number().optional(),
      notes: z.string().optional(),
    }),
    summarize: (i) => `Přidat ${i.exerciseName}: ${i.sets}× ${i.repMin}–${i.repMax}`,
    run: (u, { dayId, exerciseName: _n, ...rest }) => workout.addProgramExercise(u, dayId, rest),
  }),
  tool({
    name: "update_program_exercise",
    description:
      "Change sets/reps/rest/RPE/increment/progression/notes of an exercise in a program (programExerciseId from get_program). progression: 'double' = double progression (add reps up to repMax, then add incrementKg), 'none' = no automatic progression hints.",
    module: "workout",
    write: true,
    schema: z.object({
      programExerciseId: z.string(),
      exerciseName: z.string().describe("Name, for the approval card"),
      sets: z.number().int().optional(),
      repMin: z.number().int().optional(),
      repMax: z.number().int().optional(),
      restSeconds: z.number().int().optional(),
      targetRpe: z.number().optional(),
      incrementKg: z.number().optional(),
      progression: z.enum(["double", "none"]).optional(),
      notes: z.string().optional(),
    }),
    summarize: (i) => {
      const parts = [
        i.sets != null && `${i.sets} sérií`,
        i.repMin != null && i.repMax != null && `${i.repMin}–${i.repMax} opak.`,
        i.restSeconds != null && `pauza ${i.restSeconds} s`,
        i.targetRpe != null && `RPE ${i.targetRpe}`,
        i.incrementKg != null && `přírůstek ${i.incrementKg} kg`,
        i.progression && (i.progression === "double" ? "dvojitá progrese" : "bez progrese"),
        i.notes && `pozn.: ${i.notes}`,
      ].filter(Boolean);
      return `Upravit ${i.exerciseName}: ${parts.join(", ")}`;
    },
    run: (u, { programExerciseId, exerciseName: _n, ...patch }) => workout.updateProgramExercise(u, programExerciseId, patch),
  }),
  tool({
    name: "replace_program_exercise",
    description: "Swap an exercise in a program for another one (keeps sets/reps).",
    module: "workout",
    write: true,
    schema: z.object({ programExerciseId: z.string(), newExerciseId: z.string(), fromName: z.string(), toName: z.string() }),
    summarize: (i) => `Nahradit ${i.fromName} → ${i.toName}`,
    run: (u, i) => workout.replaceProgramExercise(u, i.programExerciseId, i.newExerciseId),
  }),
  tool({
    name: "remove_program_exercise",
    description: "Remove an exercise from a program day.",
    module: "workout",
    write: true,
    schema: z.object({ programExerciseId: z.string(), exerciseName: z.string() }),
    summarize: (i) => `Odebrat ${i.exerciseName} z programu`,
    run: (u, i) => workout.removeProgramExercise(u, i.programExerciseId),
  }),
  tool({
    name: "log_body_weight",
    description: "Record body weight (kg) for a date.",
    module: "workout",
    write: true,
    schema: z.object({ date: date.optional(), weightKg: z.number().min(20).max(400) }),
    summarize: (i) => `Zapsat váhu ${i.weightKg} kg (${i.date ?? "dnes"})`,
    run: (u, i) => workout.logBodyMetric(u, { date: i.date ?? isoDate(), weightKg: i.weightKg }),
  }),

  /* ── Nutrition ── */
  tool({
    name: "get_nutrition_day",
    description: "Food log for a day with totals, water and targets.",
    module: "nutrition",
    write: false,
    schema: z.object({ date: date.optional() }),
    run: (u, i) => nutrition.getDay(u, i.date ?? isoDate()),
  }),
  tool({
    name: "get_nutrition_targets",
    description: "Calorie and macro targets (BMR, TDEE, adaptive TDEE).",
    module: "nutrition",
    write: false,
    schema: z.object({}),
    run: (u) => nutrition.getTargets(u),
  }),
  tool({
    name: "get_nutrition_range",
    description: "Daily calorie/macro totals between two dates.",
    module: "nutrition",
    write: false,
    schema: z.object({ from: date, to: date }),
    run: (u, i) => nutrition.getRange(u, i.from, i.to),
  }),
  tool({
    name: "search_foods",
    description: "Search foods (own database + Open Food Facts). Values are per 100 g.",
    module: "nutrition",
    write: false,
    schema: z.object({ query: z.string() }),
    run: (u, i) => nutrition.searchFoods(u, i.query),
  }),
  tool({
    name: "log_food",
    description: "Log a food entry with absolute values for the eaten amount (estimate if needed).",
    module: "nutrition",
    write: true,
    schema: z.object({
      date: date.optional(),
      mealType,
      name: z.string(),
      grams: z.number().optional(),
      kcal: z.number(),
      protein: z.number(),
      carbs: z.number(),
      fat: z.number(),
      fiber: z.number().optional(),
    }),
    summarize: (i) => `Zapsat ${i.name}${i.grams ? ` ${i.grams} g` : ""} – ${Math.round(i.kcal)} kcal (B ${Math.round(i.protein)} / S ${Math.round(i.carbs)} / T ${Math.round(i.fat)})`,
    run: (u, i) => nutrition.logFood(u, { ...i, date: i.date ?? isoDate(), source: "ai_text" }),
  }),

  /* ── Income ── */
  tool({
    name: "list_income_sources",
    description: "Income sources (businesses, rentals, investments, job) with ids.",
    module: "income",
    write: false,
    schema: z.object({}),
    run: (u) => income.listSources(u),
  }),
  tool({
    name: "list_events",
    description: "Business events (e.g. festivals) with ids, optionally for one source.",
    module: "income",
    write: false,
    schema: z.object({ sourceId: z.string().uuid("Neplatné sourceId – použij id z list_income_sources").optional() }),
    run: (u, i) => income.listEvents(u, i.sourceId),
  }),
  tool({
    name: "get_income_overview",
    description: "Income/expense totals, average monthly net, monthly series and breakdown by source for a year ('all' for everything).",
    module: "income",
    write: false,
    schema: z.object({ year: z.union([z.number().int().min(1990).max(2100), z.literal("all")]).optional() }),
    run: (u, i) => income.getOverview(u, { year: i.year ?? new Date().getFullYear() }),
  }),
  tool({
    name: "get_event_stats",
    description: "Income, expenses, profit and margin of one event.",
    module: "income",
    write: false,
    schema: z.object({ eventId: z.string().uuid("Neplatné eventId – použij id z list_events") }),
    run: (u, i) => income.getEventStats(u, i.eventId),
  }),
  tool({
    name: "list_transactions",
    description: "Income/expense transactions with filters.",
    module: "income",
    write: false,
    schema: z.object({
      from: date.optional(),
      to: date.optional(),
      sourceId: z.string().uuid("Neplatné sourceId – použij id z list_income_sources").or(z.literal("none")).optional().describe("uuid, or 'none' for transactions without a source"),
      eventId: z.string().uuid("Neplatné eventId – použij id z list_events").optional(),
      kind: z.enum(["income", "expense"]).optional(),
      limit: z.number().int().max(200).optional(),
    }),
    run: (u, i) => income.listTransactions(u, i),
  }),
  tool({
    name: "add_transaction",
    description: "Record income or an expense, optionally tied to a source and event. Amount in the given currency (default CZK).",
    module: "income",
    write: true,
    schema: z.object({
      kind: z.enum(["income", "expense"]),
      amount: z.number().positive(),
      currency: z.string().length(3).optional(),
      date: date.optional(),
      sourceId: z.string().uuid("Neplatné sourceId – použij id z list_income_sources").optional(),
      eventId: z.string().uuid("Neplatné eventId – použij id z list_events").optional(),
      category: z.string().optional(),
      note: z.string().optional(),
      label: z.string().describe("Short human label for the approval card, e.g. 'Tržba – Letní festival'"),
    }),
    summarize: (i) => `${i.kind === "income" ? "Příjem" : "Výdaj"} ${i.amount.toLocaleString("cs-CZ")} ${i.currency ?? "CZK"} – ${i.label}`,
    run: (u, { label: _l, ...i }) => income.addTransaction(u, i),
  }),
  tool({
    name: "create_event",
    description: "Create a business event (e.g. a festival) under an income source.",
    module: "income",
    write: true,
    schema: z.object({ sourceId: z.string().uuid("Neplatné sourceId – použij id z list_income_sources"), name: z.string(), location: z.string().optional(), startDate: date, endDate: date.optional() }),
    summarize: (i) => `Vytvořit event „${i.name}“ (${i.startDate})`,
    run: (u, i) => income.createEvent(u, i),
  }),

  /* ── Portfolio ── */
  tool({
    name: "get_portfolio",
    description: "Portfolio overview: total value, invested, P/L, allocation, net worth, holdings.",
    module: "portfolio",
    write: false,
    schema: z.object({}),
    run: async (u) => ({ overview: await portfolio.getPortfolioOverview(u), holdings: await portfolio.listHoldings(u) }),
  }),
  tool({
    name: "get_net_worth_history",
    description: "Net worth snapshots over the last N days.",
    module: "portfolio",
    write: false,
    schema: z.object({ days: z.number().int().max(3650).optional() }),
    run: (u, i) => portfolio.getNetWorthHistory(u, i.days ?? 365),
  }),
  tool({
    name: "add_asset_transaction",
    description:
      "Record a buy/sell/dividend/fee/valuation for an existing asset (assetId from get_portfolio). 'withdrawal' (profit taken out) is only for manually valued assets (cash, real estate); market assets realize profit via 'sell'. Sells larger than the held quantity are rejected. For buy/sell give price per unit, or amount (total) and it is derived.",
    module: "portfolio",
    write: true,
    schema: z.object({
      assetId: z.string(),
      assetName: z.string(),
      type: z.enum(["buy", "sell", "dividend", "fee", "withdrawal", "valuation"]),
      date: date.optional(),
      quantity: z.number().optional(),
      price: z.number().optional(),
      fee: z.number().optional(),
      amount: z.number().optional(),
      note: z.string().optional(),
    }),
    summarize: (i) =>
      `${{ buy: "Nákup", sell: "Prodej", dividend: "Dividenda", fee: "Poplatek", withdrawal: "Výběr", valuation: "Ocenění" }[i.type]} ${i.assetName}` +
      (i.quantity ? ` ${i.quantity} ks` : "") +
      (i.price ? ` @ ${i.price}` : "") +
      (i.amount ? ` ${i.amount}` : ""),
    run: (u, { assetName: _n, ...i }) => portfolio.addAssetTransaction(u, { ...i, date: i.date ?? isoDate(), alsoIncome: true }),
  }),
  /* ═════════════ Extended read access ═════════════ */
  tool({
    name: "export_data",
    description: "Raw dump of ALL stored data for a module (or 'all'): every workout & set, food log, transaction, asset transaction etc. Use when other tools don't cover a question. Can be large – prefer a single module.",
    module: "general",
    write: false,
    schema: z.object({ module: z.enum(["all", "body", "workout", "nutrition", "income", "portfolio"]) }),
    run: (u, i) => exportUserData(u, i.module),
  }),
  tool({
    name: "get_today_plan",
    description: "Today's planned training day from the active program incl. this week's moves (or next in rotation).",
    module: "workout",
    write: false,
    schema: z.object({}),
    run: (u) => workout.getTodayPlan(u),
  }),
  tool({
    name: "get_week_plan",
    description:
      "The active program laid out over a week (Mon–Sun) with this week's one-off changes applied: which training day is on which weekday, what is done, moved or skipped. Use before moving/swapping days.",
    module: "workout",
    write: false,
    schema: z.object({ date: date.optional().describe("Any date in the wanted week; default this week") }),
    run: (u, i) => workout.getWeekPlan(u, i.date),
  }),
  tool({
    name: "get_workout",
    description: "One workout in detail: exercises, sets, volume, PRs.",
    module: "workout",
    write: false,
    schema: z.object({ workoutId: z.string() }),
    run: (u, i) => workout.getWorkout(u, i.workoutId),
  }),
  tool({
    name: "get_active_workout",
    description: "The currently unfinished workout (in progress), if any, with its sets.",
    module: "workout",
    write: false,
    schema: z.object({}),
    run: async (u) => {
      const a = await workout.getActiveWorkout(u);
      return a ? workout.getWorkout(u, (a as { id: string }).id) : null;
    },
  }),
  tool({
    name: "get_workouts_since",
    description: "All finished workouts in the last N days.",
    module: "workout",
    write: false,
    schema: z.object({ days: z.number().int().min(1).max(3650) }),
    run: (u, i) => workout.getWorkoutsSince(u, i.days),
  }),
  tool({
    name: "get_week_stats",
    description: "This week's training stats (workouts, volume, sets, time).",
    module: "workout",
    write: false,
    schema: z.object({}),
    run: (u) => workout.getWeekStats(u),
  }),
  tool({
    name: "list_program_templates",
    description: "Built-in program templates that can be cloned.",
    module: "workout",
    write: false,
    schema: z.object({}),
    run: async () => workout.listProgramTemplates(),
  }),
  tool({
    name: "get_nutrition_profile",
    description: "Nutrition profile & full target calculation (sex, age, height, weight, activity, goal, BMR, TDEE, adaptive TDEE, macros).",
    module: "nutrition",
    write: false,
    schema: z.object({}),
    run: async (u) => ({ profile: await nutrition.getProfile(u), targets: await nutrition.getTargetsDetail(u) }),
  }),
  tool({
    name: "list_my_foods",
    description: "The user's own/custom and favourite foods (values per 100 g).",
    module: "nutrition",
    write: false,
    schema: z.object({ favoritesOnly: z.boolean().optional() }),
    run: (u, i) => nutrition.listMyFoods(u, { favoritesOnly: i.favoritesOnly }),
  }),
  tool({
    name: "recent_foods",
    description: "Recently eaten foods (for quick re-logging).",
    module: "nutrition",
    write: false,
    schema: z.object({}),
    run: (u) => nutrition.recentFoods(u),
  }),
  tool({
    name: "lookup_barcode",
    description: "Look up a product by EAN barcode (own DB, then Open Food Facts).",
    module: "nutrition",
    write: false,
    schema: z.object({ ean: z.string() }),
    run: (u, i) => nutrition.lookupEan(u, i.ean),
  }),
  tool({
    name: "get_source_stats",
    description: "Detailed stats of one income source (totals, monthly series, events).",
    module: "income",
    write: false,
    schema: z.object({ sourceId: z.string().uuid("Neplatné sourceId – použij id z list_income_sources") }),
    run: (u, i) => income.getSourceStats(u, i.sourceId),
  }),
  tool({
    name: "get_event_analytics",
    description: "Event analytics: best/worst events, average profit per event and per day.",
    module: "income",
    write: false,
    schema: z.object({ sourceId: z.string().uuid("Neplatné sourceId – použij id z list_income_sources").optional(), year: z.number().int().min(1990).max(2100).optional() }),
    run: (u, i) => income.getEventAnalytics(u, i),
  }),
  tool({
    name: "list_recurring_rules",
    description: "Recurring income/expense rules (e.g. monthly rent).",
    module: "income",
    write: false,
    schema: z.object({ sourceId: z.string().uuid("Neplatné sourceId – použij id z list_income_sources").optional() }),
    run: (u, i) => income.listRecurringRules(u, i.sourceId),
  }),
  tool({
    name: "list_income_categories",
    description: "Categories used for income and expenses.",
    module: "income",
    write: false,
    schema: z.object({}),
    run: (u) => income.listCategories(u),
  }),
  tool({
    name: "get_asset",
    description: "One asset in detail: position stats, transactions, tax lots (3-year test), price history.",
    module: "portfolio",
    write: false,
    schema: z.object({ assetId: z.string() }),
    run: (u, i) => portfolio.getAsset(u, i.assetId),
  }),
  tool({
    name: "list_liabilities",
    description: "Liabilities (mortgage, loans) with balances.",
    module: "portfolio",
    write: false,
    schema: z.object({}),
    run: (u) => portfolio.listLiabilities(u),
  }),
  tool({
    name: "search_instruments",
    description: "Search stocks/ETFs (Yahoo) or crypto (CoinGecko) to get the externalId for create_asset.",
    module: "portfolio",
    write: false,
    schema: z.object({ assetClass: z.enum(["stock", "etf", "crypto"]), query: z.string() }),
    run: (_u, i) => portfolio.searchInstruments(i.assetClass, i.query),
  }),

  /* ═════════════ Extended write access ═════════════ */
  tool({
    name: "start_workout",
    description:
      "Start a workout (from a program day id, or empty with a name). Returns the workout id; resumes an unfinished one if it exists. Pass date (YYYY-MM-DD, past) to log a workout done on an earlier day: then log its sets with log_set and call finish_workout – it stays dated on that day.",
    module: "workout",
    write: true,
    schema: z.object({ programDayId: z.string().optional(), name: z.string().optional(), date: date.optional() }),
    summarize: (i) => `${i.date && i.date !== isoDate() ? `Zapsat trénink z ${i.date}` : "Začít trénink"}${i.name ? ` „${i.name}“` : ""}`,
    run: (u, i) => workout.startWorkout(u, i),
  }),
  tool({
    name: "log_set",
    description: "Log or update a set in a workout. exerciseOrder = position of the exercise in the workout (0-based), setNumber starts at 1. Pass id to update an existing set.",
    module: "workout",
    write: true,
    schema: z.object({
      workoutId: z.string(),
      id: z.string().optional(),
      exerciseId: z.string(),
      exerciseName: z.string().describe("For the approval card"),
      exerciseOrder: z.number().int().min(0),
      setNumber: z.number().int().min(1),
      weightKg: z.number().min(0),
      reps: z.number().int().min(0),
      rpe: z.number().optional(),
      isWarmup: z.boolean().optional(),
    }),
    summarize: (i) => `${i.exerciseName}: série ${i.setNumber} – ${i.weightKg} kg × ${i.reps}`,
    run: (u, { workoutId, exerciseName: _n, ...set }) => workout.logSet(u, workoutId, { ...set, completed: true }),
  }),
  tool({
    name: "finish_workout",
    description: "Finish a workout (removes uncompleted sets). Returns summary with PRs.",
    module: "workout",
    write: true,
    schema: z.object({ workoutId: z.string(), notes: z.string().optional() }),
    summarize: () => "Dokončit trénink",
    run: (u, i) => workout.finishWorkout(u, i.workoutId, { notes: i.notes }),
  }),
  tool({
    name: "delete_workout",
    description: "Delete a workout and its sets.",
    module: "workout",
    write: true,
    schema: z.object({ workoutId: z.string(), label: z.string() }),
    summarize: (i) => `Smazat trénink ${i.label}`,
    run: (u, i) => workout.deleteWorkout(u, i.workoutId),
  }),
  tool({
    name: "clone_program_template",
    description: "Create a program from a built-in template (key from list_program_templates: ppl, upper-lower, fullbody).",
    module: "workout",
    write: true,
    schema: z.object({ key: z.string() }),
    summarize: (i) => `Vytvořit program ze šablony ${i.key}`,
    run: (u, i) => workout.cloneProgramTemplate(u, i.key),
  }),
  tool({
    name: "set_active_program",
    description: "Make a program the active one (drives today's plan).",
    module: "workout",
    write: true,
    schema: z.object({ programId: z.string(), programName: z.string() }),
    summarize: (i) => `Aktivovat program „${i.programName}“`,
    run: (u, i) => workout.setActiveProgram(u, i.programId),
  }),
  tool({
    name: "update_program",
    description: "Rename a program or change its description.",
    module: "workout",
    write: true,
    schema: z.object({ programId: z.string(), name: z.string().optional(), description: z.string().optional() }),
    summarize: (i) => `Upravit program${i.name ? ` → „${i.name}“` : ""}`,
    run: (u, { programId, ...patch }) => workout.updateProgram(u, programId, patch),
  }),
  tool({
    name: "delete_program",
    description: "Delete a program (workout history is kept).",
    module: "workout",
    write: true,
    schema: z.object({ programId: z.string(), programName: z.string() }),
    summarize: (i) => `Smazat program „${i.programName}“`,
    run: (u, i) => workout.deleteProgram(u, i.programId),
  }),
  tool({
    name: "add_program_day",
    description: "Add a training day to a program.",
    module: "workout",
    write: true,
    schema: z.object({ programId: z.string(), name: z.string(), weekday: z.number().int().min(1).max(7).optional() }),
    summarize: (i) => `Přidat den „${i.name}“`,
    run: (u, { programId, ...d }) => workout.addProgramDay(u, programId, d),
  }),
  tool({
    name: "update_program_day",
    description: "Rename a program day or PERMANENTLY change its weekday (1=Mon…7=Sun, null = flexible). For a one-week change use move_training_day.",
    module: "workout",
    write: true,
    schema: z.object({ dayId: z.string(), name: z.string().optional(), weekday: z.number().int().min(1).max(7).nullable().optional() }),
    summarize: (i) => `Upravit den${i.name ? ` „${i.name}“` : ""}`,
    run: (u, { dayId, ...patch }) => workout.updateProgramDay(u, dayId, patch),
  }),
  tool({
    name: "move_training_day",
    description:
      "Move a training day to another weekday FOR ONE WEEK ONLY (e.g. missed Monday's session → do it on Tuesday). Resets automatically next week; the program itself is unchanged. toWeekday null = skip it this week. If another day is already planned on the target weekday they swap places (swap=false keeps both on that day). Prefer this over update_program_day when the user is rescheduling just this week.",
    module: "workout",
    write: true,
    schema: z.object({
      dayId: z.string(),
      dayName: z.string(),
      toWeekday: z.number().int().min(1).max(7).nullable().describe("1=Monday … 7=Sunday, null = skip this week"),
      swap: z.boolean().optional(),
      date: date.optional().describe("Any date in the week to change; default this week"),
    }),
    summarize: (i) =>
      i.toWeekday == null
        ? `Tento týden vynechat „${i.dayName}“`
        : `Tento týden přesunout „${i.dayName}“ na ${["pondělí", "úterý", "středu", "čtvrtek", "pátek", "sobotu", "neděli"][i.toWeekday - 1]}`,
    run: (u, i) => workout.moveProgramDayThisWeek(u, i.dayId, i.toWeekday, { date: i.date, swap: i.swap }),
  }),
  tool({
    name: "swap_training_days",
    description: "Swap the weekdays of two training days of the same program FOR ONE WEEK ONLY (resets next week).",
    module: "workout",
    write: true,
    schema: z.object({
      dayIdA: z.string(),
      dayNameA: z.string(),
      dayIdB: z.string(),
      dayNameB: z.string(),
      date: date.optional().describe("Any date in the week to change; default this week"),
    }),
    summarize: (i) => `Tento týden prohodit „${i.dayNameA}“ ↔ „${i.dayNameB}“`,
    run: (u, i) => workout.swapProgramDaysThisWeek(u, i.dayIdA, i.dayIdB, { date: i.date }),
  }),
  tool({
    name: "reset_week_plan",
    description: "Undo all one-week moves/swaps/skips for a week, back to the program's normal weekdays.",
    module: "workout",
    write: true,
    schema: z.object({ date: date.optional().describe("Any date in the week; default this week") }),
    summarize: () => "Vrátit týdenní rozvrh do původního stavu",
    run: (u, i) => workout.resetWeekPlan(u, { date: i.date }),
  }),
  tool({
    name: "remove_program_day",
    description: "Remove a day (and its exercises) from a program.",
    module: "workout",
    write: true,
    schema: z.object({ dayId: z.string(), dayName: z.string() }),
    summarize: (i) => `Odebrat den „${i.dayName}“`,
    run: (u, i) => workout.removeProgramDay(u, i.dayId),
  }),
  tool({
    name: "create_exercise",
    description: "Create a custom exercise. primaryMuscle: chest|back|shoulders|biceps|triceps|quads|hamstrings|glutes|calves|abs|forearms. equipment: barbell|dumbbell|machine|cable|bodyweight|kettlebell|band|smith|other.",
    module: "workout",
    write: true,
    schema: z.object({
      name: z.string(),
      primaryMuscle: z.string(),
      secondaryMuscles: z.array(z.string()).optional(),
      pattern: z.string(),
      equipment: z.enum(["barbell", "dumbbell", "machine", "cable", "bodyweight", "kettlebell", "band", "smith", "other"]),
      isUnilateral: z.boolean().optional(),
      notes: z.string().optional(),
    }),
    summarize: (i) => `Nový cvik „${i.name}“`,
    run: (u, i) => workout.createExercise(u, i),
  }),
  tool({
    name: "log_body_metrics",
    description: "Record body metrics for a date (weight, body fat %, waist).",
    module: "workout",
    write: true,
    schema: z.object({ date: date.optional(), weightKg: z.number().optional(), bodyFatPct: z.number().optional(), waistCm: z.number().optional() }),
    summarize: (i) => `Tělo ${i.date ?? "dnes"}: ${[i.weightKg && `${i.weightKg} kg`, i.bodyFatPct && `${i.bodyFatPct} % tuku`, i.waistCm && `pas ${i.waistCm} cm`].filter(Boolean).join(", ")}`,
    run: (u, i) => workout.logBodyMetric(u, { ...i, date: i.date ?? isoDate() }),
  }),
  tool({
    name: "log_food_by_grams",
    description: "Log a known food (foodId from search_foods / list_my_foods / recent_foods) by grams; nutrients are computed from per-100 g values. For Open Food Facts hits with id null use log_food instead.",
    module: "nutrition",
    write: true,
    schema: z.object({ date: date.optional(), mealType, foodId: z.string(), foodName: z.string(), grams: z.number().positive() }),
    summarize: (i) => `Zapsat ${i.foodName} ${i.grams} g`,
    run: (u, { foodName: _n, ...i }) => nutrition.logFoodByGrams(u, { ...i, date: i.date ?? isoDate() }),
  }),
  tool({
    name: "update_food_log",
    description: "Change grams or meal of a logged entry.",
    module: "nutrition",
    write: true,
    schema: z.object({ id: z.string(), label: z.string(), grams: z.number().positive().optional(), mealType: mealType.optional() }),
    summarize: (i) => `Upravit ${i.label}${i.grams ? ` → ${i.grams} g` : ""}`,
    run: (u, { id, label: _l, ...d }) => nutrition.updateFoodLog(u, id, d),
  }),
  tool({
    name: "delete_food_log",
    description: "Delete a logged food entry.",
    module: "nutrition",
    write: true,
    schema: z.object({ id: z.string(), label: z.string() }),
    summarize: (i) => `Smazat záznam ${i.label}`,
    run: (u, i) => nutrition.deleteFoodLog(u, i.id),
  }),
  tool({
    name: "copy_food_day",
    description: "Copy all food entries from one day to another.",
    module: "nutrition",
    write: true,
    schema: z.object({ fromDate: date, toDate: date }),
    summarize: (i) => `Zkopírovat jídla ${i.fromDate} → ${i.toDate}`,
    run: (u, i) => nutrition.copyDay(u, i.fromDate, i.toDate),
  }),
  tool({
    name: "add_water",
    description: "Add (or with negative ml remove) water intake.",
    module: "nutrition",
    write: true,
    schema: z.object({ date: date.optional(), ml: z.number().int() }),
    summarize: (i) => `Voda ${i.ml > 0 ? "+" : ""}${i.ml} ml`,
    run: (u, i) => nutrition.addWater(u, i.date ?? isoDate(), i.ml),
  }),
  tool({
    name: "update_nutrition_profile",
    description: "Update nutrition profile (only the given fields): sex (male|female), birthDate, heightCm (100-250), activityLevel (sedentary|light|moderate|active|very_active), goal (lose|maintain|gain), rateKgPerWeek (0-1.5), proteinPerKg (0.5-4), fatPct (0.1-0.6), kcalOverride (800-8000, null = computed).",
    module: "nutrition",
    write: true,
    // same limits as the profile form's server action
    schema: z.object(nutritionProfileShape(() => z.number())).partial(),
    summarize: (i) => `Upravit profil výživy: ${Object.entries(i).map(([k, v]) => `${k}=${v}`).join(", ")}`,
    run: (u, i) => nutrition.updateProfile(u, i),
  }),
  tool({
    name: "create_food",
    description: "Create a custom food (values per 100 g: kcal 0-1000, protein/carbs/fat/fiber/sugar/salt 0-100 g; servingG 0-5000).",
    module: "nutrition",
    write: true,
    // same limits as the food form's server action
    schema: z.object(nutritionFoodShape(() => z.number())),
    summarize: (i) => `Nová potravina „${i.name}“ (${i.kcal} kcal/100 g)`,
    run: (u, i) => nutrition.createFood(u, i),
  }),
  tool({
    name: "create_income_source",
    description: "Create an income source (type: business|rental|investment|job|other).",
    module: "income",
    write: true,
    schema: z.object({ name: z.string(), type: z.enum(["business", "rental", "investment", "job", "other"]), currency: z.string().length(3).optional(), notes: z.string().optional() }),
    summarize: (i) => `Nový zdroj příjmů „${i.name}“`,
    run: (u, i) => income.createSource(u, i),
  }),
  tool({
    name: "update_transaction",
    description: "Edit an income/expense transaction.",
    module: "income",
    write: true,
    schema: z.object({
      id: z.string().uuid("Neplatné id transakce – použij id z list_transactions"),
      label: z.string(),
      kind: z.enum(["income", "expense"]).optional(),
      amount: z.number().positive().optional(),
      currency: z.string().length(3).optional(),
      date: date.optional(),
      sourceId: z.string().uuid("Neplatné sourceId – použij id z list_income_sources").nullable().optional(),
      eventId: z.string().uuid("Neplatné eventId – použij id z list_events").nullable().optional(),
      category: z.string().optional(),
      note: z.string().optional(),
    }),
    summarize: (i) => `Upravit transakci ${i.label}`,
    run: (u, { id, label: _l, ...patch }) => income.updateTransaction(u, id, patch),
  }),
  tool({
    name: "delete_transaction",
    description: "Delete an income/expense transaction.",
    module: "income",
    write: true,
    schema: z.object({ id: z.string().uuid("Neplatné id transakce – použij id z list_transactions"), label: z.string() }),
    summarize: (i) => `Smazat transakci ${i.label}`,
    run: (u, i) => income.deleteTransaction(u, i.id),
  }),
  tool({
    name: "update_event",
    description: "Edit a business event.",
    module: "income",
    write: true,
    schema: z.object({
      eventId: z.string().uuid("Neplatné eventId – použij id z list_events"),
      name: z.string().optional(),
      location: z.string().nullable().optional(),
      startDate: date.optional(),
      endDate: date.nullable().optional().describe("null clears the end date (one-day event)"),
      notes: z.string().nullable().optional(),
    }),
    summarize: (i) => `Upravit event${i.name ? ` „${i.name}“` : ""}`,
    run: (u, { eventId, ...patch }) => income.updateEvent(u, eventId, patch),
  }),
  tool({
    name: "create_recurring_rule",
    description: "Create a recurring monthly income/expense (e.g. rent on day 5).",
    module: "income",
    write: true,
    schema: z.object({
      sourceId: z.string().uuid("Neplatné sourceId – použij id z list_income_sources").optional(),
      kind: z.enum(["income", "expense"]),
      amount: z.number().positive(),
      currency: z.string().length(3).optional(),
      dayOfMonth: z.number().int().min(1).max(31),
      category: z.string().optional(),
      note: z.string().optional(),
    }),
    summarize: (i) => `Opakovaně každý měsíc ${i.dayOfMonth}.: ${i.kind === "income" ? "příjem" : "výdaj"} ${i.amount} ${i.currency ?? "CZK"}`,
    run: async (u, i) => {
      const rule = await income.createRecurringRule(u, i);
      // materialise already-due months right away (same as opening the income page)
      const { created } = await income.generateRecurring(u);
      return { ...rule, generatedTransactions: created };
    },
  }),
  tool({
    name: "create_asset",
    description: "Add an asset. For stock/etf use priceSource 'yahoo' + externalId (Yahoo symbol), crypto 'coingecko' + coin id (from search_instruments); cash/real_estate/other use 'manual' and then a 'valuation' transaction.",
    module: "portfolio",
    write: true,
    schema: z.object({
      class: z.enum(["stock", "etf", "crypto", "cash", "real_estate", "commodity", "bond", "other"]),
      name: z.string(),
      symbol: z.string().optional(),
      currency: z.string().length(3).optional(),
      priceSource: z.enum(["manual", "coingecko", "yahoo"]).optional(),
      externalId: z.string().optional(),
      targetPct: z.number().optional(),
      notes: z.string().optional(),
    }),
    summarize: (i) => `Nové aktivum „${i.name}“`,
    run: (u, i) => portfolio.createAsset(u, i),
  }),
  tool({
    name: "update_asset",
    description: "Edit an asset (name, symbol, target allocation %, notes, archived).",
    module: "portfolio",
    write: true,
    schema: z.object({ assetId: z.string(), name: z.string().optional(), symbol: z.string().optional(), targetPct: z.number().nullable().optional(), notes: z.string().optional(), archived: z.boolean().optional() }),
    summarize: (i) => `Upravit aktivum${i.name ? ` „${i.name}“` : ""}`,
    run: (u, { assetId, ...patch }) => portfolio.updateAsset(u, assetId, patch),
  }),
  tool({
    name: "delete_asset_transaction",
    description: "Delete an asset transaction (linked income entry is removed too).",
    module: "portfolio",
    write: true,
    schema: z.object({ id: z.string(), label: z.string() }),
    summarize: (i) => `Smazat transakci ${i.label}`,
    run: (u, i) => portfolio.deleteAssetTransaction(u, i.id),
  }),
  tool({
    name: "upsert_liability",
    description: "Create or update a liability (omit id to create).",
    module: "portfolio",
    write: true,
    schema: z.object({ id: z.string().optional(), name: z.string(), balance: z.number(), currency: z.string().length(3).optional(), interestRate: z.number().optional(), notes: z.string().optional() }),
    summarize: (i) => `${i.id ? "Upravit" : "Nový"} závazek „${i.name}“: ${i.balance.toLocaleString("cs-CZ")} ${i.currency ?? "CZK"}`,
    run: (u, i) => portfolio.upsertLiability(u, i),
  }),
  tool({
    name: "refresh_prices",
    description: "Fetch current prices for all market-priced assets now.",
    module: "portfolio",
    write: true,
    schema: z.object({}),
    summarize: () => "Aktualizovat ceny aktiv",
    run: (u) => portfolio.refreshPrices(u),
  })
];

export const TOOL_MAP = new Map(TOOLS.map((t) => [t.name, t]));

export function toolsForModule(module: string) {
  // the assistant always has everything; modules only change the system prompt focus
  void module;
  return TOOLS;
}

export function jsonSchema(def: ToolDef) {
  const s = z.toJSONSchema(def.schema, { target: "draft-7" }) as Record<string, unknown>;
  delete s.$schema;
  return s as { type: "object"; properties?: Record<string, unknown>; required?: string[] };
}

export async function runTool(userId: string, name: string, rawInput: unknown) {
  const def = TOOL_MAP.get(name);
  if (!def) throw new Error(`Unknown tool ${name}`);
  const parsed = def.schema.safeParse(rawInput ?? {});
  if (!parsed.success) throw new Error(`Invalid input: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  return def.run(userId, parsed.data);
}

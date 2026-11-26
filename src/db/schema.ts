import {
  pgTable,
  text,
  uuid,
  timestamp,
  integer,
  boolean,
  doublePrecision,
  numeric,
  date,
  jsonb,
  primaryKey,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const money = (name: string) => numeric(name, { precision: 16, scale: 4, mode: "number" });
const userRef = () =>
  uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" });

/* ───────────────────────────── Auth & profile ───────────────────────────── */

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name"),
  createdAt: createdAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(), // sha256 of the cookie token
    userId: userRef(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** Personal API keys and OAuth access tokens (OAuth rows have clientId, expiresAt and refreshHash). */
export const apiKeys = pgTable("api_keys", {
  id: id(),
  userId: userRef(),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  prefix: text("prefix").notNull(),
  clientId: text("client_id"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  refreshHash: text("refresh_hash").unique(),
  refreshExpiresAt: timestamp("refresh_expires_at", { withTimezone: true }),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: createdAt(),
});

/** OAuth 2.1 clients registered dynamically (RFC 7591), e.g. Claude's MCP connector. */
export const oauthClients = pgTable("oauth_clients", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  redirectUris: text("redirect_uris").array().notNull(),
  createdAt: createdAt(),
});

export const oauthCodes = pgTable("oauth_codes", {
  codeHash: text("code_hash").primaryKey(),
  clientId: text("client_id")
    .notNull()
    .references(() => oauthClients.id, { onDelete: "cascade" }),
  userId: userRef(),
  redirectUri: text("redirect_uri").notNull(),
  codeChallenge: text("code_challenge").notNull(),
  scope: text("scope"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const profiles = pgTable("profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  sex: text("sex").$type<"male" | "female">(),
  birthDate: date("birth_date"),
  heightCm: doublePrecision("height_cm"),
  activityLevel: text("activity_level")
    .$type<"sedentary" | "light" | "moderate" | "active" | "very_active">()
    .default("moderate"),
  goal: text("goal").$type<"lose" | "maintain" | "gain">().default("maintain"),
  rateKgPerWeek: doublePrecision("rate_kg_per_week").default(0.5),
  proteinPerKg: doublePrecision("protein_per_kg").default(2),
  fatPct: doublePrecision("fat_pct").default(0.25),
  // manual overrides of computed targets (null = computed)
  kcalOverride: integer("kcal_override"),
  currency: text("currency").notNull().default("CZK"),
  stagnationSessions: integer("stagnation_sessions").notNull().default(3),
  defaultRestSeconds: integer("default_rest_seconds").notNull().default(120),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const bodyMetrics = pgTable(
  "body_metrics",
  {
    id: id(),
    userId: userRef(),
    date: date("date").notNull(),
    weightKg: doublePrecision("weight_kg"),
    bodyFatPct: doublePrecision("body_fat_pct"),
    waistCm: doublePrecision("waist_cm"),
    sleepHours: doublePrecision("sleep_hours"),
    steps: integer("steps"),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("body_metrics_user_date").on(t.userId, t.date)],
);

/* ──────────────────────────────── Workout ──────────────────────────────── */

export type Equipment =
  | "barbell"
  | "dumbbell"
  | "machine"
  | "cable"
  | "bodyweight"
  | "kettlebell"
  | "band"
  | "smith"
  | "other";

export const exercises = pgTable(
  "exercises",
  {
    id: id(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }), // null = built-in
    name: text("name").notNull(),
    primaryMuscle: text("primary_muscle").notNull(), // chest, back, shoulders, biceps, triceps, quads, hamstrings, glutes, calves, abs, forearms
    secondaryMuscles: text("secondary_muscles").array().notNull().default([]),
    pattern: text("pattern").notNull(), // horizontal_push, vertical_push, horizontal_pull, vertical_pull, squat, hinge, lunge, isolation_*, core, carry
    equipment: text("equipment").$type<Equipment>().notNull(),
    isUnilateral: boolean("is_unilateral").notNull().default(false),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [index("exercises_user_idx").on(t.userId)],
);

export const programs = pgTable("programs", {
  id: id(),
  userId: userRef(),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: createdAt(),
});

export const programDays = pgTable("program_days", {
  id: id(),
  programId: uuid("program_id")
    .notNull()
    .references(() => programs.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  order: integer("order").notNull().default(0),
  weekday: integer("weekday"), // 1 = Monday … 7 = Sunday, null = flexible
});

export const programExercises = pgTable("program_exercises", {
  id: id(),
  dayId: uuid("day_id")
    .notNull()
    .references(() => programDays.id, { onDelete: "cascade" }),
  exerciseId: uuid("exercise_id")
    .notNull()
    .references(() => exercises.id, { onDelete: "cascade" }),
  order: integer("order").notNull().default(0),
  sets: integer("sets").notNull().default(3),
  repMin: integer("rep_min").notNull().default(8),
  repMax: integer("rep_max").notNull().default(12),
  restSeconds: integer("rest_seconds"),
  targetRpe: doublePrecision("target_rpe"),
  incrementKg: doublePrecision("increment_kg").notNull().default(2.5),
  progression: text("progression").$type<"double" | "none">().notNull().default("double"),
  notes: text("notes"),
});

export const workouts = pgTable(
  "workouts",
  {
    id: id(),
    userId: userRef(),
    programDayId: uuid("program_day_id").references(() => programDays.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [index("workouts_user_started").on(t.userId, t.startedAt)],
);

export const workoutSets = pgTable(
  "workout_sets",
  {
    id: id(),
    workoutId: uuid("workout_id")
      .notNull()
      .references(() => workouts.id, { onDelete: "cascade" }),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    exerciseOrder: integer("exercise_order").notNull().default(0),
    setNumber: integer("set_number").notNull().default(1),
    weightKg: doublePrecision("weight_kg").notNull().default(0),
    reps: integer("reps").notNull().default(0),
    rpe: doublePrecision("rpe"),
    isWarmup: boolean("is_warmup").notNull().default(false),
    completed: boolean("completed").notNull().default(true),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [
    index("workout_sets_workout_idx").on(t.workoutId),
    index("workout_sets_exercise_idx").on(t.exerciseId),
  ],
);

/* ─────────────────────────────── Nutrition ─────────────────────────────── */

export const foods = pgTable(
  "foods",
  {
    id: id(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }), // null = shared cache (e.g. Open Food Facts)
    name: text("name").notNull(),
    brand: text("brand"),
    ean: text("ean"),
    source: text("source").$type<"off" | "custom" | "ai">().notNull().default("custom"),
    // values per 100 g
    kcal: doublePrecision("kcal").notNull().default(0),
    protein: doublePrecision("protein").notNull().default(0),
    carbs: doublePrecision("carbs").notNull().default(0),
    fat: doublePrecision("fat").notNull().default(0),
    fiber: doublePrecision("fiber"),
    sugar: doublePrecision("sugar"),
    salt: doublePrecision("salt"),
    servingG: doublePrecision("serving_g"),
    isFavorite: boolean("is_favorite").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("foods_ean_idx").on(t.ean), index("foods_user_idx").on(t.userId)],
);

export const foodLogs = pgTable(
  "food_logs",
  {
    id: id(),
    userId: userRef(),
    date: date("date").notNull(),
    mealType: text("meal_type").$type<"breakfast" | "lunch" | "dinner" | "snack">().notNull().default("snack"),
    foodId: uuid("food_id").references(() => foods.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    grams: doublePrecision("grams"),
    // absolute values for this entry (snapshot)
    kcal: doublePrecision("kcal").notNull().default(0),
    protein: doublePrecision("protein").notNull().default(0),
    carbs: doublePrecision("carbs").notNull().default(0),
    fat: doublePrecision("fat").notNull().default(0),
    fiber: doublePrecision("fiber"),
    source: text("source").$type<"food" | "ai_photo" | "ai_text" | "quick">().notNull().default("food"),
    createdAt: createdAt(),
  },
  (t) => [index("food_logs_user_date").on(t.userId, t.date)],
);

export const waterLogs = pgTable(
  "water_logs",
  {
    id: id(),
    userId: userRef(),
    date: date("date").notNull(),
    ml: integer("ml").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("water_logs_user_date").on(t.userId, t.date)],
);

/* ──────────────────────────────── Income ──────────────────────────────── */

export type IncomeSourceType = "business" | "rental" | "investment" | "job" | "other";

export const incomeSources = pgTable("income_sources", {
  id: id(),
  userId: userRef(),
  name: text("name").notNull(),
  type: text("type").$type<IncomeSourceType>().notNull().default("business"),
  currency: text("currency").notNull().default("CZK"),
  archived: boolean("archived").notNull().default(false),
  notes: text("notes"),
  createdAt: createdAt(),
});

export const events = pgTable(
  "events",
  {
    id: id(),
    userId: userRef(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => incomeSources.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    location: text("location"),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [index("events_source_idx").on(t.sourceId)],
);

export const recurringRules = pgTable("recurring_rules", {
  id: id(),
  userId: userRef(),
  sourceId: uuid("source_id").references(() => incomeSources.id, { onDelete: "cascade" }),
  kind: text("kind").$type<"income" | "expense">().notNull().default("income"),
  amount: money("amount").notNull(),
  currency: text("currency").notNull().default("CZK"),
  dayOfMonth: integer("day_of_month").notNull().default(1),
  category: text("category"),
  note: text("note"),
  active: boolean("active").notNull().default(true),
  lastGeneratedMonth: text("last_generated_month"), // YYYY-MM
  createdAt: createdAt(),
});

export const transactions = pgTable(
  "transactions",
  {
    id: id(),
    userId: userRef(),
    sourceId: uuid("source_id").references(() => incomeSources.id, { onDelete: "set null" }),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
    assetId: uuid("asset_id").references(() => assets.id, { onDelete: "set null" }),
    recurringRuleId: uuid("recurring_rule_id").references(() => recurringRules.id, { onDelete: "set null" }),
    kind: text("kind").$type<"income" | "expense">().notNull().default("income"),
    amount: money("amount").notNull(),
    currency: text("currency").notNull().default("CZK"),
    fxRate: doublePrecision("fx_rate").notNull().default(1), // CZK per 1 unit of currency
    amountCzk: money("amount_czk").notNull(),
    date: date("date").notNull(),
    category: text("category"),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [
    index("transactions_user_date").on(t.userId, t.date),
    index("transactions_source_idx").on(t.sourceId),
    index("transactions_event_idx").on(t.eventId),
  ],
);

/* ─────────────────────────────── Portfolio ─────────────────────────────── */

export type AssetClass = "stock" | "etf" | "crypto" | "cash" | "real_estate" | "commodity" | "bond" | "other";

export const assets = pgTable("assets", {
  id: id(),
  userId: userRef(),
  name: text("name").notNull(),
  symbol: text("symbol"),
  class: text("class").$type<AssetClass>().notNull().default("stock"),
  currency: text("currency").notNull().default("CZK"),
  priceSource: text("price_source").$type<"manual" | "coingecko" | "yahoo">().notNull().default("manual"),
  externalId: text("external_id"), // coingecko id (e.g. "bitcoin") or yahoo ticker (e.g. "VWCE.DE")
  lastPrice: numeric("last_price", { precision: 24, scale: 10, mode: "number" }), // in asset currency, per unit
  lastPriceAt: timestamp("last_price_at", { withTimezone: true }),
  targetPct: doublePrecision("target_pct"), // target allocation (0-100)
  archived: boolean("archived").notNull().default(false),
  notes: text("notes"),
  createdAt: createdAt(),
});

export const assetTransactions = pgTable(
  "asset_transactions",
  {
    id: id(),
    userId: userRef(),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    // buy/sell: quantity × price; dividend/withdrawal: amount; valuation: sets manual price
    type: text("type").$type<"buy" | "sell" | "dividend" | "fee" | "withdrawal" | "valuation">().notNull(),
    date: date("date").notNull(),
    quantity: doublePrecision("quantity").notNull().default(0),
    price: numeric("price", { precision: 24, scale: 10, mode: "number" }).notNull().default(0), // per unit, asset currency
    fee: money("fee").notNull().default(0),
    amount: money("amount").notNull().default(0), // total in asset currency
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("asset_tx_asset_idx").on(t.assetId)],
);

export const priceHistory = pgTable(
  "price_history",
  {
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    price: numeric("price", { precision: 24, scale: 10, mode: "number" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.assetId, t.date] })],
);

export const liabilities = pgTable("liabilities", {
  id: id(),
  userId: userRef(),
  name: text("name").notNull(),
  balance: money("balance").notNull(),
  currency: text("currency").notNull().default("CZK"),
  interestRate: doublePrecision("interest_rate"),
  notes: text("notes"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const fxRates = pgTable(
  "fx_rates",
  {
    date: date("date").notNull(),
    currency: text("currency").notNull(),
    rate: doublePrecision("rate").notNull(), // CZK per 1 unit
  },
  (t) => [primaryKey({ columns: [t.date, t.currency] })],
);

export const netWorthSnapshots = pgTable(
  "net_worth_snapshots",
  {
    id: id(),
    userId: userRef(),
    date: date("date").notNull(),
    assetsCzk: money("assets_czk").notNull(),
    liabilitiesCzk: money("liabilities_czk").notNull(),
    netCzk: money("net_czk").notNull(),
  },
  (t) => [uniqueIndex("net_worth_user_date").on(t.userId, t.date)],
);

/* ─────────────────────────────────── AI ─────────────────────────────────── */

export const aiConversations = pgTable("ai_conversations", {
  id: id(),
  userId: userRef(),
  module: text("module").notNull().default("general"), // general | workout | nutrition | income | portfolio
  title: text("title").notNull().default("Nová konverzace"),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const aiMessages = pgTable(
  "ai_messages",
  {
    id: id(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => aiConversations.id, { onDelete: "cascade" }),
    role: text("role").$type<"user" | "assistant">().notNull(),
    content: jsonb("content").notNull(), // Anthropic content blocks
    createdAt: createdAt(),
  },
  (t) => [index("ai_messages_conv_idx").on(t.conversationId)],
);

export const aiActions = pgTable("ai_actions", {
  id: id(),
  userId: userRef(),
  conversationId: uuid("conversation_id").references(() => aiConversations.id, { onDelete: "set null" }),
  tool: text("tool").notNull(),
  input: jsonb("input").notNull(),
  summary: text("summary").notNull(),
  status: text("status").$type<"pending" | "applied" | "rejected" | "undone">().notNull().default("pending"),
  undoData: jsonb("undo_data"),
  createdAt: createdAt(),
});

/* ──────────────────────────────── System ──────────────────────────────── */

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: id(),
  userId: userRef(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: createdAt(),
});

export const goals = pgTable("goals", {
  id: id(),
  userId: userRef(),
  module: text("module").notNull(), // workout | nutrition | income | portfolio | body
  title: text("title").notNull(),
  metric: text("metric").notNull(), // e.g. "exercise_1rm:<exerciseId>", "income_year", "net_worth", "body_weight"
  target: doublePrecision("target").notNull(),
  deadline: date("deadline"),
  achievedAt: timestamp("achieved_at", { withTimezone: true }),
  createdAt: createdAt(),
});

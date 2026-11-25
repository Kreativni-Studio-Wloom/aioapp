import { and, asc, desc, eq, gte, isNull, lte, sql, type SQL } from "drizzle-orm";
import { db, t } from "@/db";
import { toCzk } from "@/lib/fx";
import { isoDate, MONTHS_CS } from "@/lib/format";
import { DEFAULT_CATEGORIES, EVENT_CATEGORIES, type IncomeSourceType, type TxKind } from "./constants";

/* ───────────────────────────── Types ───────────────────────────── */

export class IncomeError extends Error {}

export type Totals = { income: number; expense: number; net: number; margin: number | null; count: number };

export type Source = {
  id: string;
  name: string;
  type: IncomeSourceType;
  currency: string;
  archived: boolean;
  notes: string | null;
  createdAt: string;
};
export type SourceWithTotals = Source & Totals & { lastDate: string | null };

export type IncomeEvent = {
  id: string;
  sourceId: string;
  sourceName: string;
  name: string;
  location: string | null;
  startDate: string;
  endDate: string | null;
  notes: string | null;
  createdAt: string;
};
export type EventWithStats = IncomeEvent & Totals & { days: number; profitPerDay: number };

export type Tx = {
  id: string;
  kind: TxKind;
  amount: number;
  currency: string;
  fxRate: number;
  amountCzk: number;
  date: string;
  category: string | null;
  note: string | null;
  sourceId: string | null;
  sourceName: string | null;
  eventId: string | null;
  eventName: string | null;
  assetId: string | null;
  recurringRuleId: string | null;
  createdAt: string;
};

export type TransactionInput = {
  kind: TxKind;
  amount: number;
  currency?: string;
  date?: string;
  sourceId?: string | null;
  eventId?: string | null;
  assetId?: string | null;
  category?: string | null;
  note?: string | null;
};

export type TransactionFilter = {
  from?: string;
  to?: string;
  sourceId?: string | null; // "none" = transactions without a source
  eventId?: string;
  kind?: TxKind;
  category?: string;
  limit?: number;
  offset?: number;
};

export type RecurringRule = {
  id: string;
  sourceId: string | null;
  sourceName: string | null;
  kind: TxKind;
  amount: number;
  currency: string;
  dayOfMonth: number;
  category: string | null;
  note: string | null;
  active: boolean;
  lastGeneratedMonth: string | null;
  /** Date of the next transaction this rule will generate (null when paused). */
  nextDate: string | null;
  createdAt: string;
};

export type RecurringRuleInput = {
  sourceId?: string | null;
  kind: TxKind;
  amount: number;
  currency?: string;
  dayOfMonth: number;
  category?: string | null;
  note?: string | null;
  active?: boolean;
  /** YYYY-MM – first month to generate. Default: the next occurrence (this month if the day hasn't passed yet). */
  startMonth?: string;
};

export type MonthPoint = { month: string; label: string; income: number; expense: number; net: number };

export type Overview = {
  period: { kind: "month" | "year" | "all"; year: number | null; month: string | null; from: string | null; to: string | null; label: string };
  totals: Totals;
  /** Average monthly net over the elapsed months of the selected year (or the whole history for "all"). */
  avgMonthlyNet: number;
  avgMonthlyIncome: number;
  monthsCounted: number;
  /** Average monthly net over the trailing 12 months (incl. the current month; fewer if history is shorter). */
  avgMonthlyNet12m: number;
  /** Same period one year earlier (YTD vs YTD for the current year), null for "all". */
  comparison: (Totals & { label: string; netChangePct: number | null; incomeChangePct: number | null }) | null;
  monthly: MonthPoint[];
  bySource: { sourceId: string | null; name: string; type: IncomeSourceType | null; income: number; expense: number; net: number; pctOfIncome: number }[];
  byCategory: { kind: TxKind; category: string; total: number }[];
  topEvents: EventWithStats[];
  recent: Tx[];
  years: number[];
  /** Whether the user has any transaction at all. */
  hasData: boolean;
};

export type EventStats = {
  event: IncomeEvent;
  totals: Totals;
  days: number;
  profitPerDay: number;
  byCategory: { kind: TxKind; category: string; total: number }[];
  transactions: Tx[];
};

export type EventAnalytics = {
  count: number;
  totalNet: number;
  avgNet: number;
  avgProfitPerDay: number;
  avgMargin: number | null;
  best: EventWithStats[];
  worst: EventWithStats[];
  byNetPerDay: EventWithStats[];
};

/* ───────────────────────────── Helpers ───────────────────────────── */

const tx = t.transactions;

const sumKind = (kind: TxKind) =>
  sql<number>`coalesce(sum(case when ${tx.kind} = ${kind} then ${tx.amountCzk} else 0 end), 0)::float8`.mapWith(Number);
const countTx = () => sql<number>`count(${tx.id})::int`.mapWith(Number);

function totals(income: number, expense: number, count = 0): Totals {
  const net = income - expense;
  return { income, expense, net, margin: income > 0 ? (net / income) * 100 : null, count };
}

const ymOf = (iso: string) => iso.slice(0, 7);
export function addMonths(ym: string, n: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}
const daysInMonth = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};
/** Last day (YYYY-MM-DD) of a YYYY-MM month. */
export const monthEnd = (ym: string) => `${ym}-${daysInMonth(ym)}`;
const monthsBetween = (a: string, b: string) => {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return (by - ay) * 12 + (bm - am) + 1;
};
const monthLabel = (ym: string, withYear = false) => {
  const [y, m] = ym.split("-").map(Number);
  return withYear ? `${MONTHS_CS[m - 1]} ${String(y).slice(2)}` : MONTHS_CS[m - 1];
};
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5) + 1;
const changePct = (cur: number, prev: number) => (prev !== 0 ? ((cur - prev) / Math.abs(prev)) * 100 : null);
const clean = (s: string | null | undefined) => {
  const v = s?.trim();
  return v ? v : null;
};
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function checkDate(d: string) {
  if (!DATE_RE.test(d) || Number.isNaN(Date.parse(d))) throw new IncomeError("Neplatné datum");
  return d;
}

async function ownSource(userId: string, sourceId: string) {
  const [row] = await db
    .select()
    .from(t.incomeSources)
    .where(and(eq(t.incomeSources.id, sourceId), eq(t.incomeSources.userId, userId)))
    .limit(1);
  if (!row) throw new IncomeError("Zdroj nenalezen");
  return row;
}

async function ownEvent(userId: string, eventId: string) {
  const [row] = await db
    .select()
    .from(t.events)
    .where(and(eq(t.events.id, eventId), eq(t.events.userId, userId)))
    .limit(1);
  if (!row) throw new IncomeError("Akce nenalezena");
  return row;
}

async function ownAsset(userId: string, assetId: string) {
  const [row] = await db
    .select({ id: t.assets.id })
    .from(t.assets)
    .where(and(eq(t.assets.id, assetId), eq(t.assets.userId, userId)))
    .limit(1);
  if (!row) throw new IncomeError("Aktivum nenalezeno");
}

function mapSource(r: typeof t.incomeSources.$inferSelect): Source {
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    currency: r.currency,
    archived: r.archived,
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
  };
}

/* ───────────────────────────── Sources ───────────────────────────── */

export async function listSources(userId: string, opts: { includeArchived?: boolean } = {}): Promise<SourceWithTotals[]> {
  const rows = await db
    .select({
      source: t.incomeSources,
      income: sumKind("income"),
      expense: sumKind("expense"),
      count: countTx(),
      lastDate: sql<string | null>`max(${tx.date})::text`,
    })
    .from(t.incomeSources)
    .leftJoin(tx, eq(tx.sourceId, t.incomeSources.id))
    .where(and(eq(t.incomeSources.userId, userId), opts.includeArchived ? undefined : eq(t.incomeSources.archived, false)))
    .groupBy(t.incomeSources.id)
    .orderBy(asc(t.incomeSources.archived), asc(t.incomeSources.createdAt));
  return rows.map((r) => ({ ...mapSource(r.source), ...totals(r.income, r.expense, r.count), lastDate: r.lastDate }));
}

export async function getSource(userId: string, sourceId: string): Promise<Source> {
  return mapSource(await ownSource(userId, sourceId));
}

export async function createSource(
  userId: string,
  input: { name: string; type: IncomeSourceType; currency?: string; notes?: string | null },
): Promise<Source> {
  const name = clean(input.name);
  if (!name) throw new IncomeError("Zadej název");
  const [row] = await db
    .insert(t.incomeSources)
    .values({ userId, name, type: input.type, currency: (input.currency ?? "CZK").toUpperCase(), notes: clean(input.notes) })
    .returning();
  return mapSource(row);
}

export async function updateSource(
  userId: string,
  sourceId: string,
  patch: Partial<{ name: string; type: IncomeSourceType; currency: string; notes: string | null; archived: boolean }>,
): Promise<Source> {
  await ownSource(userId, sourceId);
  const set: Partial<typeof t.incomeSources.$inferInsert> = {};
  if (patch.name !== undefined) {
    const name = clean(patch.name);
    if (!name) throw new IncomeError("Zadej název");
    set.name = name;
  }
  if (patch.type !== undefined) set.type = patch.type;
  if (patch.currency !== undefined) set.currency = patch.currency.toUpperCase();
  if (patch.notes !== undefined) set.notes = clean(patch.notes);
  if (patch.archived !== undefined) set.archived = patch.archived;
  const [row] = await db
    .update(t.incomeSources)
    .set(set)
    .where(and(eq(t.incomeSources.id, sourceId), eq(t.incomeSources.userId, userId)))
    .returning();
  return mapSource(row);
}

export async function archiveSource(userId: string, sourceId: string, archived = true) {
  return updateSource(userId, sourceId, { archived });
}

/** Deletes a source with its events and recurring rules; its transactions are kept (without a source). */
export async function deleteSource(userId: string, sourceId: string) {
  await db.delete(t.incomeSources).where(and(eq(t.incomeSources.id, sourceId), eq(t.incomeSources.userId, userId)));
}

/* ───────────────────────────── Events ───────────────────────────── */

function withEventStats(e: IncomeEvent, income: number, expense: number, count: number): EventWithStats {
  const tt = totals(income, expense, count);
  const days = e.endDate && e.endDate >= e.startDate ? daysBetween(e.startDate, e.endDate) : 1;
  return { ...e, ...tt, days, profitPerDay: tt.net / days };
}

export async function listEvents(
  userId: string,
  sourceId?: string,
  opts: { from?: string; to?: string } = {},
): Promise<EventWithStats[]> {
  const where: (SQL | undefined)[] = [eq(t.events.userId, userId)];
  if (sourceId) where.push(eq(t.events.sourceId, sourceId));
  if (opts.from) where.push(gte(t.events.startDate, opts.from));
  if (opts.to) where.push(lte(t.events.startDate, opts.to));
  const rows = await db
    .select({
      event: t.events,
      sourceName: t.incomeSources.name,
      income: sumKind("income"),
      expense: sumKind("expense"),
      count: countTx(),
    })
    .from(t.events)
    .innerJoin(t.incomeSources, eq(t.incomeSources.id, t.events.sourceId))
    .leftJoin(tx, eq(tx.eventId, t.events.id))
    .where(and(...where))
    .groupBy(t.events.id, t.incomeSources.name)
    .orderBy(desc(t.events.startDate), desc(t.events.createdAt));
  return rows.map((r) => withEventStats(mapEvent(r.event, r.sourceName), r.income, r.expense, r.count));
}

function mapEvent(e: typeof t.events.$inferSelect, sourceName: string): IncomeEvent {
  return {
    id: e.id,
    sourceId: e.sourceId,
    sourceName,
    name: e.name,
    location: e.location,
    startDate: e.startDate,
    endDate: e.endDate,
    notes: e.notes,
    createdAt: e.createdAt.toISOString(),
  };
}

export type EventInput = {
  sourceId: string;
  name: string;
  location?: string | null;
  startDate: string;
  endDate?: string | null;
  notes?: string | null;
};

export async function createEvent(userId: string, input: EventInput): Promise<IncomeEvent> {
  const source = await ownSource(userId, input.sourceId);
  const name = clean(input.name);
  if (!name) throw new IncomeError("Zadej název akce");
  const startDate = checkDate(input.startDate);
  const endDate = input.endDate ? checkDate(input.endDate) : null;
  if (endDate && endDate < startDate) throw new IncomeError("Konec je před začátkem");
  const [row] = await db
    .insert(t.events)
    .values({ userId, sourceId: source.id, name, location: clean(input.location), startDate, endDate, notes: clean(input.notes) })
    .returning();
  return mapEvent(row, source.name);
}

export async function updateEvent(userId: string, eventId: string, patch: Partial<EventInput>): Promise<IncomeEvent> {
  const cur = await ownEvent(userId, eventId);
  const set: Partial<typeof t.events.$inferInsert> = {};
  if (patch.sourceId !== undefined && patch.sourceId !== cur.sourceId) set.sourceId = (await ownSource(userId, patch.sourceId)).id;
  if (patch.name !== undefined) {
    const name = clean(patch.name);
    if (!name) throw new IncomeError("Zadej název akce");
    set.name = name;
  }
  if (patch.location !== undefined) set.location = clean(patch.location);
  if (patch.notes !== undefined) set.notes = clean(patch.notes);
  if (patch.startDate !== undefined) set.startDate = checkDate(patch.startDate);
  if (patch.endDate !== undefined) set.endDate = patch.endDate ? checkDate(patch.endDate) : null;
  const start = set.startDate ?? cur.startDate;
  const end = set.endDate !== undefined ? set.endDate : cur.endDate;
  if (end && end < start) throw new IncomeError("Konec je před začátkem");
  const [row] = await db
    .update(t.events)
    .set(set)
    .where(and(eq(t.events.id, eventId), eq(t.events.userId, userId)))
    .returning();
  if (set.sourceId) {
    // keep the event's transactions consistent with its source
    await db.update(tx).set({ sourceId: set.sourceId }).where(and(eq(tx.eventId, eventId), eq(tx.userId, userId)));
  }
  const src = await ownSource(userId, row.sourceId);
  return mapEvent(row, src.name);
}

/** Deletes an event. Its transactions are deleted too when `withTransactions`, otherwise just unlinked. */
export async function deleteEvent(userId: string, eventId: string, opts: { withTransactions?: boolean } = {}) {
  await ownEvent(userId, eventId);
  if (opts.withTransactions) await db.delete(tx).where(and(eq(tx.eventId, eventId), eq(tx.userId, userId)));
  await db.delete(t.events).where(and(eq(t.events.id, eventId), eq(t.events.userId, userId)));
}

export async function getEventStats(userId: string, eventId: string): Promise<EventStats> {
  const e = await ownEvent(userId, eventId);
  const src = await ownSource(userId, e.sourceId);
  const event = mapEvent(e, src.name);
  const transactions = await listTransactions(userId, { eventId, limit: 1000 });
  let income = 0;
  let expense = 0;
  const cats = new Map<string, { kind: TxKind; category: string; total: number }>();
  for (const r of transactions) {
    if (r.kind === "income") income += r.amountCzk;
    else expense += r.amountCzk;
    const category = r.category ?? "Bez kategorie";
    const key = `${r.kind}:${category}`;
    const c = cats.get(key) ?? { kind: r.kind, category, total: 0 };
    c.total += r.amountCzk;
    cats.set(key, c);
  }
  const s = withEventStats(event, income, expense, transactions.length);
  return {
    event,
    totals: totals(income, expense, transactions.length),
    days: s.days,
    profitPerDay: s.profitPerDay,
    byCategory: [...cats.values()].sort((a, b) => (a.kind === b.kind ? b.total - a.total : a.kind === "income" ? -1 : 1)),
    transactions,
  };
}

export async function getEventAnalytics(userId: string, opts: { sourceId?: string; year?: number } = {}): Promise<EventAnalytics> {
  const range = opts.year ? { from: `${opts.year}-01-01`, to: `${opts.year}-12-31` } : {};
  const today = isoDate();
  // only events that already started count towards analytics
  const all = (await listEvents(userId, opts.sourceId, range)).filter((e) => e.startDate <= today && e.count > 0);
  const count = all.length;
  const totalNet = all.reduce((s, e) => s + e.net, 0);
  const totalDays = all.reduce((s, e) => s + e.days, 0);
  const margins = all.filter((e) => e.margin != null).map((e) => e.margin as number);
  const byNet = [...all].sort((a, b) => b.net - a.net);
  return {
    count,
    totalNet,
    avgNet: count ? totalNet / count : 0,
    avgProfitPerDay: totalDays ? totalNet / totalDays : 0,
    avgMargin: margins.length ? margins.reduce((a, b) => a + b, 0) / margins.length : null,
    best: byNet.slice(0, 5),
    worst: byNet.length > 5 ? byNet.slice(-3).reverse() : [],
    byNetPerDay: [...all].sort((a, b) => b.profitPerDay - a.profitPerDay).slice(0, 5),
  };
}

/* ───────────────────────────── Transactions ───────────────────────────── */

const txSelect = {
  tx,
  sourceName: t.incomeSources.name,
  eventName: t.events.name,
};

function mapTx(r: { tx: typeof tx.$inferSelect; sourceName: string | null; eventName: string | null }): Tx {
  const x = r.tx;
  return {
    id: x.id,
    kind: x.kind,
    amount: x.amount,
    currency: x.currency,
    fxRate: x.fxRate,
    amountCzk: x.amountCzk,
    date: x.date,
    category: x.category,
    note: x.note,
    sourceId: x.sourceId,
    sourceName: r.sourceName,
    eventId: x.eventId,
    eventName: r.eventName,
    assetId: x.assetId,
    recurringRuleId: x.recurringRuleId,
    createdAt: x.createdAt.toISOString(),
  };
}

async function getTx(userId: string, id: string): Promise<Tx> {
  const [row] = await db
    .select(txSelect)
    .from(tx)
    .leftJoin(t.incomeSources, eq(t.incomeSources.id, tx.sourceId))
    .leftJoin(t.events, eq(t.events.id, tx.eventId))
    .where(and(eq(tx.id, id), eq(tx.userId, userId)))
    .limit(1);
  if (!row) throw new IncomeError("Transakce nenalezena");
  return mapTx(row);
}

/** Resolve + validate links; an event implies its source. */
async function resolveLinks(userId: string, sourceId: string | null | undefined, eventId: string | null | undefined) {
  let src: typeof t.incomeSources.$inferSelect | null = null;
  let ev: typeof t.events.$inferSelect | null = null;
  if (eventId) {
    ev = await ownEvent(userId, eventId);
    if (sourceId && sourceId !== ev.sourceId) throw new IncomeError("Akce nepatří k vybranému zdroji");
    src = await ownSource(userId, ev.sourceId);
  } else if (sourceId) {
    src = await ownSource(userId, sourceId);
  }
  return { src, ev };
}

export async function addTransaction(userId: string, input: TransactionInput): Promise<Tx> {
  if (input.kind !== "income" && input.kind !== "expense") throw new IncomeError("Neplatný typ");
  const amount = Math.abs(Number(input.amount));
  if (!Number.isFinite(amount) || amount === 0) throw new IncomeError("Zadej částku");
  const { src, ev } = await resolveLinks(userId, input.sourceId, input.eventId);
  if (input.assetId) await ownAsset(userId, input.assetId);
  const date = input.date ? checkDate(input.date) : isoDate();
  const currency = (input.currency ?? src?.currency ?? "CZK").toUpperCase();
  const { rate, czk } = await toCzk(amount, currency, date);
  const [row] = await db
    .insert(tx)
    .values({
      userId,
      kind: input.kind,
      amount,
      currency,
      fxRate: rate,
      amountCzk: Math.round(czk * 100) / 100,
      date,
      sourceId: src?.id ?? null,
      eventId: ev?.id ?? null,
      assetId: input.assetId ?? null,
      category: clean(input.category),
      note: clean(input.note),
    })
    .returning({ id: tx.id });
  return getTx(userId, row.id);
}

export async function updateTransaction(userId: string, id: string, patch: Partial<TransactionInput>): Promise<Tx> {
  const [cur] = await db
    .select()
    .from(tx)
    .where(and(eq(tx.id, id), eq(tx.userId, userId)))
    .limit(1);
  if (!cur) throw new IncomeError("Transakce nenalezena");
  const set: Partial<typeof tx.$inferInsert> = {};
  if (patch.kind !== undefined) {
    if (patch.kind !== "income" && patch.kind !== "expense") throw new IncomeError("Neplatný typ");
    set.kind = patch.kind;
  }
  if (patch.amount !== undefined) {
    const amount = Math.abs(Number(patch.amount));
    if (!Number.isFinite(amount) || amount === 0) throw new IncomeError("Zadej částku");
    set.amount = amount;
  }
  if (patch.currency !== undefined) set.currency = patch.currency.toUpperCase();
  if (patch.date !== undefined) set.date = checkDate(patch.date);
  if (patch.sourceId !== undefined || patch.eventId !== undefined) {
    const sourceId = patch.sourceId !== undefined ? patch.sourceId : cur.sourceId;
    // changing the source without an explicit event drops a no-longer-matching event
    let eventId = patch.eventId !== undefined ? patch.eventId : cur.eventId;
    if (patch.eventId === undefined && eventId && sourceId !== cur.sourceId) eventId = null;
    const { src, ev } = await resolveLinks(userId, sourceId, eventId);
    set.sourceId = src?.id ?? null;
    set.eventId = ev?.id ?? null;
  }
  if (patch.assetId !== undefined) {
    if (patch.assetId) await ownAsset(userId, patch.assetId);
    set.assetId = patch.assetId ?? null;
  }
  if (patch.category !== undefined) set.category = clean(patch.category);
  if (patch.note !== undefined) set.note = clean(patch.note);
  if (set.amount !== undefined || set.currency !== undefined || set.date !== undefined) {
    const amount = set.amount ?? cur.amount;
    const currency = set.currency ?? cur.currency;
    const date = set.date ?? cur.date;
    const { rate, czk } = await toCzk(amount, currency, date);
    set.fxRate = rate;
    set.amountCzk = Math.round(czk * 100) / 100;
  }
  if (Object.keys(set).length) {
    await db
      .update(tx)
      .set(set)
      .where(and(eq(tx.id, id), eq(tx.userId, userId)));
  }
  return getTx(userId, id);
}

export async function deleteTransaction(userId: string, id: string) {
  const res = await db
    .delete(tx)
    .where(and(eq(tx.id, id), eq(tx.userId, userId)))
    .returning({ id: tx.id });
  if (!res.length) throw new IncomeError("Transakce nenalezena");
}

function txWhere(userId: string, f: TransactionFilter) {
  const where: (SQL | undefined)[] = [eq(tx.userId, userId)];
  if (f.from) where.push(gte(tx.date, f.from));
  if (f.to) where.push(lte(tx.date, f.to));
  if (f.sourceId === "none") where.push(isNull(tx.sourceId));
  else if (f.sourceId) where.push(eq(tx.sourceId, f.sourceId));
  if (f.eventId) where.push(eq(tx.eventId, f.eventId));
  if (f.kind) where.push(eq(tx.kind, f.kind));
  if (f.category) where.push(eq(tx.category, f.category));
  return and(...where);
}

export async function listTransactions(userId: string, filter: TransactionFilter = {}): Promise<Tx[]> {
  const rows = await db
    .select(txSelect)
    .from(tx)
    .leftJoin(t.incomeSources, eq(t.incomeSources.id, tx.sourceId))
    .leftJoin(t.events, eq(t.events.id, tx.eventId))
    .where(txWhere(userId, filter))
    .orderBy(desc(tx.date), desc(tx.createdAt))
    .limit(Math.min(filter.limit ?? 200, 5000))
    .offset(filter.offset ?? 0);
  return rows.map(mapTx);
}

export async function sumTransactions(userId: string, filter: TransactionFilter = {}): Promise<Totals> {
  const [r] = await db
    .select({ income: sumKind("income"), expense: sumKind("expense"), count: countTx() })
    .from(tx)
    .where(txWhere(userId, filter));
  return totals(r.income, r.expense, r.count);
}

/** Category suggestions: the user's previously used ones (most frequent first) merged with defaults. */
export async function listCategories(userId: string): Promise<Record<TxKind, string[]>> {
  const rows = await db
    .select({ kind: tx.kind, category: tx.category, n: sql<number>`count(*)::int`.mapWith(Number) })
    .from(tx)
    .where(and(eq(tx.userId, userId), sql`${tx.category} is not null`))
    .groupBy(tx.kind, tx.category)
    .orderBy(desc(sql`count(*)`));
  const out: Record<TxKind, string[]> = { income: [], expense: [] };
  for (const r of rows) if (r.category) out[r.kind].push(r.category);
  for (const k of ["income", "expense"] as const) {
    for (const c of [...EVENT_CATEGORIES[k], ...DEFAULT_CATEGORIES[k]]) if (!out[k].includes(c)) out[k].push(c);
  }
  return out;
}

/* ───────────────────────────── Recurring ───────────────────────────── */

function mapRule(r: typeof t.recurringRules.$inferSelect, sourceName: string | null): RecurringRule {
  return {
    id: r.id,
    sourceId: r.sourceId,
    sourceName,
    kind: r.kind,
    amount: r.amount,
    currency: r.currency,
    dayOfMonth: r.dayOfMonth,
    category: r.category,
    note: r.note,
    active: r.active,
    lastGeneratedMonth: r.lastGeneratedMonth,
    nextDate: r.active
      ? (() => {
          const ym = addMonths(r.lastGeneratedMonth ?? addMonths(ymOf(isoDate(r.createdAt)), -1), 1);
          return `${ym}-${String(Math.min(r.dayOfMonth, daysInMonth(ym))).padStart(2, "0")}`;
        })()
      : null,
    createdAt: r.createdAt.toISOString(),
  };
}

export async function listRecurringRules(userId: string, sourceId?: string): Promise<RecurringRule[]> {
  const rows = await db
    .select({ rule: t.recurringRules, sourceName: t.incomeSources.name })
    .from(t.recurringRules)
    .leftJoin(t.incomeSources, eq(t.incomeSources.id, t.recurringRules.sourceId))
    .where(and(eq(t.recurringRules.userId, userId), sourceId ? eq(t.recurringRules.sourceId, sourceId) : undefined))
    .orderBy(desc(t.recurringRules.active), asc(t.recurringRules.dayOfMonth));
  return rows.map((r) => mapRule(r.rule, r.sourceName));
}

function defaultStartMonth(day: number) {
  const today = isoDate();
  const ym = ymOf(today);
  return Math.min(day, daysInMonth(ym)) >= Number(today.slice(8, 10)) ? ym : addMonths(ym, 1);
}

function checkRule(input: Partial<RecurringRuleInput>) {
  if (input.amount !== undefined && (!Number.isFinite(input.amount) || input.amount <= 0)) throw new IncomeError("Zadej částku");
  if (input.dayOfMonth !== undefined && (!Number.isInteger(input.dayOfMonth) || input.dayOfMonth < 1 || input.dayOfMonth > 31))
    throw new IncomeError("Den v měsíci musí být 1–31");
  if (input.startMonth !== undefined && !/^\d{4}-\d{2}$/.test(input.startMonth)) throw new IncomeError("Neplatný měsíc");
}

export async function createRecurringRule(userId: string, input: RecurringRuleInput): Promise<RecurringRule> {
  checkRule(input);
  const src = input.sourceId ? await ownSource(userId, input.sourceId) : null;
  const start = input.startMonth ?? defaultStartMonth(input.dayOfMonth);
  const [row] = await db
    .insert(t.recurringRules)
    .values({
      userId,
      sourceId: src?.id ?? null,
      kind: input.kind,
      amount: input.amount,
      currency: (input.currency ?? src?.currency ?? "CZK").toUpperCase(),
      dayOfMonth: input.dayOfMonth,
      category: clean(input.category),
      note: clean(input.note),
      active: input.active ?? true,
      lastGeneratedMonth: addMonths(start, -1),
    })
    .returning();
  return mapRule(row, src?.name ?? null);
}

export async function updateRecurringRule(userId: string, id: string, patch: Partial<RecurringRuleInput>): Promise<RecurringRule> {
  checkRule(patch);
  const set: Partial<typeof t.recurringRules.$inferInsert> = {};
  if (patch.sourceId !== undefined) set.sourceId = patch.sourceId ? (await ownSource(userId, patch.sourceId)).id : null;
  if (patch.kind !== undefined) set.kind = patch.kind;
  if (patch.amount !== undefined) set.amount = patch.amount;
  if (patch.currency !== undefined) set.currency = patch.currency.toUpperCase();
  if (patch.dayOfMonth !== undefined) set.dayOfMonth = patch.dayOfMonth;
  if (patch.category !== undefined) set.category = clean(patch.category);
  if (patch.note !== undefined) set.note = clean(patch.note);
  if (patch.active !== undefined) set.active = patch.active;
  if (patch.startMonth !== undefined) set.lastGeneratedMonth = addMonths(patch.startMonth, -1);
  else if (patch.active === true) {
    // re-activating a paused rule must not backfill the paused months
    const [cur] = await db
      .select()
      .from(t.recurringRules)
      .where(and(eq(t.recurringRules.id, id), eq(t.recurringRules.userId, userId)))
      .limit(1);
    if (cur && !cur.active) {
      const resume = addMonths(defaultStartMonth(patch.dayOfMonth ?? cur.dayOfMonth), -1);
      if (!cur.lastGeneratedMonth || cur.lastGeneratedMonth < resume) set.lastGeneratedMonth = resume;
    }
  }
  const [row] = await db
    .update(t.recurringRules)
    .set(set)
    .where(and(eq(t.recurringRules.id, id), eq(t.recurringRules.userId, userId)))
    .returning();
  if (!row) throw new IncomeError("Pravidlo nenalezeno");
  const src = row.sourceId ? await ownSource(userId, row.sourceId) : null;
  return mapRule(row, src?.name ?? null);
}

/** Deletes a rule; already generated transactions are kept. */
export async function deleteRecurringRule(userId: string, id: string) {
  await db.delete(t.recurringRules).where(and(eq(t.recurringRules.id, id), eq(t.recurringRules.userId, userId)));
}

/**
 * Creates missing transactions for all active recurring rules up to today.
 * Idempotent: each month is claimed by advancing `lastGeneratedMonth` with a compare-and-set
 * before inserting, so concurrent calls never create duplicates.
 */
export async function generateRecurring(userId: string): Promise<{ created: number }> {
  const today = isoDate();
  const curYm = ymOf(today);
  const rules = await db
    .select()
    .from(t.recurringRules)
    .where(and(eq(t.recurringRules.userId, userId), eq(t.recurringRules.active, true)));
  let created = 0;
  for (const rule of rules) {
    let last = rule.lastGeneratedMonth ?? addMonths(ymOf(isoDate(rule.createdAt)), -1);
    // safety cap: never backfill more than 10 years in one go
    for (let i = 0; i < 120; i++) {
      const ym = addMonths(last, 1);
      if (ym > curYm) break;
      const date = `${ym}-${String(Math.min(rule.dayOfMonth, daysInMonth(ym))).padStart(2, "0")}`;
      if (date > today) break;
      const claimed = await db
        .update(t.recurringRules)
        .set({ lastGeneratedMonth: ym })
        .where(
          and(
            eq(t.recurringRules.id, rule.id),
            rule.lastGeneratedMonth === null && i === 0
              ? isNull(t.recurringRules.lastGeneratedMonth)
              : eq(t.recurringRules.lastGeneratedMonth, last),
          ),
        )
        .returning({ id: t.recurringRules.id });
      if (!claimed.length) break; // another request is generating this rule
      try {
        const { rate, czk } = await toCzk(rule.amount, rule.currency, date);
        await db.insert(tx).values({
          userId,
          sourceId: rule.sourceId,
          recurringRuleId: rule.id,
          kind: rule.kind,
          amount: rule.amount,
          currency: rule.currency,
          fxRate: rate,
          amountCzk: Math.round(czk * 100) / 100,
          date,
          category: rule.category,
          note: rule.note,
        });
        created++;
      } catch (e) {
        // roll the claim back so the month is retried next time (e.g. FX rate unavailable)
        await db
          .update(t.recurringRules)
          .set({ lastGeneratedMonth: rule.lastGeneratedMonth === null && i === 0 ? null : last })
          .where(and(eq(t.recurringRules.id, rule.id), eq(t.recurringRules.lastGeneratedMonth, ym)));
        console.error("generateRecurring", e);
        break;
      }
      last = ym;
    }
  }
  return { created };
}

/* ───────────────────────────── Overview ───────────────────────────── */

async function monthlySeries(userId: string, fromYm: string, toYm: string): Promise<MonthPoint[]> {
  const rows = await db
    .select({
      month: sql<string>`to_char(${tx.date}, 'YYYY-MM')`,
      income: sumKind("income"),
      expense: sumKind("expense"),
    })
    .from(tx)
    .where(and(eq(tx.userId, userId), gte(tx.date, `${fromYm}-01`), lte(tx.date, `${toYm}-${daysInMonth(toYm)}`)))
    .groupBy(sql`1`);
  const map = new Map(rows.map((r) => [r.month, r]));
  const out: MonthPoint[] = [];
  const multiYear = fromYm.slice(0, 4) !== toYm.slice(0, 4);
  for (let ym = fromYm; ym <= toYm; ym = addMonths(ym, 1)) {
    const r = map.get(ym);
    const income = r?.income ?? 0;
    const expense = r?.expense ?? 0;
    out.push({ month: ym, label: monthLabel(ym, multiYear), income, expense, net: income - expense });
  }
  return out;
}

async function firstTxMonth(userId: string): Promise<string | null> {
  const [r] = await db
    .select({ d: sql<string | null>`min(${tx.date})::text` })
    .from(tx)
    .where(eq(tx.userId, userId));
  return r?.d ? ymOf(r.d) : null;
}

/** Average monthly net over the trailing 12 months incl. the current one (fewer if history is shorter). */
export async function avgMonthlyNet12m(userId: string): Promise<number> {
  const today = isoDate();
  const curYm = ymOf(today);
  const first = await firstTxMonth(userId);
  if (!first) return 0;
  const fromYm = addMonths(curYm, -11) > first ? addMonths(curYm, -11) : first;
  const s = await sumTransactions(userId, { from: `${fromYm}-01`, to: today });
  return s.net / Math.max(1, monthsBetween(fromYm, curYm));
}

export async function getOverview(userId: string, opts: { year?: number | "all"; month?: string } = {}): Promise<Overview> {
  const today = isoDate();
  const curYm = ymOf(today);
  const curYear = Number(today.slice(0, 4));
  const first = await firstTxMonth(userId);

  let kind: Overview["period"]["kind"];
  let from: string | null = null;
  let to: string | null = null;
  let year: number | null = null;
  let month: string | null = null;
  let label: string;
  let comparison: Overview["comparison"] = null;
  let seriesFrom: string;
  let seriesTo: string;
  let avgFrom: string | null;
  let avgTo: string;

  if (opts.month && /^\d{4}-\d{2}$/.test(opts.month)) {
    kind = "month";
    month = opts.month;
    year = Number(month.slice(0, 4));
    from = `${month}-01`;
    to = `${month}-${daysInMonth(month)}`;
    label = `${MONTHS_CS[Number(month.slice(5)) - 1]} ${year}`;
    seriesFrom = `${year}-01`;
    seriesTo = `${year}-12`;
    avgFrom = `${year}-01`;
    avgTo = year === curYear ? curYm : `${year}-12`;
  } else if (opts.year === "all") {
    kind = "all";
    label = "Celkem";
    seriesFrom = first && first < curYm ? first : curYm;
    seriesTo = curYm;
    avgFrom = first;
    avgTo = curYm;
  } else {
    kind = "year";
    year = typeof opts.year === "number" ? opts.year : curYear;
    from = `${year}-01-01`;
    to = `${year}-12-31`;
    label = String(year);
    seriesFrom = `${year}-01`;
    seriesTo = `${year}-12`;
    avgFrom = `${year}-01`;
    avgTo = year === curYear ? curYm : `${year}-12`;
  }

  const filter = { from: from ?? undefined, to: to ?? undefined };
  const [sum, monthly, bySourceRows, byCatRows, recent, yearsRows, avg12, events] = await Promise.all([
    sumTransactions(userId, filter),
    monthlySeries(userId, seriesFrom, seriesTo),
    db
      .select({
        sourceId: tx.sourceId,
        name: t.incomeSources.name,
        type: t.incomeSources.type,
        income: sumKind("income"),
        expense: sumKind("expense"),
      })
      .from(tx)
      .leftJoin(t.incomeSources, eq(t.incomeSources.id, tx.sourceId))
      .where(txWhere(userId, filter))
      .groupBy(tx.sourceId, t.incomeSources.name, t.incomeSources.type),
    db
      .select({ kind: tx.kind, category: tx.category, total: sql<number>`sum(${tx.amountCzk})::float8`.mapWith(Number) })
      .from(tx)
      .where(txWhere(userId, filter))
      .groupBy(tx.kind, tx.category)
      .orderBy(desc(sql`3`)),
    listTransactions(userId, { ...filter, limit: 8 }),
    db
      .selectDistinct({ y: sql<number>`extract(year from ${tx.date})::int`.mapWith(Number) })
      .from(tx)
      .where(eq(tx.userId, userId)),
    avgMonthlyNet12m(userId),
    listEvents(userId, undefined, filter),
  ]);

  // averages over the elapsed months of the period
  let monthsCounted = 0;
  let avgNet = 0;
  let avgIncome = 0;
  if (avgFrom && avgFrom <= avgTo) {
    // for a year, start counting from the first transaction month if tracking began mid-year
    const start = kind !== "all" && first && first > avgFrom && first <= avgTo ? first : avgFrom;
    monthsCounted = monthsBetween(start, avgTo);
    const pts = monthly.filter((p) => p.month >= start && p.month <= avgTo);
    const net = pts.reduce((s, p) => s + p.net, 0);
    const inc = pts.reduce((s, p) => s + p.income, 0);
    avgNet = monthsCounted ? net / monthsCounted : 0;
    avgIncome = monthsCounted ? inc / monthsCounted : 0;
  }

  // YoY comparison
  if (kind !== "all" && from && to && year) {
    let pFrom = `${year - 1}${from.slice(4)}`;
    let pTo = `${year - 1}${to.slice(4)}`;
    let cmpLabel = kind === "month" ? `${MONTHS_CS[Number(month!.slice(5)) - 1]} ${year - 1}` : String(year - 1);
    let cur = sum;
    if (kind === "year" && year === curYear) {
      // year-to-date vs. the same span of the previous year
      pTo = `${year - 1}${today.slice(4)}`;
      if (pTo.endsWith("02-29")) pTo = `${year - 1}-02-28`;
      cmpLabel = `${year - 1} ke stejnému dni`;
      cur = await sumTransactions(userId, { from, to: today });
    } else if (kind === "month" && month === curYm) {
      pTo = `${year - 1}${today.slice(4)}`;
      if (pTo.endsWith("02-29")) pTo = `${year - 1}-02-28`;
      cmpLabel += " ke stejnému dni";
      cur = await sumTransactions(userId, { from, to: today });
    }
    pFrom = pFrom.endsWith("02-29") ? pFrom.replace("02-29", "02-28") : pFrom;
    if (pTo.slice(5, 7) === "02" && Number(pTo.slice(8)) > daysInMonth(pTo.slice(0, 7))) pTo = `${pTo.slice(0, 8)}${daysInMonth(pTo.slice(0, 7))}`;
    const prev = await sumTransactions(userId, { from: pFrom, to: pTo });
    comparison = {
      ...prev,
      label: cmpLabel,
      netChangePct: prev.count ? changePct(cur.net, prev.net) : null,
      incomeChangePct: prev.count ? changePct(cur.income, prev.income) : null,
    };
  }

  const totalIncome = bySourceRows.reduce((s, r) => s + r.income, 0);
  const bySource = bySourceRows
    .map((r) => ({
      sourceId: r.sourceId,
      name: r.name ?? "Bez zdroje",
      type: r.type ?? null,
      income: r.income,
      expense: r.expense,
      net: r.income - r.expense,
      pctOfIncome: totalIncome > 0 ? (r.income / totalIncome) * 100 : 0,
    }))
    .sort((a, b) => b.income - a.income || b.net - a.net);

  const years = new Set<number>([curYear, ...yearsRows.map((r) => r.y)]);

  return {
    period: { kind, year, month, from, to, label },
    totals: sum,
    avgMonthlyNet: avgNet,
    avgMonthlyIncome: avgIncome,
    monthsCounted,
    avgMonthlyNet12m: avg12,
    comparison,
    monthly,
    bySource,
    byCategory: byCatRows.map((r) => ({ kind: r.kind, category: r.category ?? "Bez kategorie", total: r.total })),
    topEvents: events
      .filter((e) => e.count > 0)
      .sort((a, b) => b.net - a.net)
      .slice(0, 5),
    recent,
    years: [...years].sort((a, b) => b - a),
    hasData: first != null,
  };
}

/** Totals + monthly series for one source (all time, series = last 12 months or since the first transaction). */
export async function getSourceStats(userId: string, sourceId: string) {
  const source = await getSource(userId, sourceId);
  const curYm = ymOf(isoDate());
  const [all, firstRow] = await Promise.all([
    sumTransactions(userId, { sourceId }),
    db
      .select({ d: sql<string | null>`min(${tx.date})::text` })
      .from(tx)
      .where(and(eq(tx.userId, userId), eq(tx.sourceId, sourceId))),
  ]);
  const first = firstRow[0]?.d ? ymOf(firstRow[0].d) : curYm;
  const fromYm = addMonths(curYm, -11);
  const rows = await db
    .select({
      month: sql<string>`to_char(${tx.date}, 'YYYY-MM')`,
      income: sumKind("income"),
      expense: sumKind("expense"),
    })
    .from(tx)
    .where(and(eq(tx.userId, userId), eq(tx.sourceId, sourceId), gte(tx.date, `${fromYm}-01`)))
    .groupBy(sql`1`);
  const map = new Map(rows.map((r) => [r.month, r]));
  const monthly: MonthPoint[] = [];
  for (let ym = fromYm; ym <= curYm; ym = addMonths(ym, 1)) {
    const r = map.get(ym);
    const income = r?.income ?? 0;
    const expense = r?.expense ?? 0;
    monthly.push({ month: ym, label: monthLabel(ym, fromYm.slice(0, 4) !== curYm.slice(0, 4)), income, expense, net: income - expense });
  }
  const months = first > curYm ? 1 : Math.min(12, monthsBetween(first < fromYm ? fromYm : first, curYm));
  const last12 = monthly.reduce((s, p) => s + p.net, 0);
  return { source, totals: all, monthly, avgMonthlyNet12m: last12 / months };
}

/** Lightweight lists for pickers (sheet). */
export async function getPickerData(userId: string) {
  const [sources, events, categories] = await Promise.all([
    db
      .select({ id: t.incomeSources.id, name: t.incomeSources.name, type: t.incomeSources.type, currency: t.incomeSources.currency, archived: t.incomeSources.archived })
      .from(t.incomeSources)
      .where(eq(t.incomeSources.userId, userId))
      .orderBy(asc(t.incomeSources.createdAt)),
    db
      .select({ id: t.events.id, sourceId: t.events.sourceId, name: t.events.name, startDate: t.events.startDate, endDate: t.events.endDate })
      .from(t.events)
      .where(eq(t.events.userId, userId))
      .orderBy(desc(t.events.startDate))
      .limit(300),
    listCategories(userId),
  ]);
  return { sources, events, categories };
}

export type PickerData = Awaited<ReturnType<typeof getPickerData>>;

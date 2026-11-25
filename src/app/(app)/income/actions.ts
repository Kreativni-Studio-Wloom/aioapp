"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { toNum, type ActionResult } from "@/lib/utils";
import * as income from "@/lib/income/service";

function done() {
  revalidatePath("/income", "layout");
  revalidatePath("/");
}

async function run<T>(fn: (userId: string) => Promise<T>): Promise<ActionResult<T>> {
  const user = await requireUser();
  try {
    const data = await fn(user.id);
    done();
    return { ok: true, data };
  } catch (e) {
    if (e instanceof income.IncomeError) return { ok: false, error: e.message };
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Neplatná data" };
    console.error("income action", e);
    return { ok: false, error: e instanceof Error && e.message.startsWith("Kurz") ? e.message : "Něco se nepovedlo" };
  }
}

const optId = z.string().uuid().nullish().or(z.literal("").transform(() => null));
const optText = z.string().max(500).nullish();
const amount = z.union([z.number(), z.string()]).transform((v, ctx) => {
  const n = typeof v === "number" ? v : toNum(v);
  if (n == null || n <= 0) {
    ctx.addIssue({ code: "custom", message: "Zadej kladnou částku" });
    return z.NEVER;
  }
  return n;
});
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Neplatné datum");
const kind = z.enum(["income", "expense"]);
const currency = z.string().regex(/^[A-Za-z]{3}$/, "Neplatná měna");

/* ── Transactions ── */

const txSchema = z.object({
  id: z.string().uuid().optional(),
  kind,
  amount,
  currency: currency.optional(),
  date: date.optional(),
  sourceId: optId,
  eventId: optId,
  category: optText,
  note: optText,
});

export async function saveTransaction(input: z.input<typeof txSchema>) {
  return run(async (userId) => {
    const { id, ...data } = txSchema.parse(input);
    const payload = { ...data, sourceId: data.sourceId ?? null, eventId: data.eventId ?? null };
    return id ? income.updateTransaction(userId, id, payload) : income.addTransaction(userId, payload);
  });
}

export async function deleteTransactionAction(id: string) {
  return run((userId) => income.deleteTransaction(userId, z.string().uuid().parse(id)));
}

/* ── Sources ── */

const sourceSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Zadej název").max(120),
  type: z.enum(["business", "rental", "investment", "job", "other"]),
  currency: currency.default("CZK"),
  notes: optText,
});

export async function saveSource(input: z.input<typeof sourceSchema>) {
  return run(async (userId) => {
    const { id, ...data } = sourceSchema.parse(input);
    return id ? income.updateSource(userId, id, data) : income.createSource(userId, data);
  });
}

export async function archiveSourceAction(id: string, archived: boolean) {
  return run((userId) => income.archiveSource(userId, z.string().uuid().parse(id), archived));
}

export async function deleteSourceAction(id: string) {
  return run((userId) => income.deleteSource(userId, z.string().uuid().parse(id)));
}

/* ── Events ── */

const eventSchema = z.object({
  id: z.string().uuid().optional(),
  sourceId: z.string().uuid("Vyber zdroj"),
  name: z.string().trim().min(1, "Zadej název akce").max(160),
  location: optText,
  startDate: date,
  endDate: date.nullish().or(z.literal("").transform(() => null)),
  notes: optText,
});

export async function saveEvent(input: z.input<typeof eventSchema>) {
  return run(async (userId) => {
    const { id, ...data } = eventSchema.parse(input);
    return id ? income.updateEvent(userId, id, data) : income.createEvent(userId, data);
  });
}

export async function deleteEventAction(id: string, withTransactions: boolean) {
  return run((userId) => income.deleteEvent(userId, z.string().uuid().parse(id), { withTransactions }));
}

/* ── Recurring rules ── */

const ruleSchema = z.object({
  id: z.string().uuid().optional(),
  sourceId: optId,
  kind,
  amount,
  currency: currency.default("CZK"),
  dayOfMonth: z.coerce.number().int().min(1, "Den 1–31").max(31, "Den 1–31"),
  category: optText,
  note: optText,
  active: z.boolean().optional(),
  startMonth: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "Neplatný měsíc")
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export async function saveRule(input: z.input<typeof ruleSchema>) {
  return run(async (userId) => {
    const { id, ...data } = ruleSchema.parse(input);
    const payload = { ...data, sourceId: data.sourceId ?? null };
    const rule = id ? await income.updateRecurringRule(userId, id, payload) : await income.createRecurringRule(userId, payload);
    await income.generateRecurring(userId);
    return rule;
  });
}

export async function toggleRuleAction(id: string, active: boolean) {
  return run(async (userId) => {
    const rule = await income.updateRecurringRule(userId, z.string().uuid().parse(id), { active });
    if (active) await income.generateRecurring(userId);
    return rule;
  });
}

export async function deleteRuleAction(id: string) {
  return run((userId) => income.deleteRecurringRule(userId, z.string().uuid().parse(id)));
}

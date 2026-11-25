"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import type { ActionResult } from "@/lib/utils";
import { ASSET_CLASSES } from "@/lib/portfolio/constants";
import * as svc from "@/lib/portfolio/service";
import { importCsv, previewCsvImport, type CsvPreview } from "@/lib/portfolio/csv";

const TX_TYPES = ["buy", "sell", "dividend", "fee", "withdrawal", "valuation"] as const;
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Neplatné datum");
const optNum = z.number().finite().nullable().optional();

function fail(e: unknown): { ok: false; error: string } {
  if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Neplatná data" };
  console.error("portfolio action", e);
  return { ok: false, error: e instanceof Error ? e.message : "Něco se pokazilo" };
}

function revalidate(assetId?: string | null, income = false) {
  revalidatePath("/portfolio");
  if (assetId) revalidatePath(`/portfolio/${assetId}`);
  revalidatePath("/");
  if (income) revalidatePath("/income", "layout");
}

/* ── Search & assets ── */

export async function searchInstrumentsAction(cls: string, query: string): Promise<ActionResult<svc.InstrumentHit[]>> {
  try {
    await requireUser();
    const c = z.enum(ASSET_CLASSES as [string, ...string[]]).parse(cls) as (typeof ASSET_CLASSES)[number];
    if (query.trim().length < 1) return { ok: true, data: [] };
    return { ok: true, data: await svc.searchInstruments(c, query.slice(0, 60)) };
  } catch (e) {
    return fail(e);
  }
}

const createSchema = z.object({
  class: z.enum(ASSET_CLASSES as [string, ...string[]]),
  name: z.string().trim().min(1, "Zadej název").max(120),
  symbol: z.string().trim().max(40).nullable().optional(),
  currency: z.string().trim().min(3).max(5).nullable().optional(),
  priceSource: z.enum(["manual", "coingecko", "yahoo"]),
  externalId: z.string().trim().max(80).nullable().optional(),
  targetPct: z.number().min(0).max(100).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  initial: z
    .object({
      date: isoDateSchema,
      quantity: optNum,
      price: optNum,
      fee: optNum,
      amount: optNum,
    })
    .nullable()
    .optional(),
});

export async function createAssetAction(input: z.input<typeof createSchema>): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    const d = createSchema.parse(input);
    const asset = await svc.createAsset(user.id, { ...d, class: d.class as svc.Asset["class"] });
    if (d.initial) {
      const manual = d.priceSource === "manual";
      if (manual && d.initial.amount != null) {
        await svc.addAssetTransaction(user.id, { assetId: asset.id, type: "valuation", date: d.initial.date, amount: d.initial.amount });
      } else if (!manual && (d.initial.quantity ?? 0) > 0) {
        await svc.addAssetTransaction(user.id, {
          assetId: asset.id,
          type: "buy",
          date: d.initial.date,
          quantity: d.initial.quantity,
          price: d.initial.price ?? asset.lastPrice ?? 0,
          fee: d.initial.fee,
        });
      }
    }
    await svc.snapshotNetWorth(user.id).catch(() => null);
    revalidate(asset.id);
    return { ok: true, data: { id: asset.id } };
  } catch (e) {
    return fail(e);
  }
}

const updateSchema = z.object({
  name: z.string().trim().min(1, "Zadej název").max(120).optional(),
  symbol: z.string().trim().max(40).nullable().optional(),
  targetPct: z.number().min(0).max(100).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  archived: z.boolean().optional(),
});

export async function updateAssetAction(id: string, patch: z.input<typeof updateSchema>): Promise<ActionResult> {
  try {
    const user = await requireUser();
    await svc.updateAsset(user.id, z.string().uuid().parse(id), updateSchema.parse(patch));
    revalidate(id);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteAssetAction(id: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    await svc.deleteAsset(user.id, z.string().uuid().parse(id));
    await svc.snapshotNetWorth(user.id).catch(() => null);
    revalidate();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/* ── Transactions ── */

const txSchema = z.object({
  assetId: z.string().uuid(),
  type: z.enum(TX_TYPES),
  date: isoDateSchema,
  quantity: optNum,
  price: optNum,
  fee: optNum,
  amount: optNum,
  note: z.string().max(500).nullable().optional(),
  alsoIncome: z.boolean().optional(),
});

export async function addAssetTxAction(
  input: z.input<typeof txSchema>,
): Promise<ActionResult<{ incomeLinked: boolean; incomeError?: string }>> {
  try {
    const user = await requireUser();
    const d = txSchema.parse(input);
    const res = await svc.addAssetTransaction(user.id, d);
    await svc.snapshotNetWorth(user.id).catch(() => null);
    revalidate(d.assetId, res.income.linked);
    return { ok: true, data: { incomeLinked: res.income.linked, incomeError: res.income.error } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteAssetTxAction(id: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const res = await svc.deleteAssetTransaction(user.id, z.string().uuid().parse(id));
    await svc.snapshotNetWorth(user.id).catch(() => null);
    revalidate(res.assetId, true);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/* ── Prices ── */

export async function refreshPricesAction(): Promise<ActionResult<{ updated: number; errors: string[] }>> {
  try {
    const user = await requireUser();
    const res = await svc.refreshPrices(user.id);
    await svc.snapshotNetWorth(user.id).catch(() => null);
    revalidatePath("/portfolio", "layout");
    revalidatePath("/");
    return { ok: true, data: res };
  } catch (e) {
    return fail(e);
  }
}

/* ── Liabilities ── */

const liabilitySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Zadej název").max(120),
  balance: z.number({ message: "Zadej zůstatek" }).finite(),
  currency: z.string().trim().min(3).max(5).optional(),
  interestRate: z.number().min(0).max(100).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export async function upsertLiabilityAction(input: z.input<typeof liabilitySchema>): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    const res = await svc.upsertLiability(user.id, liabilitySchema.parse(input));
    await svc.snapshotNetWorth(user.id).catch(() => null);
    revalidate();
    return { ok: true, data: res };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteLiabilityAction(id: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    await svc.deleteLiability(user.id, z.string().uuid().parse(id));
    await svc.snapshotNetWorth(user.id).catch(() => null);
    revalidate();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/* ── CSV import ── */

const csvText = z.string().min(1, "Vlož CSV").max(500_000, "Soubor je příliš velký");

export async function previewCsvAction(text: string): Promise<ActionResult<CsvPreview>> {
  try {
    const user = await requireUser();
    return { ok: true, data: await previewCsvImport(user.id, csvText.parse(text)) };
  } catch (e) {
    return fail(e);
  }
}

export async function importCsvAction(text: string): Promise<ActionResult<{ assetsCreated: number; transactionsCreated: number; errors: string[] }>> {
  try {
    const user = await requireUser();
    const res = await importCsv(user.id, csvText.parse(text));
    await svc.refreshPrices(user.id).catch(() => null);
    await svc.snapshotNetWorth(user.id).catch(() => null);
    revalidatePath("/portfolio", "layout");
    revalidatePath("/");
    return { ok: true, data: res };
  } catch (e) {
    return fail(e);
  }
}

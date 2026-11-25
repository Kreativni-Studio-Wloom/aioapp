"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button, Empty, Field, Input, Textarea } from "@/components/ui";
import { ConfirmButton, Sheet, Spinner } from "@/components/ui/client";
import { dateLabel, isoDate, money, num } from "@/lib/format";
import { cn, toNum } from "@/lib/utils";
import { INCOME_CATEGORY, MANUAL_TX_LABEL, TX_LABEL, type AssetTxType } from "@/lib/portfolio/constants";
import type { AssetTx } from "@/lib/portfolio/service";
import { addAssetTxAction, deleteAssetAction, deleteAssetTxAction, updateAssetAction } from "../actions";

const MARKET_TYPES: AssetTxType[] = ["buy", "sell", "dividend", "fee", "withdrawal"];
const MANUAL_TYPES: AssetTxType[] = ["valuation", "buy", "sell", "withdrawal", "dividend", "fee"];

/* ── Add transaction ── */

export function AddTxButton({ assetId, manual, currency, lastPrice }: { assetId: string; manual: boolean; currency: string; lastPrice: number | null }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Plus size={14} /> Přidat
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Nová transakce">
        {open && <TxForm assetId={assetId} manual={manual} currency={currency} lastPrice={lastPrice} onDone={() => setOpen(false)} />}
      </Sheet>
    </>
  );
}

function TxForm({ assetId, manual, currency, lastPrice, onDone }: { assetId: string; manual: boolean; currency: string; lastPrice: number | null; onDone: () => void }) {
  const router = useRouter();
  const types = manual ? MANUAL_TYPES : MARKET_TYPES;
  const labels = manual ? MANUAL_TX_LABEL : TX_LABEL;
  const [type, setType] = useState<AssetTxType>(types[0]);
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState(lastPrice != null ? String(+lastPrice.toFixed(lastPrice < 10 ? 6 : 2)).replace(".", ",") : "");
  const [fee, setFee] = useState("");
  const [alsoIncome, setAlsoIncome] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const unitTrade = !manual && (type === "buy" || type === "sell");
  const incomeCapable = !!INCOME_CATEGORY[type];
  const total = unitTrade ? (toNum(qty) ?? 0) * (toNum(price) ?? 0) + (type === "buy" ? 1 : -1) * (toNum(fee) ?? 0) : 0;

  function submit(fd: FormData) {
    setErr(null);
    start(async () => {
      const res = await addAssetTxAction({
        assetId,
        type,
        date: String(fd.get("date") || isoDate()),
        quantity: unitTrade ? toNum(qty) : null,
        price: unitTrade ? toNum(price) : null,
        fee: toNum(fee),
        amount: unitTrade ? null : toNum(fd.get("amount")),
        note: (fd.get("note") as string) || null,
        alsoIncome: incomeCapable && alsoIncome,
      });
      if (!res.ok) return setErr(res.error);
      router.refresh();
      if (res.data?.incomeError) {
        setNote(`Uloženo, ale zápis do Příjmů selhal: ${res.data.incomeError}`);
        return;
      }
      onDone();
    });
  }

  return (
    <form action={submit} className="space-y-4">
      <div className="grid grid-cols-3 gap-1.5">
        {types.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={cn(
              "min-h-11 rounded-xl px-2 text-sm font-medium transition-colors",
              type === t ? "bg-fg text-inverse" : "bg-card text-muted hover:text-fg",
            )}
          >
            {labels[t]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Datum">
          <Input name="date" type="date" defaultValue={isoDate()} required />
        </Field>
        {unitTrade ? (
          <>
            <Field label="Množství">
              <Input key="qty" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus required />
            </Field>
            <Field label={`Cena / ks (${currency})`}>
              <Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} required />
            </Field>
            <Field label="Poplatek">
              <Input inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="0" />
            </Field>
          </>
        ) : (
          <>
            <Field label={type === "valuation" ? `Celková hodnota (${currency})` : `Částka (${currency})`}>
              <Input key="amount" name="amount" inputMode="decimal" autoFocus required />
            </Field>
            {type !== "valuation" && type !== "fee" && (
              <Field key="fee2" label={type === "dividend" ? "Srážková daň / poplatek" : "Poplatek"}>
                <Input inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="0" />
              </Field>
            )}
          </>
        )}
      </div>

      {unitTrade && total > 0 && (
        <div className="num text-sm text-muted">
          Celkem {type === "buy" ? "zaplaceno" : "přijato"}: <span className="text-fg">{money(total, currency, { decimals: 2 })}</span>
        </div>
      )}
      {type === "valuation" && <p className="text-xs text-subtle">Ocenění nastaví aktuální celkovou hodnotu aktiva k danému dni.</p>}

      {incomeCapable && (
        <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl bg-card px-3.5">
          <input type="checkbox" checked={alsoIncome} onChange={(e) => setAlsoIncome(e.target.checked)} className="h-4 w-4 accent-[var(--fg)]" />
          <span className="text-sm">Zapsat i do Příjmů</span>
        </label>
      )}

      <Field label="Poznámka">
        <Textarea name="note" className="min-h-14" />
      </Field>
      {err && <p className="text-sm text-neg">{err}</p>}
      {note && <p className="text-sm text-fg-soft">{note}</p>}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending && <Spinner />} Uložit
        </Button>
      </div>
    </form>
  );
}

/* ── Transactions list ── */

export function TxList({ items, manual, currency }: { items: AssetTx[]; manual: boolean; currency: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const labels = manual ? MANUAL_TX_LABEL : TX_LABEL;
  if (!items.length) return <Empty title="Žádné transakce">{manual ? "Zadej ocenění nebo vklad." : "Přidej první nákup."}</Empty>;
  return (
    <div className="rounded-2xl bg-card px-4">
      <AnimatePresence initial={false}>
        {items.map((x) => {
          const unit = !manual && (x.type === "buy" || x.type === "sell");
          const sign = x.type === "buy" || x.type === "fee" ? -1 : x.type === "valuation" ? 0 : 1;
          const value = unit ? x.quantity * x.price + (x.type === "buy" ? x.fee : -x.fee) : x.amount;
          return (
            <motion.div
              key={x.id}
              layout
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center gap-3 border-b border-line py-3 last:border-0"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{labels[x.type]}</div>
                <div className="num truncate text-xs text-muted">
                  {dateLabel(x.date, { day: "numeric", month: "numeric", year: "numeric" })}
                  {unit && (
                    <>
                      {" "}
                      · {num(x.quantity, 8)} × {money(x.price, currency, { decimals: x.price < 10 ? 4 : 2 })}
                    </>
                  )}
                  {x.fee > 0 && <> · poplatek {money(x.fee, currency, { decimals: 2 })}</>}
                  {x.note && <> · {x.note}</>}
                </div>
              </div>
              <div className={cn("num shrink-0 text-sm", sign === 0 ? "text-fg" : "text-fg-soft")}>
                {sign < 0 ? "−" : sign > 0 ? "+" : ""}
                {money(value, currency, { decimals: 2 })}
              </div>
              <button
                type="button"
                aria-label="Smazat transakci"
                disabled={pending}
                onClick={() => {
                  if (busy !== x.id) {
                    setBusy(x.id);
                    setTimeout(() => setBusy((b) => (b === x.id ? null : b)), 3000);
                    return;
                  }
                  start(async () => {
                    await deleteAssetTxAction(x.id);
                    setBusy(null);
                    router.refresh();
                  });
                }}
                className={cn(
                  "grid h-10 min-w-10 place-items-center rounded-lg px-2 text-xs transition-colors",
                  busy === x.id ? "bg-bg-elev text-neg" : "text-subtle hover:bg-card-hover hover:text-fg",
                )}
              >
                {busy === x.id ? "Smazat?" : <Trash2 size={15} />}
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

/* ── Edit / archive / delete asset ── */

type EditableAsset = { id: string; name: string; symbol: string | null; targetPct: number | null; notes: string | null; archived: boolean };

export function EditAssetButton({ asset }: { asset: EditableAsset }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" size="icon" aria-label="Upravit" onClick={() => setOpen(true)}>
        <Pencil size={16} />
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Upravit aktivum">
        {open && <EditAssetForm asset={asset} onDone={() => setOpen(false)} />}
      </Sheet>
    </>
  );
}

function EditAssetForm({ asset, onDone }: { asset: EditableAsset; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return setErr(res.error ?? "Chyba");
      if (after) after();
      else {
        router.refresh();
        onDone();
      }
    });

  return (
    <form
      action={(fd) =>
        run(() =>
          updateAssetAction(asset.id, {
            name: String(fd.get("name") ?? ""),
            symbol: (fd.get("symbol") as string) || null,
            targetPct: toNum(fd.get("targetPct")),
            notes: (fd.get("notes") as string) || null,
          }),
        )
      }
      className="space-y-4"
    >
      <Field label="Název">
        <Input name="name" defaultValue={asset.name} required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Symbol">
          <Input name="symbol" defaultValue={asset.symbol ?? ""} />
        </Field>
        <Field label="Cílová alokace %">
          <Input name="targetPct" inputMode="decimal" defaultValue={asset.targetPct ?? ""} placeholder="—" />
        </Field>
      </div>
      <Field label="Poznámka">
        <Textarea name="notes" defaultValue={asset.notes ?? ""} className="min-h-16" />
      </Field>
      {err && <p className="text-sm text-neg">{err}</p>}
      <div className="flex flex-wrap justify-between gap-2">
        <div className="flex gap-2">
          <Button variant="outline" disabled={pending} onClick={() => run(() => updateAssetAction(asset.id, { archived: !asset.archived }))}>
            {asset.archived ? "Obnovit" : "Archivovat"}
          </Button>
          <ConfirmButton
            disabled={pending}
            confirmText="Smazat vč. transakcí?"
            onConfirm={() =>
              run(
                () => deleteAssetAction(asset.id),
                () => {
                  onDone();
                  router.push("/portfolio");
                },
              )
            }
          >
            Smazat
          </ConfirmButton>
        </div>
        <Button type="submit" disabled={pending}>
          {pending && <Spinner />} Uložit
        </Button>
      </div>
    </form>
  );
}

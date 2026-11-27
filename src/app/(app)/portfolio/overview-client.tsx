"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Plus, RefreshCw, Search } from "lucide-react";
import { Button, Field, Input, Select, Textarea, Badge } from "@/components/ui";
import { ConfirmButton, Sheet, Spinner } from "@/components/ui/client";
import { SearchSkeleton } from "@/components/skeleton";
import { isoDate, money, pct } from "@/lib/format";
import { cn, toNum } from "@/lib/utils";
import { ASSET_CLASSES, CLASS_LABEL, PORTFOLIO_CURRENCIES, defaultSource, type AssetClass, type PriceSource } from "@/lib/portfolio/constants";
import type { InstrumentHit, Liability } from "@/lib/portfolio/service";
import { createAssetAction, deleteLiabilityAction, refreshPricesAction, searchInstrumentsAction, upsertLiabilityAction } from "./actions";

/* ── Refresh prices ── */

export function RefreshButton({ asOf }: { asOf: string | null }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();
  return (
    <div className="flex items-center gap-2">
      {msg && <span className="hidden text-xs text-muted md:inline">{msg}</span>}
      <Button
        variant="secondary"
        size="md"
        disabled={pending}
        title={asOf ? `Ceny z ${new Date(asOf).toLocaleString("cs-CZ")}` : undefined}
        onClick={() =>
          start(async () => {
            const res = await refreshPricesAction();
            if (!res.ok) setMsg(res.error);
            else {
              const d = res.data!;
              setMsg(d.errors.length ? `Aktualizováno ${d.updated}, chyby: ${d.errors.length}` : `Aktualizováno ${d.updated}`);
              if (d.errors.length) console.warn("refreshPrices", d.errors);
            }
            router.refresh();
            setTimeout(() => setMsg(null), 5000);
          })
        }
        aria-label="Aktualizovat ceny"
      >
        <RefreshCw size={16} className={cn(pending && "animate-spin")} />
        <span className="hidden sm:inline">Aktualizovat ceny</span>
      </Button>
    </div>
  );
}

/* ── Add asset flow ── */

type Picked = { source: PriceSource; externalId: string | null; name: string; symbol: string | null };

export function AddAssetButton({ label = "Přidat" }: { label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus size={16} /> {label}
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Nové aktivum">
        {open && <AddAssetFlow onDone={() => setOpen(false)} />}
      </Sheet>
    </>
  );
}

function AddAssetFlow({ onDone }: { onDone: () => void }) {
  const [cls, setCls] = useState<AssetClass | null>(null);
  const [picked, setPicked] = useState<Picked | null>(null);

  return (
    <AnimatePresence mode="wait" initial={false}>
      {!cls ? (
        <motion.div key="cls" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.18 }}>
          <p className="mb-3 text-sm text-muted">Vyber typ aktiva</p>
          <div className="grid grid-cols-2 gap-2">
            {ASSET_CLASSES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setCls(c);
                  if (defaultSource(c) === "manual" && c !== "commodity" && c !== "bond") setPicked({ source: "manual", externalId: null, name: "", symbol: null });
                }}
                className="h-14 rounded-xl bg-card text-left px-4 font-medium transition-colors hover:bg-card-hover active:scale-[0.98]"
              >
                {CLASS_LABEL[c]}
              </button>
            ))}
          </div>
        </motion.div>
      ) : !picked ? (
        <motion.div key="search" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.18 }}>
          <InstrumentSearch cls={cls} onPick={setPicked} onBack={() => setCls(null)} />
        </motion.div>
      ) : (
        <motion.div key="details" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} transition={{ duration: 0.18 }}>
          <AssetDetailsForm
            cls={cls}
            picked={picked}
            onBack={() => {
              if (picked.source === "manual" && defaultSource(cls) === "manual" && cls !== "commodity" && cls !== "bond") setCls(null);
              setPicked(null);
            }}
            onDone={onDone}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function InstrumentSearch({ cls, onPick, onBack }: { cls: AssetClass; onPick: (p: Picked) => void; onBack: () => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<InstrumentHit[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const query = q.trim();
    if (!query) return;
    const id = ++seq.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      const res = await searchInstrumentsAction(cls, query);
      if (id !== seq.current) return;
      setLoading(false);
      if (res.ok) {
        setHits(res.data ?? []);
        setErr(null);
      } else setErr(res.error);
    }, 350);
    return () => clearTimeout(timer);
  }, [q, cls]);

  const crypto = cls === "crypto";
  return (
    <div className="space-y-4">
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <Input
          autoFocus
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            if (!e.target.value.trim()) setHits([]);
          }}
          placeholder={crypto ? "Bitcoin, ETH…" : "Ticker nebo název (VWCE, Apple…)"}
          className="pl-10"
        />
      </div>
      {err && <p className="text-sm text-neg">{err}</p>}
      <div className="space-y-1">
        {hits.map((h) => (
          <button
            key={h.externalId}
            type="button"
            onClick={() => onPick({ source: h.source, externalId: h.externalId, name: h.name, symbol: h.symbol })}
            className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-card"
          >
            <span className="min-w-0">
              <span className="block truncate font-medium">{h.name}</span>
              <span className="block truncate text-xs text-muted">{h.detail}</span>
            </span>
            <Badge>{h.symbol}</Badge>
          </button>
        ))}
        {loading && !hits.length && <SearchSkeleton count={3} />}
        {q.trim() && !loading && !hits.length && !err && <p className="px-3 py-2 text-sm text-muted">Nic nenalezeno.</p>}
      </div>
      <div className="flex justify-between gap-2 pt-2">
        <Button variant="ghost" onClick={onBack}>
          Zpět
        </Button>
        <Button variant="outline" onClick={() => onPick({ source: "manual", externalId: null, name: q.trim(), symbol: null })}>
          Zadat ručně
        </Button>
      </div>
    </div>
  );
}

function AssetDetailsForm({ cls, picked, onBack, onDone }: { cls: AssetClass; picked: Picked; onBack: () => void; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const manual = picked.source === "manual";

  function submit(fd: FormData) {
    setErr(null);
    const qty = toNum(fd.get("quantity"));
    const value = toNum(fd.get("value"));
    const date = String(fd.get("date") || isoDate());
    const initial = manual
      ? value != null
        ? { date, amount: value }
        : null
      : qty
        ? { date, quantity: qty, price: toNum(fd.get("price")), fee: toNum(fd.get("fee")) }
        : null;
    start(async () => {
      const res = await createAssetAction({
        class: cls,
        name: String(fd.get("name") ?? ""),
        symbol: (fd.get("symbol") as string) || picked.symbol,
        currency: picked.source === "yahoo" ? null : String(fd.get("currency") || "CZK"),
        priceSource: picked.source,
        externalId: picked.externalId,
        targetPct: toNum(fd.get("targetPct")),
        notes: (fd.get("notes") as string) || null,
        initial,
      });
      if (!res.ok) return setErr(res.error);
      onDone();
      router.push(`/portfolio/${res.data!.id}`);
    });
  }

  return (
    <form action={submit} className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted">
        <Badge>{CLASS_LABEL[cls]}</Badge>
        {picked.source === "yahoo" && <span>Cena z Yahoo Finance ({picked.externalId})</span>}
        {picked.source === "coingecko" && <span>Cena z CoinGecko ({picked.externalId})</span>}
        {manual && <span>Ruční ocenění</span>}
      </div>
      <Field label="Název">
        <Input name="name" defaultValue={picked.name} required autoFocus={manual} placeholder={cls === "real_estate" ? "Byt Praha" : cls === "cash" ? "Spořicí účet" : "Název"} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        {picked.source !== "yahoo" && (
          <Field label="Měna">
            <Select name="currency" defaultValue="CZK">
              {PORTFOLIO_CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
        )}
        {manual && (
          <Field label="Symbol" hint="volitelné">
            <Input name="symbol" placeholder="—" />
          </Field>
        )}
        <Field label="Cílová alokace %" hint="volitelné">
          <Input name="targetPct" inputMode="decimal" placeholder="—" />
        </Field>
      </div>

      <div className="rounded-2xl border border-line p-4">
        <div className="mb-3 text-xs font-medium uppercase tracking-wider text-muted">{manual ? "Aktuální hodnota" : "První nákup"} · volitelné</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Datum">
            <Input name="date" type="date" defaultValue={isoDate()} />
          </Field>
          {manual ? (
            <Field label="Hodnota">
              <Input name="value" inputMode="decimal" placeholder="0" />
            </Field>
          ) : (
            <>
              <Field label="Množství">
                <Input name="quantity" inputMode="decimal" placeholder="0" />
              </Field>
              <Field label="Cena / ks" hint="prázdné = aktuální">
                <Input name="price" inputMode="decimal" placeholder="—" />
              </Field>
              <Field label="Poplatek">
                <Input name="fee" inputMode="decimal" placeholder="0" />
              </Field>
            </>
          )}
        </div>
      </div>
      <Field label="Poznámka">
        <Textarea name="notes" className="min-h-16" />
      </Field>
      {err && <p className="text-sm text-neg">{err}</p>}
      <div className="flex justify-between gap-2">
        <Button variant="ghost" onClick={onBack} disabled={pending}>
          Zpět
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Spinner />} Přidat aktivum
        </Button>
      </div>
    </form>
  );
}

/* ── Liabilities ── */

export function LiabilitiesSection({ items }: { items: Liability[] }) {
  const [edit, setEdit] = useState<Liability | "new" | null>(null);
  return (
    <>
      {items.length === 0 ? (
        <button
          type="button"
          onClick={() => setEdit("new")}
          className="w-full rounded-2xl border border-dashed border-line-strong px-4 py-6 text-sm text-muted transition-colors hover:text-fg"
        >
          Přidat hypotéku nebo úvěr
        </button>
      ) : (
        <div className="rounded-2xl bg-card px-4">
          {items.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => setEdit(l)}
              className="flex min-h-14 w-full items-center justify-between gap-3 border-b border-line py-3 text-left last:border-0"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{l.name}</span>
                <span className="block text-xs text-muted">
                  {l.interestRate != null ? `${pct(l.interestRate, 2)} p.a. · ` : ""}aktualizováno {new Date(l.updatedAt).toLocaleDateString("cs-CZ")}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="num block font-medium">−{money(l.balanceCzk)}</span>
                {l.currency !== "CZK" && <span className="num block text-xs text-muted">{money(l.balance, l.currency)}</span>}
              </span>
            </button>
          ))}
          <div className="py-2">
            <Button variant="ghost" size="sm" onClick={() => setEdit("new")}>
              <Plus size={14} /> Přidat závazek
            </Button>
          </div>
        </div>
      )}
      <Sheet open={edit != null} onClose={() => setEdit(null)} title={edit === "new" ? "Nový závazek" : "Upravit závazek"}>
        {edit != null && <LiabilityForm item={edit === "new" ? null : edit} onDone={() => setEdit(null)} />}
      </Sheet>
    </>
  );
}

function LiabilityForm({ item, onDone }: { item: Liability | null; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <form
      action={(fd) =>
        start(async () => {
          const balance = toNum(fd.get("balance"));
          if (balance == null) return setErr("Zadej zůstatek");
          const res = await upsertLiabilityAction({
            id: item?.id,
            name: String(fd.get("name") ?? ""),
            balance,
            currency: String(fd.get("currency") || "CZK"),
            interestRate: toNum(fd.get("interestRate")),
            notes: (fd.get("notes") as string) || null,
          });
          if (!res.ok) return setErr(res.error);
          router.refresh();
          onDone();
        })
      }
      className="space-y-4"
    >
      <Field label="Název">
        <Input name="name" defaultValue={item?.name} placeholder="Hypotéka" required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Zůstatek" hint={item ? "aktualizuj podle výpisu" : undefined}>
          <Input name="balance" inputMode="decimal" defaultValue={item?.balance ?? ""} required autoFocus={!!item} />
        </Field>
        <Field label="Měna">
          <Select name="currency" defaultValue={item?.currency ?? "CZK"}>
            {PORTFOLIO_CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Úrok % p.a.">
          <Input name="interestRate" inputMode="decimal" defaultValue={item?.interestRate ?? ""} placeholder="—" />
        </Field>
      </div>
      <Field label="Poznámka">
        <Textarea name="notes" defaultValue={item?.notes ?? ""} className="min-h-16" />
      </Field>
      {err && <p className="text-sm text-neg">{err}</p>}
      <div className="flex justify-between gap-2">
        {item ? (
          <ConfirmButton
            disabled={pending}
            onConfirm={() =>
              start(async () => {
                const res = await deleteLiabilityAction(item.id);
                if (!res.ok) return setErr(res.error);
                router.refresh();
                onDone();
              })
            }
          >
            Smazat
          </ConfirmButton>
        ) : (
          <span />
        )}
        <Button type="submit" disabled={pending}>
          {pending && <Spinner />} Uložit
        </Button>
      </div>
    </form>
  );
}

/* ── Archived assets toggle ── */

export function Collapsible({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3">
      <Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)}>
        {open ? "Skrýt" : "Zobrazit"} {title.toLowerCase()}
      </Button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mt-2 grid gap-2">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

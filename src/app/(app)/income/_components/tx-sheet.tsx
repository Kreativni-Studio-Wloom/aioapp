"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { motion } from "motion/react";
import { Button, Field, Input, Select, buttonClass } from "@/components/ui";
import { ConfirmButton, Segmented, Sheet, Spinner } from "@/components/ui/client";
import { isoDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CURRENCIES, EVENT_CATEGORIES, type TxKind } from "@/lib/income/constants";
import type { PickerData, Tx } from "@/lib/income/service";
import { deleteTransactionAction, saveTransaction } from "../actions";

export type TxDefaults = Partial<{ kind: TxKind; sourceId: string; eventId: string; category: string; date: string }>;

type Ctx = { openNew: (d?: TxDefaults) => void; openEdit: (tx: Tx) => void; data: PickerData };
const TxCtx = createContext<Ctx | null>(null);

export function useTxSheet() {
  const ctx = useContext(TxCtx);
  if (!ctx) throw new Error("useTxSheet outside TxSheetProvider");
  return ctx;
}

type State = { open: false } | { open: true; tx?: Tx; defaults?: TxDefaults; key: number };

export function TxSheetProvider({ data, children }: { data: PickerData; children: ReactNode }) {
  const [state, setState] = useState<State>({ open: false });
  const counter = useRef(0);
  const openNew = useCallback((defaults?: TxDefaults) => setState({ open: true, defaults, key: ++counter.current }), []);
  const openEdit = useCallback((tx: Tx) => setState({ open: true, tx, key: ++counter.current }), []);
  const close = useCallback(() => setState({ open: false }), []);
  const value = useMemo(() => ({ openNew, openEdit, data }), [openNew, openEdit, data]);
  const editing = state.open && state.tx;

  // `/income?add=1` (e.g. from the home dashboard) opens the add sheet right away
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("add") !== "1") return;
    url.searchParams.delete("add");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    // no cleanup on purpose: in StrictMode the second effect run no longer sees the param
    setTimeout(() => openNew(), 0);
  }, [openNew]);

  return (
    <TxCtx.Provider value={value}>
      {children}
      <Sheet open={state.open} onClose={close} title={editing ? "Upravit transakci" : "Nová transakce"}>
        {state.open && <TxForm key={state.key} data={data} tx={state.tx} defaults={state.defaults} onDone={close} />}
      </Sheet>
      {/* Floating add button */}
      <motion.button
        type="button"
        onClick={() => openNew()}
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        whileTap={{ scale: 0.92 }}
        transition={{ type: "spring", damping: 22, stiffness: 320 }}
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+5rem)] right-4 z-30 grid h-14 w-14 place-items-center rounded-full bg-fg text-inverse shadow-lg md:bottom-8 md:right-8"
        aria-label="Přidat transakci"
      >
        <Plus className="h-6 w-6" strokeWidth={2.25} />
      </motion.button>
    </TxCtx.Provider>
  );
}

/** Button that opens the add sheet with preset values. */
export function AddTxButton({
  defaults,
  children,
  variant = "secondary",
  size = "sm",
  className,
}: {
  defaults?: TxDefaults;
  children?: ReactNode;
  variant?: "primary" | "secondary" | "outline" | "ghost";
  size?: "sm" | "md";
  className?: string;
}) {
  const { openNew } = useTxSheet();
  return (
    <button type="button" onClick={() => openNew(defaults)} className={buttonClass(variant, size, className)}>
      {children ?? (
        <>
          <Plus className="h-4 w-4" /> Přidat
        </>
      )}
    </button>
  );
}

function eventCovers(e: { startDate: string; endDate: string | null }, date: string) {
  return e.startDate <= date && (e.endDate ?? e.startDate) >= date;
}

function TxForm({ data, tx, defaults, onDone }: { data: PickerData; tx?: Tx; defaults?: TxDefaults; onDone: () => void }) {
  const initialSource = tx?.sourceId ?? defaults?.sourceId ?? "";
  const sourceOf = (id: string) => data.sources.find((s) => s.id === id);
  const [kind, setKind] = useState<TxKind>(tx?.kind ?? defaults?.kind ?? "income");
  const [amount, setAmount] = useState(tx ? String(tx.amount).replace(".", ",") : "");
  const [currency, setCurrency] = useState(tx?.currency ?? sourceOf(initialSource)?.currency ?? "CZK");
  const [date, setDate] = useState(tx?.date ?? defaults?.date ?? isoDate());
  const [sourceId, setSourceId] = useState(initialSource);
  const [eventId, setEventId] = useState(() => {
    if (tx) return tx.eventId ?? "";
    if (defaults?.eventId) return defaults.eventId;
    if (!initialSource) return "";
    const d = defaults?.date ?? isoDate();
    const covering = data.events.filter((e) => e.sourceId === initialSource && eventCovers(e, d));
    return covering.length === 1 ? covering[0].id : "";
  });
  const [category, setCategory] = useState(tx?.category ?? defaults?.category ?? "");
  const [note, setNote] = useState(tx?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const [pending, start] = useTransition();
  const amountRef = useRef<HTMLInputElement>(null);

  const sources = data.sources.filter((s) => !s.archived || s.id === sourceId);
  const events = data.events.filter((e) => e.sourceId === sourceId);
  const suggestions = useMemo(() => {
    const base = eventId ? [...EVENT_CATEGORIES[kind], ...data.categories[kind]] : data.categories[kind];
    return [...new Set(base)].slice(0, 8);
  }, [eventId, kind, data.categories]);

  function changeSource(id: string) {
    setSourceId(id);
    const src = sourceOf(id);
    if (!tx && src) setCurrency(src.currency);
    const covering = data.events.filter((e) => e.sourceId === id && eventCovers(e, date));
    setEventId(covering.length === 1 ? covering[0].id : "");
  }

  function submit(again: boolean) {
    setError(null);
    start(async () => {
      const res = await saveTransaction({
        id: tx?.id,
        kind,
        amount,
        currency,
        date,
        sourceId: sourceId || null,
        eventId: eventId || null,
        category: category || null,
        note: note || null,
      });
      if (!res.ok) return setError(res.error);
      if (again) {
        setAmount("");
        setCategory("");
        setNote("");
        setSavedCount((c) => c + 1);
        amountRef.current?.focus();
      } else onDone();
    });
  }

  function remove() {
    if (!tx) return;
    start(async () => {
      const res = await deleteTransactionAction(tx.id);
      if (!res.ok) return setError(res.error);
      onDone();
    });
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit(false);
      }}
    >
      <Segmented
        value={kind}
        onChange={setKind}
        layoutId="tx-kind"
        className="w-full"
        options={[
          { value: "income", label: "Příjem" },
          { value: "expense", label: "Výdaj" },
        ]}
      />

      <div className="flex gap-2">
        <Input
          ref={amountRef}
          autoFocus={!tx}
          inputMode="decimal"
          placeholder="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="num h-14 flex-1 text-3xl font-semibold tracking-tight md:h-14"
          aria-label="Částka"
          required
        />
        <div className="w-24">
          <Select value={currency} onChange={(e) => setCurrency(e.target.value)} className="h-14 md:h-14" aria-label="Měna">
            {[...new Set([...CURRENCIES, currency])].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Datum">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Field label="Zdroj">
          <Select value={sourceId} onChange={(e) => changeSource(e.target.value)}>
            <option value="">Bez zdroje</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {events.length > 0 && (
        <Field label="Akce">
          <Select value={eventId} onChange={(e) => setEventId(e.target.value)}>
            <option value="">Bez akce</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} · {e.startDate.slice(8, 10)}.{e.startDate.slice(5, 7)}.{e.startDate.slice(0, 4)}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <Field label="Kategorie">
        <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="např. Tržba" list="income-cat-list" />
        <datalist id="income-cat-list">
          {data.categories[kind].map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </Field>
      <div className="-mt-2 flex flex-wrap gap-1.5">
        {suggestions.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            className={cn(
              "h-8 rounded-full border px-3 text-xs transition-colors",
              category === c ? "border-fg bg-fg text-inverse" : "border-line text-fg-soft hover:border-line-strong hover:text-fg",
            )}
          >
            {c}
          </button>
        ))}
      </div>

      <Field label="Poznámka">
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Volitelné" />
      </Field>

      {tx && tx.currency !== "CZK" && (
        <p className="num text-xs text-muted">
          Kurz {tx.fxRate.toLocaleString("cs-CZ", { maximumFractionDigits: 4 })} CZK/{tx.currency} k datu transakce
        </p>
      )}
      {error && <p className="text-sm text-neg">{error}</p>}
      {savedCount > 0 && !error && <p className="text-sm text-muted">Uloženo {savedCount}× – můžeš pokračovat dalším záznamem.</p>}

      <div className="flex flex-col gap-2 pt-1 sm:flex-row-reverse">
        <Button type="submit" size="lg" className="flex-1" disabled={pending}>
          {pending && <Spinner />} {tx ? "Uložit" : "Přidat"}
        </Button>
        {tx ? (
          <ConfirmButton size="lg" onConfirm={remove} disabled={pending} confirmText="Opravdu smazat?">
            Smazat
          </ConfirmButton>
        ) : (
          <Button variant="secondary" size="lg" disabled={pending} onClick={() => submit(true)}>
            Uložit a další
          </Button>
        )}
      </div>
    </form>
  );
}

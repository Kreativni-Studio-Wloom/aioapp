"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { Pencil, Plus, X } from "lucide-react";
import { Button, Field, Input, Select, Textarea, buttonClass } from "@/components/ui";
import { ConfirmButton, Segmented, Sheet, Spinner } from "@/components/ui/client";
import { isoDate, money } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CURRENCIES, SOURCE_TYPES, type IncomeSourceType, type TxKind } from "@/lib/income/constants";
import type { IncomeEvent, RecurringRule, Source } from "@/lib/income/service";
import {
  archiveSourceAction,
  deleteEventAction,
  deleteRuleAction,
  deleteSourceAction,
  saveEvent,
  saveRule,
  saveSource,
  toggleRuleAction,
} from "../actions";

type BtnProps = { label?: ReactNode; variant?: "primary" | "secondary" | "outline" | "ghost"; size?: "sm" | "md" | "icon"; className?: string };

function useSheet() {
  const [open, setOpen] = useState(false);
  return { open, show: () => setOpen(true), hide: () => setOpen(false) };
}

function Actions({ pending, error, label, extra }: { pending: boolean; error: string | null; label: string; extra?: ReactNode }) {
  return (
    <>
      {error && <p className="text-sm text-neg">{error}</p>}
      <div className="flex flex-col gap-2 pt-1 sm:flex-row-reverse">
        <Button type="submit" size="lg" className="flex-1" disabled={pending}>
          {pending && <Spinner />} {label}
        </Button>
        {extra}
      </div>
    </>
  );
}

/* ── Source ───────────────────────────────────────────── */

export function SourceButton({ source, label, variant = "primary", size = "sm", className }: BtnProps & { source?: Source }) {
  const s = useSheet();
  return (
    <>
      <button type="button" onClick={s.show} className={buttonClass(variant, size, className)} aria-label={source ? "Upravit zdroj" : "Nový zdroj"}>
        {label ?? (source ? <Pencil className="h-4 w-4" /> : <><Plus className="h-4 w-4" /> Nový zdroj</>)}
      </button>
      <Sheet open={s.open} onClose={s.hide} title={source ? "Upravit zdroj" : "Nový zdroj"}>
        {s.open && <SourceForm source={source} onDone={s.hide} />}
      </Sheet>
    </>
  );
}

function SourceForm({ source, onDone }: { source?: Source; onDone: () => void }) {
  const router = useRouter();
  const [type, setType] = useState<IncomeSourceType>(source?.type ?? "business");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setError(null);
        start(async () => {
          const res = await saveSource({
            id: source?.id,
            name: String(f.get("name") ?? ""),
            type,
            currency: String(f.get("currency") ?? "CZK"),
            notes: String(f.get("notes") ?? "") || null,
          });
          if (!res.ok) return setError(res.error);
          onDone();
          if (!source && res.data) router.push(`/income/sources/${res.data.id}`);
        });
      }}
    >
      <Field label="Název">
        <Input name="name" defaultValue={source?.name} placeholder="např. Matcha stánek" autoFocus={!source} required />
      </Field>
      <Field label="Typ">
        <div className="flex flex-wrap gap-1.5">
          {SOURCE_TYPES.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setType(o.value)}
              className={cn(
                "h-10 rounded-full border px-4 text-sm transition-colors",
                type === o.value ? "border-fg bg-fg text-inverse" : "border-line text-fg-soft hover:border-line-strong",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Výchozí měna" hint="Předvyplní se u nových transakcí tohoto zdroje.">
        <Select name="currency" defaultValue={source?.currency ?? "CZK"}>
          {CURRENCIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
      </Field>
      <Field label="Poznámka">
        <Textarea name="notes" defaultValue={source?.notes ?? ""} className="min-h-16" />
      </Field>
      <Actions pending={pending} error={error} label={source ? "Uložit" : "Vytvořit"} />
    </form>
  );
}

export function SourceDangerZone({ source }: { source: Source }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await archiveSourceAction(source.id, !source.archived);
            if (!res.ok) setError(res.error);
          })
        }
      >
        {source.archived ? "Obnovit z archivu" : "Archivovat"}
      </Button>
      <ConfirmButton
        size="sm"
        disabled={pending}
        confirmText="Smazat i akce a pravidla?"
        onConfirm={() =>
          start(async () => {
            const res = await deleteSourceAction(source.id);
            if (!res.ok) return setError(res.error);
            router.push("/income/sources");
          })
        }
      >
        Smazat zdroj
      </ConfirmButton>
      {error && <span className="text-sm text-neg">{error}</span>}
    </div>
  );
}

/* ── Event ────────────────────────────────────────────── */

type SourceOpt = { id: string; name: string };

export function EventButton({
  event,
  sources,
  sourceId,
  label,
  variant = "primary",
  size = "sm",
  className,
}: BtnProps & { event?: IncomeEvent; sources: SourceOpt[]; sourceId?: string }) {
  const s = useSheet();
  return (
    <>
      <button type="button" onClick={s.show} className={buttonClass(variant, size, className)} aria-label={event ? "Upravit akci" : "Nová akce"}>
        {label ?? (event ? <Pencil className="h-4 w-4" /> : <><Plus className="h-4 w-4" /> Nová akce</>)}
      </button>
      <Sheet open={s.open} onClose={s.hide} title={event ? "Upravit akci" : "Nová akce"}>
        {s.open && <EventForm event={event} sources={sources} sourceId={sourceId} onDone={s.hide} />}
      </Sheet>
    </>
  );
}

function EventForm({ event, sources, sourceId, onDone }: { event?: IncomeEvent; sources: SourceOpt[]; sourceId?: string; onDone: () => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [startDate, setStartDate] = useState(event?.startDate ?? isoDate());

  if (!sources.length) return <p className="pb-4 text-sm text-muted">Nejdřív si vytvoř zdroj typu Podnikání – akce patří k podnikání.</p>;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setError(null);
        start(async () => {
          const res = await saveEvent({
            id: event?.id,
            sourceId: String(f.get("sourceId") ?? ""),
            name: String(f.get("name") ?? ""),
            location: String(f.get("location") ?? "") || null,
            startDate,
            endDate: String(f.get("endDate") ?? "") || null,
            notes: String(f.get("notes") ?? "") || null,
          });
          if (!res.ok) return setError(res.error);
          onDone();
          if (!event && res.data) router.push(`/income/events/${res.data.id}`);
        });
      }}
    >
      <Field label="Název">
        <Input name="name" defaultValue={event?.name} placeholder="např. Letní festival" autoFocus={!event} required />
      </Field>
      {sources.length > 1 || !sourceId ? (
        <Field label="Zdroj">
          <Select name="sourceId" defaultValue={event?.sourceId ?? sourceId ?? sources[0]?.id}>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <input type="hidden" name="sourceId" value={sourceId} />
      )}
      <Field label="Místo">
        <Input name="location" defaultValue={event?.location ?? ""} placeholder="Město, areál…" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Od">
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
        </Field>
        <Field label="Do">
          <Input type="date" name="endDate" defaultValue={event?.endDate ?? ""} min={startDate} />
        </Field>
      </div>
      <Field label="Poznámka">
        <Textarea name="notes" defaultValue={event?.notes ?? ""} className="min-h-16" />
      </Field>
      <Actions pending={pending} error={error} label={event ? "Uložit" : "Vytvořit akci"} />
    </form>
  );
}

export function DeleteEventButton({ eventId, hasTransactions }: { eventId: string; hasTransactions: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const del = (withTx: boolean) =>
    start(async () => {
      const res = await deleteEventAction(eventId, withTx);
      if (!res.ok) return setError(res.error);
      router.push("/income/events");
    });
  return (
    <div className="flex flex-wrap items-center gap-2">
      {hasTransactions && (
        <ConfirmButton size="sm" disabled={pending} confirmText="Smazat vč. transakcí?" onConfirm={() => del(true)}>
          Smazat s transakcemi
        </ConfirmButton>
      )}
      <ConfirmButton size="sm" disabled={pending} confirmText="Opravdu smazat?" onConfirm={() => del(false)}>
        {hasTransactions ? "Smazat jen akci" : "Smazat akci"}
      </ConfirmButton>
      {error && <span className="text-sm text-neg">{error}</span>}
    </div>
  );
}

/* ── Recurring rule ───────────────────────────────────── */

export function RuleButton({
  rule,
  sources,
  sourceId,
  label,
  variant = "primary",
  size = "sm",
  className,
}: BtnProps & { rule?: RecurringRule; sources: SourceOpt[]; sourceId?: string }) {
  const s = useSheet();
  return (
    <>
      <button type="button" onClick={s.show} className={buttonClass(variant, size, className)} aria-label={rule ? "Upravit pravidlo" : "Nové pravidlo"}>
        {label ?? (rule ? <Pencil className="h-4 w-4" /> : <><Plus className="h-4 w-4" /> Nové pravidlo</>)}
      </button>
      <Sheet open={s.open} onClose={s.hide} title={rule ? "Upravit pravidlo" : "Opakovaná transakce"}>
        {s.open && <RuleForm rule={rule} sources={sources} sourceId={sourceId} onDone={s.hide} />}
      </Sheet>
    </>
  );
}

function RuleForm({ rule, sources, sourceId, onDone }: { rule?: RecurringRule; sources: SourceOpt[]; sourceId?: string; onDone: () => void }) {
  const [kind, setKind] = useState<TxKind>(rule?.kind ?? "income");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setError(null);
        start(async () => {
          const res = await saveRule({
            id: rule?.id,
            kind,
            amount: String(f.get("amount") ?? ""),
            currency: String(f.get("currency") ?? "CZK"),
            dayOfMonth: Number(f.get("dayOfMonth")),
            sourceId: String(f.get("sourceId") ?? "") || null,
            category: String(f.get("category") ?? "") || null,
            note: String(f.get("note") ?? "") || null,
            startMonth: String(f.get("startMonth") ?? ""),
          });
          if (!res.ok) return setError(res.error);
          onDone();
        });
      }}
    >
      <Segmented
        value={kind}
        onChange={setKind}
        layoutId="rule-kind"
        className="w-full"
        options={[
          { value: "income", label: "Příjem" },
          { value: "expense", label: "Výdaj" },
        ]}
      />
      <div className="flex gap-2">
        <Input
          name="amount"
          inputMode="decimal"
          placeholder="0"
          defaultValue={rule ? String(rule.amount).replace(".", ",") : ""}
          className="num h-14 flex-1 text-3xl font-semibold md:h-14"
          aria-label="Částka"
          autoFocus={!rule}
          required
        />
        <div className="w-24">
          <Select name="currency" defaultValue={rule?.currency ?? "CZK"} className="h-14 md:h-14" aria-label="Měna">
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Den v měsíci" hint="31 = poslední den">
          <Input name="dayOfMonth" type="number" inputMode="numeric" min={1} max={31} defaultValue={rule?.dayOfMonth ?? 1} required />
        </Field>
        <Field label={rule ? "Generovat od" : "Začít od"} hint={rule ? "Prázdné = beze změny" : "Prázdné = nejbližší termín"}>
          <Input name="startMonth" type="month" />
        </Field>
      </div>
      <Field label="Zdroj">
        <Select name="sourceId" defaultValue={rule?.sourceId ?? sourceId ?? ""}>
          <option value="">Bez zdroje</option>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Kategorie">
          <Input name="category" defaultValue={rule?.category ?? ""} placeholder={kind === "income" ? "Nájem" : "Hypotéka"} />
        </Field>
        <Field label="Poznámka">
          <Input name="note" defaultValue={rule?.note ?? ""} />
        </Field>
      </div>
      <Actions pending={pending} error={error} label={rule ? "Uložit" : "Vytvořit"} />
    </form>
  );
}

export function RuleRow({ rule, sources, showSource = true }: { rule: RecurringRule; sources: SourceOpt[]; showSource?: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Chyba");
    });
  return (
    <div className={cn("flex items-center justify-between gap-3 border-b border-line py-3 last:border-0", !rule.active && "opacity-50")}>
      <div className="min-w-0">
        <div className="truncate font-medium">
          {rule.category ?? rule.note ?? (rule.kind === "income" ? "Příjem" : "Výdaj")}
          {showSource && rule.sourceName && <span className="font-normal text-muted"> · {rule.sourceName}</span>}
        </div>
        <div className="num text-xs text-muted">
          {rule.dayOfMonth === 31 ? "poslední den" : `${rule.dayOfMonth}.`} v měsíci
          {rule.nextDate && ` · další ${rule.nextDate.split("-").reverse().join(". ").replace(/^0/, "")}`}
          {!rule.active && " · pozastaveno"}
        </div>
        {error && <div className="text-xs text-neg">{error}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <span className={cn("num mr-2 font-semibold", rule.kind === "income" ? "text-pos" : "text-fg")}>
          {rule.kind === "income" ? "+" : "−"}
          {money(rule.amount, rule.currency)}
        </span>
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => act(() => toggleRuleAction(rule.id, !rule.active))}>
          {rule.active ? "Pozastavit" : "Obnovit"}
        </Button>
        <RuleButton rule={rule} sources={sources} variant="ghost" size="icon" />
        <ConfirmButton size="sm" variant="ghost" disabled={pending} confirmText="Smazat?" onConfirm={() => act(() => deleteRuleAction(rule.id))}>
          <X className="h-4 w-4" aria-label="Smazat" />
        </ConfirmButton>
      </div>
    </div>
  );
}

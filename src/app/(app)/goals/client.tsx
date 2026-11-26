"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Field, Input, Select } from "@/components/ui";
import { Sheet, SubmitButton } from "@/components/ui/client";
import type { ActionResult } from "@/lib/utils";
import { removeGoal, saveGoal } from "./actions";

type Opt = { id: string; name: string };

const KINDS = [
  { value: "exercise_1rm", label: "Síla – odhad 1RM cviku", unit: "kg" },
  { value: "body_weight", label: "Tělesná váha", unit: "kg" },
  { value: "income_year", label: "Čistý příjem za tento rok", unit: "Kč" },
  { value: "net_worth", label: "Čisté jmění", unit: "Kč" },
  { value: "portfolio_value", label: "Hodnota portfolia", unit: "Kč" },
] as const;

function GoalForm({ exercises, sources, onDone }: { exercises: Opt[]; sources: Opt[]; onDone: () => void }) {
  const [kind, setKind] = useState<(typeof KINDS)[number]["value"]>("exercise_1rm");
  const [state, action] = useActionState<ActionResult | undefined, FormData>(saveGoal, undefined);
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);
  const unit = KINDS.find((k) => k.value === kind)?.unit;

  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Co sledovat">
        <Select name="kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </Select>
      </Field>
      {kind === "exercise_1rm" && (
        <Field label="Cvik">
          <Select name="ref" required defaultValue="">
            <option value="" disabled>
              Vyber cvik…
            </option>
            {exercises.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {kind === "income_year" && sources.length > 0 && (
        <Field label="Zdroj" hint="Prázdné = všechny zdroje dohromady">
          <Select name="ref" defaultValue="">
            <option value="">Všechny zdroje</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field label={`Cílová hodnota (${unit})`}>
        <Input name="target" inputMode="decimal" required placeholder={unit === "kg" ? "100" : "500000"} />
      </Field>
      <Field label="Termín (nepovinné)">
        <Input name="deadline" type="date" />
      </Field>
      <Field label="Název (nepovinné)" hint="Bez názvu se vytvoří sám">
        <Input name="title" maxLength={120} />
      </Field>
      {state && !state.ok && <p className="text-sm text-neg">{state.error}</p>}
      <SubmitButton>Uložit cíl</SubmitButton>
    </form>
  );
}

export function GoalButton({ exercises, sources }: { exercises: Opt[]; sources: Opt[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Nový cíl
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Nový cíl">
        {open && <GoalForm exercises={exercises} sources={sources} onDone={() => setOpen(false)} />}
      </Sheet>
    </>
  );
}

export function DeleteGoal({ id }: { id: string }) {
  const [armed, setArmed] = useState(false);
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => (armed ? start(() => removeGoal(id)) : setArmed(true))}
      onBlur={() => setArmed(false)}
      className={armed ? "rounded-lg px-2 py-1 text-xs text-neg" : "rounded-lg p-1.5 text-subtle hover:text-fg"}
      aria-label="Smazat cíl"
    >
      {armed ? "Smazat?" : <Trash2 className="h-4 w-4" />}
    </button>
  );
}

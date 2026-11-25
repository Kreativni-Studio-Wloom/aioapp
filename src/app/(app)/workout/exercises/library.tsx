"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Plus, Search } from "lucide-react";
import { Button, Field, Input, Select } from "@/components/ui";
import { Sheet } from "@/components/ui/client";
import { EQUIPMENT, MUSCLES, PATTERNS, equipmentLabel, muscleLabel, patternLabel } from "@/lib/workout/constants";
import type { ExerciseDTO } from "@/lib/workout/service";
import type { Equipment } from "@/db/schema";
import { createExerciseAction } from "../actions";
import { MuscleChips, filterExercises } from "../_components/exercise-picker";

export function ExerciseLibrary({ exercises }: { exercises: ExerciseDTO[] }) {
  const [q, setQ] = useState("");
  const [muscle, setMuscle] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const list = useMemo(() => filterExercises(exercises, q, muscle), [exercises, q, muscle]);

  return (
    <>
      <div className="sticky top-12 z-20 -mx-4 space-y-2 bg-bg/90 px-4 pb-3 pt-1 backdrop-blur-xl md:top-0 md:mx-0 md:px-0">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hledat cvik…" className="pl-9" type="search" />
          </div>
          <Button onClick={() => setAdding(true)} aria-label="Vlastní cvik">
            <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Vlastní cvik</span>
          </Button>
        </div>
        <MuscleChips value={muscle} onChange={setMuscle} />
      </div>

      <div className="overflow-hidden rounded-2xl bg-card">
        {list.map((e) => (
          <Link
            key={e.id}
            href={`/workout/exercises/${e.id}`}
            className="flex min-h-14 items-center gap-3 border-b border-line px-4 py-2.5 transition-colors last:border-0 hover:bg-card-hover"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{e.name}</div>
              <div className="truncate text-xs text-muted">
                {muscleLabel(e.primaryMuscle)}
                {e.secondaryMuscles.length ? ` + ${e.secondaryMuscles.map(muscleLabel).join(", ")}` : ""}
              </div>
            </div>
            <span className="shrink-0 text-xs text-muted">{equipmentLabel(e.equipment)}</span>
            {e.isCustom && <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[11px] text-fg-soft">vlastní</span>}
            <ChevronRight className="h-4 w-4 shrink-0 text-subtle" />
          </Link>
        ))}
        {!list.length && <div className="p-8 text-center text-sm text-muted">Nic nenalezeno.</div>}
      </div>

      <CustomExerciseSheet open={adding} onClose={() => setAdding(false)} initialName={q} />
    </>
  );
}

export function CustomExerciseSheet({
  open,
  onClose,
  initialName = "",
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  initialName?: string;
  onCreated?: (e: ExerciseDTO) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <Sheet open={open} onClose={onClose} title="Vlastní cvik">
      <form
        className="space-y-4"
        onSubmit={(ev) => {
          ev.preventDefault();
          const f = new FormData(ev.currentTarget);
          const secondary = f.getAll("secondary").map(String);
          start(async () => {
            const r = await createExerciseAction({
              name: String(f.get("name") ?? ""),
              primaryMuscle: String(f.get("primaryMuscle")),
              pattern: String(f.get("pattern")),
              equipment: String(f.get("equipment")) as Equipment,
              secondaryMuscles: secondary,
              isUnilateral: f.get("unilateral") === "on",
            });
            if (!r.ok) return setError(r.error);
            setError(null);
            onClose();
            if (onCreated && r.data) onCreated(r.data);
            else if (r.data) router.push(`/workout/exercises/${r.data.id}`);
          });
        }}
      >
        <Field label="Název">
          <Input name="name" defaultValue={initialName} required minLength={2} maxLength={80} placeholder="např. Tlak na hrudník v leže" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Hlavní sval">
            <Select name="primaryMuscle" defaultValue="chest">
              {MUSCLES.map((m) => (
                <option key={m} value={m}>
                  {muscleLabel(m)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Vybavení">
            <Select name="equipment" defaultValue="barbell">
              {EQUIPMENT.map((m) => (
                <option key={m} value={m}>
                  {equipmentLabel(m)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Pohybový vzor" hint="Podle vzoru se hledají náhrady.">
          <Select name="pattern" defaultValue="horizontal_push">
            {PATTERNS.map((m) => (
              <option key={m} value={m}>
                {patternLabel(m)}
              </option>
            ))}
          </Select>
        </Field>
        <div>
          <div className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted">Vedlejší svaly</div>
          <div className="flex flex-wrap gap-1.5">
            {MUSCLES.map((m) => (
              <label key={m} className="cursor-pointer">
                <input type="checkbox" name="secondary" value={m} className="peer sr-only" />
                <span className="inline-flex h-8 items-center rounded-full bg-card px-3 text-sm text-fg-soft transition-colors peer-checked:bg-fg peer-checked:text-inverse">
                  {muscleLabel(m)}
                </span>
              </label>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="unilateral" className="h-4 w-4 accent-[var(--fg)]" /> Jednostranný cvik
        </label>
        {error && <p className="text-sm text-neg">{error}</p>}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Ukládám…" : "Uložit cvik"}
        </Button>
      </form>
    </Sheet>
  );
}

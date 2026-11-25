"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Sheet } from "@/components/ui/client";
import { Input } from "@/components/ui";
import { cn } from "@/lib/utils";
import { MUSCLES, equipmentLabel, muscleLabel } from "@/lib/workout/constants";
import type { ExerciseDTO } from "@/lib/workout/service";

export const normalizeText = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

export function filterExercises(list: ExerciseDTO[], q: string, muscle: string | null) {
  const terms = normalizeText(q).split(/\s+/).filter(Boolean);
  return list.filter((e) => {
    if (muscle && e.primaryMuscle !== muscle) return false;
    if (!terms.length) return true;
    const hay = normalizeText(`${e.name} ${muscleLabel(e.primaryMuscle)} ${equipmentLabel(e.equipment)}`);
    return terms.every((t) => hay.includes(t));
  });
}

export function MuscleChips({ value, onChange }: { value: string | null; onChange: (m: string | null) => void }) {
  return (
    <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {[null, ...MUSCLES].map((m) => (
        <button
          key={m ?? "all"}
          type="button"
          onClick={() => onChange(m)}
          className={cn(
            "h-8 shrink-0 rounded-full px-3 text-sm transition-colors",
            value === m ? "bg-fg text-inverse" : "bg-card text-fg-soft hover:bg-card-hover",
          )}
        >
          {m ? muscleLabel(m) : "Vše"}
        </button>
      ))}
    </div>
  );
}

/** Bottom sheet for picking an exercise from the library. */
export function ExercisePicker({
  open,
  onClose,
  exercises,
  onPick,
  title = "Přidat cvik",
}: {
  open: boolean;
  onClose: () => void;
  exercises: ExerciseDTO[];
  onPick: (e: ExerciseDTO) => void;
  title?: string;
}) {
  const [q, setQ] = useState("");
  const [muscle, setMuscle] = useState<string | null>(null);
  const list = useMemo(() => filterExercises(exercises, q, muscle), [exercises, q, muscle]);
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="sticky top-0 z-10 -mx-5 space-y-2 bg-bg-elev px-5 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hledat cvik…" className="pl-9" />
        </div>
        <MuscleChips value={muscle} onChange={setMuscle} />
      </div>
      <div className="mt-1 min-h-[40dvh]">
        {list.map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => {
              onPick(e);
              onClose();
            }}
            className="flex min-h-12 w-full items-center justify-between gap-3 border-b border-line py-2.5 text-left last:border-0 hover:bg-card"
          >
            <span className="min-w-0">
              <span className="block truncate font-medium">{e.name}</span>
              <span className="block truncate text-xs text-muted">
                {muscleLabel(e.primaryMuscle)} · {equipmentLabel(e.equipment)}
                {e.isCustom ? " · vlastní" : ""}
              </span>
            </span>
          </button>
        ))}
        {!list.length && <div className="py-10 text-center text-sm text-muted">Nic nenalezeno.</div>}
      </div>
    </Sheet>
  );
}

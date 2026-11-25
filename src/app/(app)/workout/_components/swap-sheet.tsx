"use client";

import { useState, type ReactNode } from "react";
import { Badge, Button } from "@/components/ui";
import { Sheet, Spinner } from "@/components/ui/client";
import { equipmentLabel, muscleLabel } from "@/lib/workout/constants";
import type { AlternativeDTO, ExerciseDTO } from "@/lib/workout/service";
import { ExercisePicker } from "./exercise-picker";

/** "Nejde to? → Náhrada": ranked alternatives + fallback to the full library. `alternatives = null` means loading. */
export function SwapSheet({
  open,
  currentName,
  alternatives,
  exercises,
  onPick,
  onClose,
  children,
}: {
  open: boolean;
  currentName?: string;
  alternatives: AlternativeDTO[] | null;
  exercises: ExerciseDTO[];
  onPick: (e: ExerciseDTO) => void;
  onClose: () => void;
  children?: ReactNode;
}) {
  const [all, setAll] = useState(false);
  if (all)
    return (
      <ExercisePicker
        open={open}
        exercises={exercises}
        title="Vyměnit za…"
        onClose={() => {
          setAll(false);
          onClose();
        }}
        onPick={(e) => {
          setAll(false);
          onPick(e);
        }}
      />
    );
  return (
    <Sheet open={open} onClose={onClose} title="Náhrada cviku">
      {currentName && <p className="mb-2 text-sm text-muted">Místo „{currentName}“:</p>}
      {children}
      {alternatives == null ? (
        <div className="flex justify-center py-8 text-muted">
          <Spinner />
        </div>
      ) : alternatives.length ? (
        <div>
          {alternatives.map((a) => (
            <button
              key={a.id}
              onClick={() => onPick(a)}
              className="flex min-h-12 w-full items-center justify-between gap-3 border-b border-line py-2.5 text-left last:border-0 hover:bg-card"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{a.name}</span>
                <span className="block truncate text-xs text-muted">
                  {a.match === "pattern_muscle" ? "Stejný pohyb i sval" : a.match === "muscle" ? `Stejný sval · ${muscleLabel(a.primaryMuscle)}` : "Stejný pohyb"}
                </span>
              </span>
              <Badge>{equipmentLabel(a.equipment)}</Badge>
            </button>
          ))}
        </div>
      ) : (
        <div className="py-6 text-center text-sm text-muted">Žádné podobné cviky.</div>
      )}
      <Button variant="outline" className="mt-4 w-full" onClick={() => setAll(true)}>
        Vybrat z celé knihovny
      </Button>
    </Sheet>
  );
}

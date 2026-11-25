// Pure, client-safe workout math.

/** Epley estimated 1RM. */
export function e1rm(weightKg: number, reps: number) {
  if (!weightKg || !reps) return 0;
  if (reps === 1) return weightKg;
  return Math.round(weightKg * (1 + reps / 30) * 10) / 10;
}

export const roundTo = (v: number, step = 2.5) => Math.round(v / step) * step;

export type SimpleSet = { weightKg: number; reps: number; isWarmup?: boolean; completed?: boolean };

export function setVolume(sets: SimpleSet[]) {
  return sets.reduce((s, x) => (x.isWarmup || x.completed === false ? s : s + x.weightKg * x.reps), 0);
}

/** Best working set: heaviest weight, ties broken by reps. */
export function bestSet<T extends SimpleSet>(sets: T[]): T | null {
  let best: T | null = null;
  for (const s of sets) {
    if (s.isWarmup || s.completed === false || s.reps <= 0) continue;
    if (!best || s.weightKg > best.weightKg || (s.weightKg === best.weightKg && s.reps > best.reps)) best = s;
  }
  return best;
}

export type ProgressionHint =
  | { kind: "increase"; weightKg: number; reps: number; text: string }
  | { kind: "hold"; weightKg: number; reps: number; text: string }
  | { kind: "none"; text: string };

/**
 * Double progression: when every working set last time reached repMax, add incrementKg and drop back to repMin.
 * Otherwise keep the weight and aim for +1 rep.
 */
export function progressionHint(
  last: SimpleSet[] | null | undefined,
  target: { repMin: number; repMax: number; incrementKg: number; progression: "double" | "none"; sets?: number },
): ProgressionHint {
  const work = (last ?? []).filter((s) => !s.isWarmup && s.completed !== false && s.reps > 0);
  if (!work.length) return { kind: "none", text: "Zatím bez historie – zvol pracovní váhu." };
  if (target.progression === "none") return { kind: "none", text: "Bez automatické progrese." };
  const top = Math.max(...work.map((s) => s.weightKg));
  const topSets = work.filter((s) => s.weightKg === top);
  const allHit = topSets.every((s) => s.reps >= target.repMax) && (!target.sets || topSets.length >= target.sets);
  if (allHit && top > 0) {
    const w = Math.round((top + target.incrementKg) * 100) / 100;
    return { kind: "increase", weightKg: w, reps: target.repMin, text: `Přidej váhu: ${fmtKg(w)} kg × ${target.repMin}` };
  }
  if (allHit && top === 0) {
    return { kind: "hold", weightKg: 0, reps: target.repMax + 1, text: "Všechna opakování splněna – zkus přidat zátěž nebo opakování." };
  }
  const minReps = Math.min(...topSets.map((s) => s.reps));
  const goal = Math.min(target.repMax, minReps + 1);
  return { kind: "hold", weightKg: top, reps: goal, text: `Drž ${fmtKg(top)} kg, cíl ${goal}+ opakování` };
}

export function fmtKg(v: number) {
  return v.toLocaleString("cs-CZ", { maximumFractionDigits: 2 });
}

export const PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];

/** Plates per side for a target weight on a bar. Returns remainder that can't be loaded. */
export function platesPerSide(totalKg: number, barKg = 20, plates = PLATES) {
  let side = (totalKg - barKg) / 2;
  if (side <= 0) return { plates: [] as number[], remainder: 0 };
  const out: number[] = [];
  for (const p of plates) {
    while (side >= p - 1e-9) {
      out.push(p);
      side -= p;
    }
  }
  return { plates: out, remainder: Math.round(side * 2 * 100) / 100 };
}

/** Simple moving average over a window, by index (null values skipped). */
export function movingAverage(values: (number | null)[], window = 7): (number | null)[] {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - window + 1), i + 1).filter((v): v is number => v != null);
    return slice.length ? Math.round((slice.reduce((a, b) => a + b, 0) / slice.length) * 10) / 10 : null;
  });
}

/** "850 kg" or "12,4 t" for big volumes. */
export function fmtVolume(kg: number) {
  if (kg >= 10000) return `${(kg / 1000).toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} t`;
  return `${Math.round(kg).toLocaleString("cs-CZ")} kg`;
}

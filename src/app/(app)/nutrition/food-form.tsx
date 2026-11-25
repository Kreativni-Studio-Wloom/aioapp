"use client";

import { useState, useTransition } from "react";
import { Button, Field, Input } from "@/components/ui";
import { Spinner } from "@/components/ui/client";
import { num } from "@/lib/format";
import { toNum } from "@/lib/utils";
import type { Food } from "@/lib/nutrition/service";
import { saveFoodAction } from "./actions";

type Initial = Partial<Pick<Food, "name" | "brand" | "ean" | "kcal" | "protein" | "carbs" | "fat" | "fiber" | "sugar" | "salt" | "servingG" | "isFavorite">>;

const s = (v: number | string | null | undefined) => (v == null ? "" : String(v).replace(".", ","));

/** Create / edit a custom food (values per 100 g). */
export function FoodForm({ id, initial, onSaved, submitLabel = "Uložit" }: { id?: string | null; initial?: Initial; onSaved: (f: Food) => void; submitLabel?: string }) {
  const [v, setV] = useState({
    name: initial?.name ?? "",
    brand: initial?.brand ?? "",
    ean: initial?.ean ?? "",
    kcal: s(initial?.kcal),
    protein: s(initial?.protein),
    carbs: s(initial?.carbs),
    fat: s(initial?.fat),
    fiber: s(initial?.fiber),
    sugar: s(initial?.sugar),
    salt: s(initial?.salt),
    servingG: s(initial?.servingG),
  });
  const [fav, setFav] = useState(initial?.isFavorite ?? false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV((p) => ({ ...p, [k]: e.target.value }));

  const p = toNum(v.protein) ?? 0;
  const c = toNum(v.carbs) ?? 0;
  const f = toNum(v.fat) ?? 0;
  const computed = Math.round(p * 4 + c * 4 + f * 9);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const kcal = toNum(v.kcal) ?? (p || c || f ? computed : null);
    if (!v.name.trim()) return setError("Vyplň název.");
    if (kcal == null) return setError("Vyplň energii nebo makra.");
    startTransition(async () => {
      const res = await saveFoodAction(id ?? null, {
        name: v.name,
        brand: v.brand || null,
        ean: v.ean || null,
        kcal,
        protein: p,
        carbs: c,
        fat: f,
        fiber: toNum(v.fiber),
        sugar: toNum(v.sugar),
        salt: toNum(v.salt),
        servingG: toNum(v.servingG),
        isFavorite: fav,
      });
      if (res.ok && res.data) onSaved(res.data);
      else if (!res.ok) setError(res.error);
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Field label="Název">
        <Input value={v.name} onChange={set("name")} placeholder="např. Tvaroh polotučný" required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Značka">
          <Input value={v.brand} onChange={set("brand")} />
        </Field>
        <Field label="EAN">
          <Input value={v.ean} onChange={set("ean")} inputMode="numeric" />
        </Field>
      </div>
      <div className="mt-1 text-xs font-medium uppercase tracking-wider text-muted">Na 100 g</div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Energie (kcal)" hint={!v.kcal && computed > 0 ? `z maker ≈ ${num(computed)} kcal` : undefined}>
          <Input inputMode="decimal" value={v.kcal} onChange={set("kcal")} />
        </Field>
        <Field label="Bílkoviny (g)">
          <Input inputMode="decimal" value={v.protein} onChange={set("protein")} />
        </Field>
        <Field label="Sacharidy (g)">
          <Input inputMode="decimal" value={v.carbs} onChange={set("carbs")} />
        </Field>
        <Field label="Tuky (g)">
          <Input inputMode="decimal" value={v.fat} onChange={set("fat")} />
        </Field>
        <Field label="Vláknina (g)">
          <Input inputMode="decimal" value={v.fiber} onChange={set("fiber")} />
        </Field>
        <Field label="Cukry (g)">
          <Input inputMode="decimal" value={v.sugar} onChange={set("sugar")} />
        </Field>
        <Field label="Sůl (g)">
          <Input inputMode="decimal" value={v.salt} onChange={set("salt")} />
        </Field>
        <Field label="Porce (g)">
          <Input inputMode="decimal" value={v.servingG} onChange={set("servingG")} placeholder="volitelné" />
        </Field>
      </div>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" checked={fav} onChange={(e) => setFav(e.target.checked)} className="h-5 w-5 accent-[var(--fg)]" />
        Oblíbená potravina
      </label>
      {error && <p className="text-sm text-neg">{error}</p>}
      <Button type="submit" disabled={pending} size="lg">
        {pending && <Spinner />} {submitLabel}
      </Button>
    </form>
  );
}

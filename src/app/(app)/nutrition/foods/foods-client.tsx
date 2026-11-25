"use client";

import { useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Plus, Search, Star } from "lucide-react";
import { Button, Empty, Input } from "@/components/ui";
import { ConfirmButton, Segmented, Sheet } from "@/components/ui/client";
import { num } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Food } from "@/lib/nutrition/service";
import { deleteFoodAction, setFavoriteAction } from "../actions";
import { FoodForm } from "../food-form";

type Item = Food & { lastUsedAt: string | null; uses: number };

export function FoodsClient({ foods }: { foods: Item[] }) {
  const [filter, setFilter] = useState<"all" | "fav">("all");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Item | "new" | null>(null);
  const [, startTransition] = useTransition();

  const query = q.trim().toLowerCase();
  const list = foods.filter(
    (f) => (filter === "all" || f.isFavorite) && (!query || f.name.toLowerCase().includes(query) || f.brand?.toLowerCase().includes(query) || f.ean === query),
  );

  const toggleFav = (f: Item) =>
    startTransition(async () => {
      await setFavoriteAction(f.id, !f.isFavorite);
    });

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: `Všechny (${foods.length})` },
            { value: "fav", label: `Oblíbené (${foods.filter((f) => f.isFavorite).length})` },
          ]}
          layoutId="foods-filter"
        />
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
          <Input placeholder="Filtrovat…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-10" />
        </div>
        <Button onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" /> Nová potravina
        </Button>
      </div>

      {list.length === 0 ? (
        <Empty title={foods.length === 0 ? "Zatím žádné vlastní potraviny" : "Nic neodpovídá filtru"} action={foods.length === 0 && <Button onClick={() => setEditing("new")}>Vytvořit potravinu</Button>}>
          {foods.length === 0 && "Vytvoř si vlastní potraviny, nebo si označ oblíbené při přidávání jídla."}
        </Empty>
      ) : (
        <div className="rounded-2xl bg-card">
          <AnimatePresence initial={false}>
            {list.map((f) => (
              <motion.div
                layout
                key={f.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-1 border-b border-line pl-1 pr-4 last:border-0 md:pr-5"
              >
                <button
                  type="button"
                  onClick={() => toggleFav(f)}
                  className="grid h-12 w-11 shrink-0 place-items-center text-muted hover:text-fg"
                  aria-label={f.isFavorite ? "Odebrat z oblíbených" : "Přidat do oblíbených"}
                >
                  <Star className={cn("h-[18px] w-[18px]", f.isFavorite && "fill-current text-fg")} strokeWidth={1.75} />
                </button>
                <button type="button" onClick={() => setEditing(f)} className="flex min-h-14 min-w-0 flex-1 items-center justify-between gap-3 py-2 text-left">
                  <div className="min-w-0">
                    <div className="truncate text-[15px]">{f.name}</div>
                    <div className="num truncate text-xs text-muted">
                      {f.brand && `${f.brand} · `}B {num(f.protein, 1)} · S {num(f.carbs, 1)} · T {num(f.fat, 1)}
                      {f.servingG ? ` · porce ${num(f.servingG)} g` : ""}
                      {f.uses > 0 && ` · ${f.uses}× použito`}
                    </div>
                  </div>
                  <div className="num shrink-0 text-right text-sm">
                    {num(f.kcal)}
                    <div className="text-[10px] text-subtle">kcal/100 g</div>
                  </div>
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <Sheet open={editing != null} onClose={() => setEditing(null)} title={editing === "new" ? "Nová potravina" : "Upravit potravinu"}>
        {editing != null && (
          <div className="flex flex-col gap-3">
            <FoodForm key={editing === "new" ? "new" : editing.id} id={editing === "new" ? null : editing.id} initial={editing === "new" ? undefined : editing} onSaved={() => setEditing(null)} />
            {editing !== "new" && (
              <ConfirmButton
                onConfirm={() =>
                  startTransition(async () => {
                    await deleteFoodAction(editing.id);
                    setEditing(null);
                  })
                }
              >
                Smazat potravinu
              </ConfirmButton>
            )}
          </div>
        )}
      </Sheet>
    </>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, Copy, Droplet, Dumbbell, LineChart, Minus, Plus, Settings2, UtensilsCrossed } from "lucide-react";
import { Badge, Button, Card, Field, Input, LinkButton, ProgressBar } from "@/components/ui";
import { AnimatedNumber, ConfirmButton, Ring, Segmented, Sheet, Spinner } from "@/components/ui/client";
import { addDays, num, relativeDay } from "@/lib/format";
import { cn, toNum } from "@/lib/utils";
import { MEALS, mealForHour, type MealType } from "@/lib/nutrition/calc";
import type { Day, FoodHit, FoodLogEntry } from "@/lib/nutrition/service";
import { addWaterAction, copyDayAction, deleteEntryAction, updateEntryAction } from "./actions";
import { AddSheet } from "./add-sheet";

const SOURCE_LABEL: Record<FoodLogEntry["source"], string | null> = { food: null, ai_photo: "AI foto", ai_text: "AI text", quick: "rychlé" };

export function DayView({
  day,
  today,
  prevDayCount,
  recent,
  aiEnabled,
  autoAdd = false,
}: {
  day: Day;
  today: string;
  prevDayCount: number;
  recent: FoodHit[];
  aiEnabled: boolean;
  /** open the add sheet on load (`/nutrition?add=1` from the dashboard) */
  autoAdd?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [addOpen, setAddOpen] = useState(false);
  const [addMeal, setAddMeal] = useState<MealType>("snack");
  const [editing, setEditing] = useState<FoodLogEntry | null>(null);
  const [waterError, setWaterError] = useState<string | null>(null);
  /** date the previous day was already copied into (in this session) – prevents doubling by repeated taps */
  const [copiedInto, setCopiedInto] = useState<{ date: string; n: number } | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);

  const { totals, targets } = day;
  const remaining = targets.kcal - totals.kcal;
  const waterGoal = targets.weightKg ? Math.round((targets.weightKg * 35) / 250) * 250 : 2500;

  const go = (date: string) => {
    startTransition(() => router.push(date === today ? "/nutrition" : `/nutrition?d=${date}`, { scroll: false }));
  };

  const openAdd = (meal?: MealType) => {
    setAddMeal(meal ?? (day.date === today ? mealForHour(Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/Prague" }).format(new Date()))) : "snack"));
    setAddOpen(true);
  };

  const autoAddDone = useRef(false);
  useEffect(() => {
    if (!autoAdd || autoAddDone.current) return;
    autoAddDone.current = true;
    const url = new URL(window.location.href);
    url.searchParams.delete("add");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    openAdd();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAdd]);

  const water = (ml: number) =>
    startTransition(async () => {
      setWaterError(null);
      const res = await addWaterAction(day.date, ml);
      if (!res.ok) setWaterError(res.error);
    });

  const copyPrev = () =>
    startTransition(async () => {
      setCopyError(null);
      const res = await copyDayAction(addDays(day.date, -1), day.date);
      if (res.ok) setCopiedInto({ date: day.date, n: res.data ?? 0 });
      else setCopyError(res.error);
    });
  const copiedHere = copiedInto?.date === day.date;

  const onTouchStart = (e: React.TouchEvent) => {
    const tt = e.touches[0];
    touch.current = { x: tt.clientX, y: tt.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touch.current;
    touch.current = null;
    if (!s || addOpen || editing) return;
    const tt = e.changedTouches[0];
    const dx = tt.clientX - s.x;
    const dy = tt.clientY - s.y;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.8) go(addDays(day.date, dx < 0 ? 1 : -1));
  };

  const byMeal = MEALS.map((m) => {
    const entries = day.entries.filter((e) => e.mealType === m.value);
    return { ...m, entries, kcal: Math.round(entries.reduce((s, e) => s + e.kcal, 0)) };
  });

  return (
    <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <header className="mb-5 flex items-center justify-between gap-3">
        <h1 className="text-[28px] font-semibold tracking-tight md:text-3xl">Výživa</h1>
        <div className="flex items-center gap-1">
          <IconLink href="/nutrition/trends" label="Trendy">
            <LineChart className="h-5 w-5" strokeWidth={1.75} />
          </IconLink>
          <IconLink href="/nutrition/foods" label="Potraviny">
            <UtensilsCrossed className="h-5 w-5" strokeWidth={1.75} />
          </IconLink>
          <IconLink href="/nutrition/profile" label="Profil a cíle">
            <Settings2 className="h-5 w-5" strokeWidth={1.75} />
          </IconLink>
        </div>
      </header>

      {/* Date switcher */}
      <div className="mb-4 flex items-center justify-between gap-2">
        <Button variant="ghost" size="icon" onClick={() => go(addDays(day.date, -1))} aria-label="Předchozí den" className="h-11 w-11">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <button
          type="button"
          onClick={() => day.date !== today && go(today)}
          className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-base font-medium"
          title={day.date !== today ? "Zpět na dnešek" : undefined}
        >
          {pending && <Spinner className="h-3.5 w-3.5 text-muted" />}
          {relativeDay(day.date)}
          {day.trainingDay && (
            <Badge tone="solid" className="gap-1">
              <Dumbbell className="h-3 w-3" /> Tréninkový den
            </Badge>
          )}
        </button>
        <Button variant="ghost" size="icon" onClick={() => go(addDays(day.date, 1))} aria-label="Další den" className="h-11 w-11">
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {!targets.profileComplete && (
        <Link href="/nutrition/profile" className="mb-3 block rounded-2xl border border-dashed border-line-strong p-4 text-sm transition-colors hover:bg-card">
          <div className="font-medium">Nastav si profil a cíle</div>
          <div className="mt-0.5 text-muted">Cíle teď vychází z výchozích 2000 kcal. Doplň pohlaví, věk, výšku a váhu pro přesný výpočet →</div>
        </Link>
      )}

      {/* Overview */}
      <Card className="grid gap-5 md:grid-cols-[auto_1fr] md:items-center md:gap-8">
        <div className="flex items-center justify-center gap-5 md:justify-start">
          <Ring value={totals.kcal} max={targets.kcal} size={168} stroke={12}>
            <div>
              <AnimatedNumber value={Math.abs(remaining)} className="block text-4xl font-semibold tracking-tight" />
              <div className={cn("text-xs", remaining < 0 ? "text-neg" : "text-muted")}>{remaining < 0 ? "kcal nad cíl" : "kcal zbývá"}</div>
            </div>
          </Ring>
          <div className="flex flex-col gap-3 text-sm md:hidden">
            <MiniStat label="Cíl" value={targets.kcal} />
            <MiniStat label="Snědeno" value={totals.kcal} />
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <div className="hidden gap-8 text-sm md:flex">
            <MiniStat label="Cíl" value={targets.kcal} />
            <MiniStat label="Snědeno" value={totals.kcal} />
            <MiniStat label="Vláknina" value={totals.fiber} unit="g" />
          </div>
          <MacroBar label="Bílkoviny" value={totals.protein} target={targets.protein} emphasize={day.trainingDay} />
          <MacroBar label="Sacharidy" value={totals.carbs} target={targets.carbs} />
          <MacroBar label="Tuky" value={totals.fat} target={targets.fat} />
        </div>
      </Card>

      {day.trainingBonus && day.trainingBonus.kcal > 0 && (
        <p className="mt-3 px-1 text-sm text-muted">
          <Dumbbell className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
          Tréninkový den: cíl navýšen o <span className="num font-medium text-fg">+{num(day.trainingBonus.kcal)} kcal</span> (
          <span className="num">+{num(day.trainingBonus.carbs)} g</span> sacharidů).
        </p>
      )}

      {day.trainingDay && totals.protein < targets.protein && (
        <p className="mt-3 px-1 text-sm text-muted">
          <Dumbbell className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
          Dnes trénuješ – dober bílkoviny, zbývá <span className="num font-medium text-fg">{num(targets.protein - totals.protein)} g</span>.
        </p>
      )}

      {/* Water */}
      <Card className="mt-3 flex items-center gap-4">
        <Droplet className="h-5 w-5 shrink-0 text-muted" strokeWidth={1.75} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="font-medium">Voda</span>
            <span className="num text-muted">
              <span className="text-fg">{num(day.waterMl / 1000, 2)}</span> / {num(waterGoal / 1000, 1)} l
            </span>
          </div>
          <ProgressBar value={day.waterMl} max={waterGoal} className="mt-2" />
        </div>
        <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => water(-250)} disabled={day.waterMl <= 0} aria-label="Odebrat 250 ml">
          <Minus className="h-4 w-4" />
        </Button>
        <Button variant="secondary" className="h-11 bg-bg-elev" onClick={() => water(250)}>
          <Plus className="h-4 w-4" /> 250 ml
        </Button>
      </Card>
      {waterError && <p className="mt-2 px-1 text-sm text-neg">Vodu se nepodařilo uložit: {waterError}</p>}

      {/* Meals */}
      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {byMeal.map((m) => (
          <div key={m.value} className="rounded-2xl bg-card">
            <div className="flex items-center justify-between gap-2 px-4 pb-1 pt-3 md:px-5">
              <div className="flex items-baseline gap-2">
                <h2 className="font-medium">{m.label}</h2>
                {m.kcal > 0 && <span className="num text-sm text-muted">{num(m.kcal)} kcal</span>}
              </div>
              <Button variant="ghost" size="icon" className="-mr-2 h-11 w-11" onClick={() => openAdd(m.value)} aria-label={`Přidat do: ${m.label}`}>
                <Plus className="h-5 w-5" />
              </Button>
            </div>
            <div className="px-4 pb-2 md:px-5">
              <AnimatePresence initial={false}>
                {m.entries.map((e) => (
                  <motion.button
                    layout
                    key={e.id}
                    type="button"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    onClick={() => setEditing(e)}
                    className="flex w-full items-center justify-between gap-3 border-t border-line py-2.5 text-left first:border-t-0"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[15px]">{e.name}</div>
                      <div className="num truncate text-xs text-muted">
                        {e.grams != null && `${num(e.grams)} g · `}B {num(e.protein)} · S {num(e.carbs)} · T {num(e.fat)}
                        {SOURCE_LABEL[e.source] && ` · ${SOURCE_LABEL[e.source]}`}
                      </div>
                    </div>
                    <div className="num shrink-0 text-sm font-medium">{num(e.kcal)}</div>
                  </motion.button>
                ))}
              </AnimatePresence>
              {m.entries.length === 0 && <div className="py-2 text-sm text-subtle">Nic zapsáno</div>}
            </div>
          </div>
        ))}
      </div>

      {prevDayCount > 0 && (
        <div className="mt-4 flex flex-col items-center gap-1">
          {copiedHere ? (
            <p className="py-2 text-sm text-muted">
              Zkopírováno {copiedInto.n} {copiedInto.n === 1 ? "záznam" : copiedInto.n < 5 ? "záznamy" : "záznamů"} z předchozího dne.
            </p>
          ) : (
            <ConfirmButton
              variant="ghost"
              disabled={pending}
              confirmText={day.entries.length > 0 ? "Den už má záznamy – přidat i tak?" : "Opravdu kopírovat?"}
              onConfirm={copyPrev}
            >
              <Copy className="h-4 w-4" /> Kopírovat {day.date === today ? "včerejšek" : "předchozí den"} ({prevDayCount})
            </ConfirmButton>
          )}
          {copyError && <p className="text-sm text-neg">Kopírování selhalo: {copyError}</p>}
        </div>
      )}

      {/* FAB */}
      <motion.button
        type="button"
        onClick={() => openAdd()}
        whileTap={{ scale: 0.92 }}
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] right-4 z-30 grid h-14 w-14 place-items-center rounded-full bg-fg text-inverse shadow-lg shadow-black/20 md:bottom-8 md:right-8"
        aria-label="Přidat jídlo"
      >
        <Plus className="h-7 w-7" strokeWidth={2.25} />
      </motion.button>

      <AddSheet open={addOpen} onClose={() => setAddOpen(false)} date={day.date} meal={addMeal} recent={recent} aiEnabled={aiEnabled} />
      <EditEntrySheet entry={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function IconLink({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <LinkButton href={href} variant="ghost" size="icon" className="h-11 w-11" aria-label={label} title={label}>
      {children}
    </LinkButton>
  );
}

function MiniStat({ label, value, unit = "kcal" }: { label: string; value: number; unit?: string }) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className="num text-lg font-semibold tracking-tight">
        {num(value)} <span className="text-xs font-normal text-muted">{unit}</span>
      </div>
    </div>
  );
}

function MacroBar({ label, value, target, emphasize }: { label: string; value: number; target: number; emphasize?: boolean }) {
  const over = target > 0 && value > target * 1.1;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-sm">
        <span className={cn(emphasize ? "font-semibold" : "font-medium")}>{label}</span>
        <span className="num text-muted">
          <span className={cn("text-fg", over && "text-neg")}>{num(value)}</span> / {num(target)} g
        </span>
      </div>
      <ProgressBar value={value} max={target} className={emphasize ? "h-2" : undefined} />
    </div>
  );
}

function EditEntrySheet({ entry, onClose }: { entry: FoodLogEntry | null; onClose: () => void }) {
  return (
    <Sheet open={!!entry} onClose={onClose} title={entry?.name}>
      {entry && <EditEntryForm key={entry.id} entry={entry} onClose={onClose} />}
    </Sheet>
  );
}

function EditEntryForm({ entry, onClose }: { entry: FoodLogEntry; onClose: () => void }) {
  const [grams, setGrams] = useState(entry.grams != null ? String(entry.grams) : "");
  const [meal, setMeal] = useState<MealType>(entry.mealType);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const g = toNum(grams);
  const factor = entry.grams && g && g > 0 ? g / entry.grams : 1;

  const save = () =>
    startTransition(async () => {
      const res = await updateEntryAction(entry.id, { grams: entry.grams != null && g ? g : undefined, mealType: meal });
      if (res.ok) onClose();
      else setError(res.error);
    });
  const del = () =>
    startTransition(async () => {
      const res = await deleteEntryAction(entry.id);
      if (res.ok) onClose();
      else setError(res.error);
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="num grid grid-cols-4 gap-2 text-center">
        {[
          ["kcal", entry.kcal * factor, 0],
          ["B", entry.protein * factor, 1],
          ["S", entry.carbs * factor, 1],
          ["T", entry.fat * factor, 1],
        ].map(([l, v, d]) => (
          <div key={l as string} className="rounded-xl bg-card px-2 py-2">
            <div className="text-lg font-semibold">{num(v as number, d as number)}</div>
            <div className="text-xs text-muted">{l}</div>
          </div>
        ))}
      </div>
      {entry.grams != null && (
        <Field label="Množství (g)">
          <Input inputMode="decimal" value={grams} onChange={(e) => setGrams(e.target.value)} autoFocus />
        </Field>
      )}
      <Segmented value={meal} onChange={setMeal} options={MEALS} layoutId="edit-meal" className="w-full" />
      {error && <p className="text-sm text-neg">{error}</p>}
      <div className="flex gap-2">
        <ConfirmButton onConfirm={del} disabled={pending} className="flex-1">
          Smazat
        </ConfirmButton>
        <Button onClick={save} disabled={pending} className="flex-[2]">
          {pending && <Spinner />} Uložit
        </Button>
      </div>
    </div>
  );
}

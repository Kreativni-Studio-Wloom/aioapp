"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Camera, ChevronLeft, ImagePlus, MessageSquareText, ScanBarcode, Search, Star, Trash2, X, Zap } from "lucide-react";
import { Button, Field, Input, Textarea } from "@/components/ui";
import { Segmented, Sheet, Spinner } from "@/components/ui/client";
import { num } from "@/lib/format";
import { cn, toNum } from "@/lib/utils";
import { MEALS, scalePer100, type MealType } from "@/lib/nutrition/calc";
import type { AiFoodItem, Food, FoodHit } from "@/lib/nutrition/service";
import { estimateImageAction, estimateTextAction, logHitAction, logItemsAction, lookupEanAction } from "./actions";
import { FoodForm } from "./food-form";
import { BarcodeScanner } from "./scanner";

type Tab = "search" | "scan" | "photo" | "text" | "quick";
type Step =
  | { kind: "tabs" }
  | { kind: "portion"; hit: FoodHit }
  | { kind: "create"; ean: string | null; name?: string }
  | { kind: "review"; items: AiFoodItem[]; source: "ai_photo" | "ai_text" };

const TABS: { value: Tab; label: string; icon: typeof Search }[] = [
  { value: "search", label: "Hledat", icon: Search },
  { value: "scan", label: "Sken EAN", icon: ScanBarcode },
  { value: "photo", label: "Fotka", icon: Camera },
  { value: "text", label: "Text", icon: MessageSquareText },
  { value: "quick", label: "Rychlé", icon: Zap },
];

export function foodToHit(f: Food): FoodHit {
  return {
    id: f.id,
    ean: f.ean,
    name: f.name,
    brand: f.brand,
    kcal: f.kcal,
    protein: f.protein,
    carbs: f.carbs,
    fat: f.fat,
    fiber: f.fiber,
    servingG: f.servingG,
    isFavorite: f.isFavorite,
    origin: f.userId ? "mine" : "cache",
  };
}

export function AddSheet({
  open,
  onClose,
  date,
  meal,
  recent,
  aiEnabled,
}: {
  open: boolean;
  onClose: () => void;
  date: string;
  meal: MealType;
  recent: FoodHit[];
  aiEnabled: boolean;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Přidat jídlo" className="md:max-w-xl">
      <AddFlow date={date} initialMeal={meal} recent={recent} aiEnabled={aiEnabled} onDone={onClose} />
    </Sheet>
  );
}

function AddFlow({ date, initialMeal, recent, aiEnabled, onDone }: { date: string; initialMeal: MealType; recent: FoodHit[]; aiEnabled: boolean; onDone: () => void }) {
  const [tab, setTab] = useState<Tab>("search");
  const [meal, setMeal] = useState<MealType>(initialMeal);
  const [step, setStep] = useState<Step>({ kind: "tabs" });
  const back = () => setStep({ kind: "tabs" });

  return (
    <div className="flex min-h-[60dvh] flex-col gap-4 md:min-h-[420px]">
      <Segmented value={meal} onChange={setMeal} options={MEALS} layoutId="add-meal" className="w-full" />

      {step.kind === "tabs" && (
        <>
          <div className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1">
            {TABS.map((tb) => (
              <button
                key={tb.value}
                type="button"
                onClick={() => setTab(tb.value)}
                className={cn(
                  "flex min-h-14 min-w-[64px] flex-1 flex-col items-center justify-center gap-1 rounded-xl px-2 text-[11px] font-medium transition-colors",
                  tab === tb.value ? "bg-fg text-inverse" : "bg-card text-muted hover:text-fg",
                )}
              >
                <tb.icon className="h-[18px] w-[18px]" strokeWidth={tab === tb.value ? 2.25 : 1.75} />
                {tb.label}
              </button>
            ))}
          </div>
          <div className="flex-1">
            {tab === "search" && <SearchTab recent={recent} onPick={(hit) => setStep({ kind: "portion", hit })} onCreate={(name) => setStep({ kind: "create", ean: null, name })} />}
            {tab === "scan" && (
              <ScanTab onFound={(f) => setStep({ kind: "portion", hit: foodToHit(f) })} onNotFound={(ean) => setStep({ kind: "create", ean })} />
            )}
            {tab === "photo" && (aiEnabled ? <PhotoTab onResult={(items) => setStep({ kind: "review", items, source: "ai_photo" })} /> : <AiOff />)}
            {tab === "text" && (aiEnabled ? <TextTab onResult={(items) => setStep({ kind: "review", items, source: "ai_text" })} /> : <AiOff />)}
            {tab === "quick" && <QuickTab date={date} meal={meal} onDone={onDone} />}
          </div>
        </>
      )}

      {step.kind !== "tabs" && (
        <button type="button" onClick={back} className="-mb-1 inline-flex min-h-9 items-center gap-1 self-start text-sm text-muted hover:text-fg">
          <ChevronLeft className="h-4 w-4" /> Zpět
        </button>
      )}
      {step.kind === "portion" && <PortionStep hit={step.hit} date={date} meal={meal} onDone={onDone} />}
      {step.kind === "create" && (
        <div>
          <p className="mb-3 text-sm text-muted">
            {step.ean ? (
              <>
                Produkt s EAN <span className="num text-fg">{step.ean}</span> jsme nenašli. Opiš hodnoty z obalu (na 100 g):
              </>
            ) : (
              "Nová vlastní potravina (hodnoty na 100 g):"
            )}
          </p>
          <FoodForm
            initial={{ ean: step.ean, name: step.name }}
            submitLabel="Uložit a pokračovat"
            onSaved={(f) => setStep({ kind: "portion", hit: foodToHit(f) })}
          />
        </div>
      )}
      {step.kind === "review" && <ReviewStep initial={step.items} source={step.source} date={date} meal={meal} onDone={onDone} onBack={back} />}
    </div>
  );
}

/* ───────────── Search ───────────── */

function SearchTab({ recent, onPick, onCreate }: { recent: FoodHit[]; onPick: (h: FoodHit) => void; onCreate: (name: string) => void }) {
  const [q, setQ] = useState("");
  const [local, setLocal] = useState<FoodHit[] | null>(null);
  const [off, setOff] = useState<FoodHit[] | null>(null);
  const [loadingLocal, setLoadingLocal] = useState(false);
  const [loadingOff, setLoadingOff] = useState(false);

  useEffect(() => {
    const query = q.trim();
    if (!query) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setLoadingLocal(true);
      setLoadingOff(query.length >= 2);
      const get = (scope: string) =>
        fetch(`/api/nutrition/search?scope=${scope}&q=${encodeURIComponent(query)}`, { signal: ctrl.signal })
          .then((r) => (r.ok ? r.json() : { hits: [] }))
          .then((d: { hits: FoodHit[] }) => d.hits)
          .catch(() => null);
      get("local").then((h) => {
        if (ctrl.signal.aborted) return;
        setLocal(h ?? []);
        setLoadingLocal(false);
      });
      if (query.length >= 2)
        get("off").then((h) => {
          if (ctrl.signal.aborted) return;
          setOff(h ?? []);
          setLoadingOff(false);
        });
      else setOff([]);
    }, 250);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q]);

  const showRecent = !q.trim();
  const localHits = showRecent ? recent : (local ?? []);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
        <Input
          autoFocus
          type="search"
          enterKeyHint="search"
          placeholder="Hledat potravinu…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-10"
        />
        {(loadingLocal || loadingOff) && <Spinner className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted" />}
      </div>

      {showRecent && recent.length > 0 && <ListLabel>Oblíbené a nedávné</ListLabel>}
      {showRecent && recent.length === 0 && <p className="py-6 text-center text-sm text-muted">Začni psát – prohledáme tvoje potraviny i Open Food Facts.</p>}
      {!showRecent && local && local.length > 0 && <ListLabel>Moje a uložené</ListLabel>}
      <HitList hits={localHits} onPick={onPick} />

      {!showRecent && off && off.length > 0 && (
        <>
          <ListLabel>Open Food Facts</ListLabel>
          <HitList hits={off} onPick={onPick} />
        </>
      )}
      {!showRecent && !loadingLocal && !loadingOff && local && off && local.length === 0 && off.length === 0 && (
        <p className="py-4 text-center text-sm text-muted">Nic jsme nenašli.</p>
      )}
      {!showRecent && (
        <Button variant="ghost" onClick={() => onCreate(q.trim())} className="self-center">
          + Vytvořit vlastní potravinu
        </Button>
      )}
    </div>
  );
}

function ListLabel({ children }: { children: React.ReactNode }) {
  return <div className="mt-1 text-xs font-medium uppercase tracking-wider text-muted">{children}</div>;
}

function HitList({ hits, onPick }: { hits: FoodHit[]; onPick: (h: FoodHit) => void }) {
  return (
    <div className="flex flex-col">
      {hits.map((h) => (
        <button
          key={(h.id ?? "") + (h.ean ?? "") + h.name}
          type="button"
          onClick={() => onPick(h)}
          className="flex min-h-14 items-center justify-between gap-3 border-b border-line py-2 text-left last:border-0 active:bg-card"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 truncate text-[15px]">
              {h.isFavorite && <Star className="h-3.5 w-3.5 shrink-0 fill-current" />}
              <span className="truncate">{h.name}</span>
            </div>
            <div className="num truncate text-xs text-muted">
              {h.brand && `${h.brand} · `}B {num(h.protein, 1)} · S {num(h.carbs, 1)} · T {num(h.fat, 1)}
            </div>
          </div>
          <div className="num shrink-0 text-right text-sm">
            {num(h.kcal)}
            <div className="text-[10px] text-subtle">kcal/100 g</div>
          </div>
        </button>
      ))}
    </div>
  );
}

/* ───────────── Portion ───────────── */

function PortionStep({ hit, date, meal, onDone }: { hit: FoodHit; date: string; meal: MealType; onDone: () => void }) {
  const [grams, setGrams] = useState(String(hit.servingG ?? 100).replace(".", ","));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const g = toNum(grams) ?? 0;
  const v = scalePer100(hit, g);
  const chips = [50, 100, 150, 200];

  const add = () =>
    startTransition(async () => {
      setError(null);
      const res = await logHitAction({ date, mealType: meal, grams: g, hit });
      if (res.ok) onDone();
      else setError(res.error);
    });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-lg font-semibold leading-tight">{hit.name}</div>
        <div className="num mt-0.5 text-sm text-muted">
          {hit.brand && `${hit.brand} · `}
          {num(hit.kcal)} kcal / 100 g
        </div>
      </div>
      <div className="flex items-end gap-2">
        <Field label="Množství (g)" className="flex-1">
          <Input inputMode="decimal" value={grams} onChange={(e) => setGrams(e.target.value)} onFocus={(e) => e.target.select()} className="num h-14 text-2xl font-semibold" />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        {hit.servingG && (
          <Chip active={g === hit.servingG} onClick={() => setGrams(String(hit.servingG).replace(".", ","))}>
            1 porce · {num(hit.servingG)} g
          </Chip>
        )}
        {chips.map((c) => (
          <Chip key={c} active={g === c} onClick={() => setGrams(String(c))}>
            {c} g
          </Chip>
        ))}
      </div>
      <MacroGrid kcal={v.kcal} protein={v.protein} carbs={v.carbs} fat={v.fat} />
      {error && <p className="text-sm text-neg">{error}</p>}
      <Button size="lg" onClick={add} disabled={pending || g <= 0}>
        {pending && <Spinner />} Přidat · {num(v.kcal)} kcal
      </Button>
    </div>
  );
}

function Chip({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("num min-h-10 rounded-full px-4 text-sm font-medium transition-colors", active ? "bg-fg text-inverse" : "bg-card text-fg-soft hover:bg-card-hover")}
    >
      {children}
    </button>
  );
}

function MacroGrid({ kcal, protein, carbs, fat }: { kcal: number; protein: number; carbs: number; fat: number }) {
  return (
    <div className="num grid grid-cols-4 gap-2 text-center">
      {(
        [
          ["kcal", kcal, 0],
          ["Bílkoviny", protein, 1],
          ["Sacharidy", carbs, 1],
          ["Tuky", fat, 1],
        ] as const
      ).map(([l, val, d]) => (
        <div key={l} className="rounded-xl bg-card px-1 py-2">
          <div className="text-lg font-semibold">{num(val, d)}</div>
          <div className="text-[11px] text-muted">{l}</div>
        </div>
      ))}
    </div>
  );
}

/* ───────────── Scan ───────────── */

function ScanTab({ onFound, onNotFound }: { onFound: (f: Food) => void; onNotFound: (ean: string) => void }) {
  const [manual, setManual] = useState("");
  const [looking, setLooking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  const lookup = async (code: string) => {
    const ean = code.replace(/\D/g, "");
    if (ean.length < 6 || busy.current) return;
    busy.current = true;
    setLooking(ean);
    setError(null);
    const res = await lookupEanAction(ean);
    busy.current = false;
    setLooking(null);
    if (!res.ok) return setError(res.error);
    if (res.data) onFound(res.data);
    else onNotFound(ean);
  };

  return (
    <div className="flex flex-col gap-4">
      <BarcodeScanner onCode={lookup} paused={!!looking} />
      {looking && (
        <div className="flex items-center justify-center gap-2 text-sm text-muted">
          <Spinner /> Hledám <span className="num text-fg">{looking}</span>…
        </div>
      )}
      {error && <p className="text-sm text-neg">{error}</p>}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          lookup(manual);
        }}
      >
        <Input inputMode="numeric" placeholder="Zadat EAN ručně" value={manual} onChange={(e) => setManual(e.target.value)} className="num" />
        <Button type="submit" variant="secondary" disabled={manual.replace(/\D/g, "").length < 6 || !!looking}>
          Hledat
        </Button>
      </form>
    </div>
  );
}

/* ───────────── AI: photo & text ───────────── */

function AiOff() {
  return (
    <div className="rounded-2xl border border-dashed border-line-strong px-5 py-8 text-center">
      <div className="font-medium">AI není nastavená</div>
      <p className="mt-1 text-sm text-muted">
        Pro odhad z fotky nebo textu doplň <span className="font-mono text-xs">ANTHROPIC_API_KEY</span> do prostředí serveru. Mezitím použij hledání, sken EAN nebo rychlý zápis.
      </p>
    </div>
  );
}

function aiError(err: string) {
  return err === "AI_DISABLED" ? "AI není nastavená – doplň ANTHROPIC_API_KEY do prostředí." : err;
}

/** Downscale an image file to max `max` px on the long side, JPEG data URL. */
async function downscale(file: File, max = 1280, quality = 0.82): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Obrázek se nepodařilo načíst"));
      i.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas není podporován");
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function PhotoTab({ onResult }: { onResult: (items: AiFoodItem[]) => void }) {
  const [image, setImage] = useState<string | null>(null);
  const [hint, setHint] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    try {
      setImage(await downscale(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Obrázek se nepodařilo zpracovat");
    }
  };

  const analyze = () =>
    image &&
    startTransition(async () => {
      setError(null);
      const res = await estimateImageAction(image, hint || null);
      if (!res.ok) return setError(aiError(res.error));
      if (!res.data?.length) return setError("Na fotce jsme nerozpoznali žádné jídlo.");
      onResult(res.data);
    });

  return (
    <div className="flex flex-col gap-3">
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
      <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
      {image ? (
        <div className="relative overflow-hidden rounded-2xl bg-card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="Fotka jídla" className="max-h-72 w-full object-contain" />
          <button type="button" onClick={() => setImage(null)} className="absolute right-2 top-2 rounded-full bg-black/60 p-2 text-white" aria-label="Odebrat fotku">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => cameraRef.current?.click()} className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-2xl bg-card text-sm font-medium hover:bg-card-hover">
            <Camera className="h-7 w-7" strokeWidth={1.5} /> Vyfotit
          </button>
          <button type="button" onClick={() => galleryRef.current?.click()} className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-2xl bg-card text-sm font-medium hover:bg-card-hover">
            <ImagePlus className="h-7 w-7" strokeWidth={1.5} /> Z galerie
          </button>
        </div>
      )}
      <Input placeholder="Upřesnění (volitelné), např. „velký talíř, bez omáčky“" value={hint} onChange={(e) => setHint(e.target.value)} />
      {error && <p className="text-sm text-neg">{error}</p>}
      <Button size="lg" onClick={analyze} disabled={!image || pending}>
        {pending ? (
          <>
            <Spinner /> Analyzuji…
          </>
        ) : (
          "Odhadnout z fotky"
        )}
      </Button>
    </div>
  );
}

function TextTab({ onResult }: { onResult: (items: AiFoodItem[]) => void }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = () =>
    startTransition(async () => {
      setError(null);
      const res = await estimateTextAction(text);
      if (!res.ok) return setError(aiError(res.error));
      if (!res.data?.length) return setError("V textu jsme nenašli žádné jídlo.");
      onResult(res.data);
    });
  return (
    <div className="flex flex-col gap-3">
      <Textarea
        autoFocus
        placeholder="např. 2 vejce, 80 g ovesných vloček, banán"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && text.trim().length >= 2) run();
        }}
      />
      {error && <p className="text-sm text-neg">{error}</p>}
      <Button size="lg" onClick={run} disabled={text.trim().length < 2 || pending}>
        {pending ? (
          <>
            <Spinner /> Odhaduji…
          </>
        ) : (
          "Odhadnout"
        )}
      </Button>
    </div>
  );
}

type Row = { key: number; name: string; grams: string; kcal: string; protein: string; carbs: string; fat: string; fiber: number; confidence: number };
const fmt = (n: number, d = 1) => String(Math.round(n * 10 ** d) / 10 ** d).replace(".", ",");

function ReviewStep({
  initial,
  source,
  date,
  meal,
  onDone,
  onBack,
}: {
  initial: AiFoodItem[];
  source: "ai_photo" | "ai_text";
  date: string;
  meal: MealType;
  onDone: () => void;
  onBack: () => void;
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    initial.map((i, k) => ({
      key: k,
      name: i.name,
      grams: i.grams ? String(i.grams) : "",
      kcal: String(i.kcal),
      protein: fmt(i.protein),
      carbs: fmt(i.carbs),
      fat: fmt(i.fat),
      fiber: i.fiber,
      confidence: i.confidence,
    })),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  /** Changing grams rescales all values proportionally. */
  const setGrams = (r: Row, value: string) => {
    const oldG = toNum(r.grams);
    const newG = toNum(value);
    if (oldG && newG && oldG > 0) {
      const f = newG / oldG;
      update(r.key, {
        grams: value,
        kcal: String(Math.round((toNum(r.kcal) ?? 0) * f)),
        protein: fmt((toNum(r.protein) ?? 0) * f),
        carbs: fmt((toNum(r.carbs) ?? 0) * f),
        fat: fmt((toNum(r.fat) ?? 0) * f),
        fiber: r.fiber * f,
      });
    } else update(r.key, { grams: value });
  };

  const total = rows.reduce((s, r) => s + (toNum(r.kcal) ?? 0), 0);

  const save = () =>
    startTransition(async () => {
      setError(null);
      const res = await logItemsAction({
        date,
        mealType: meal,
        source,
        items: rows.map((r) => ({
          name: r.name || "Jídlo",
          grams: toNum(r.grams),
          kcal: toNum(r.kcal) ?? 0,
          protein: toNum(r.protein) ?? 0,
          carbs: toNum(r.carbs) ?? 0,
          fat: toNum(r.fat) ?? 0,
          fiber: Math.round(r.fiber * 10) / 10,
        })),
      });
      if (res.ok) onDone();
      else setError(res.error);
    });

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">Zkontroluj a uprav odhad. Změna gramáže přepočítá hodnoty.</p>
      <AnimatePresence initial={false}>
        {rows.map((r) => (
          <motion.div
            layout
            key={r.key}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0, marginTop: -12 }}
            className="rounded-2xl bg-card p-3"
          >
            <div className="flex items-center gap-2">
              <Input value={r.name} onChange={(e) => update(r.key, { name: e.target.value })} className="h-10 bg-bg-elev font-medium" aria-label="Název" />
              <button type="button" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-muted hover:text-neg" aria-label="Odebrat">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2 grid grid-cols-5 gap-1.5">
              <SmallNum label="g" value={r.grams} onChange={(v) => setGrams(r, v)} />
              <SmallNum label="kcal" value={r.kcal} onChange={(v) => update(r.key, { kcal: v })} />
              <SmallNum label="B" value={r.protein} onChange={(v) => update(r.key, { protein: v })} />
              <SmallNum label="S" value={r.carbs} onChange={(v) => update(r.key, { carbs: v })} />
              <SmallNum label="T" value={r.fat} onChange={(v) => update(r.key, { fat: v })} />
            </div>
            {r.confidence < 0.5 && <div className="mt-1.5 text-xs text-muted">Nejistý odhad – zkontroluj množství.</div>}
          </motion.div>
        ))}
      </AnimatePresence>
      {rows.length === 0 && (
        <Button variant="ghost" onClick={onBack}>
          Zkusit znovu
        </Button>
      )}
      {error && <p className="text-sm text-neg">{error}</p>}
      <Button size="lg" onClick={save} disabled={pending || rows.length === 0}>
        {pending && <Spinner />} Zapsat {rows.length} {rows.length === 1 ? "položku" : rows.length < 5 ? "položky" : "položek"} · {num(total)} kcal
      </Button>
    </div>
  );
}

function SmallNum({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col items-center gap-0.5">
      <input
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={(e) => e.target.select()}
        className="num h-10 w-full rounded-lg border border-transparent bg-bg-elev px-1 text-center outline-none focus:border-line-strong"
      />
      <span className="text-[10px] text-muted">{label}</span>
    </label>
  );
}

/* ───────────── Quick ───────────── */

function QuickTab({ date, meal, onDone }: { date: string; meal: MealType; onDone: () => void }) {
  const [v, setV] = useState({ name: "", kcal: "", protein: "", carbs: "", fat: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV((p) => ({ ...p, [k]: e.target.value }));
  const p = toNum(v.protein) ?? 0;
  const c = toNum(v.carbs) ?? 0;
  const f = toNum(v.fat) ?? 0;
  const computed = Math.round(p * 4 + c * 4 + f * 9);
  const kcal = toNum(v.kcal) ?? (computed || null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (kcal == null) return setError("Vyplň kalorie nebo makra.");
    startTransition(async () => {
      setError(null);
      const res = await logItemsAction({
        date,
        mealType: meal,
        source: "quick",
        items: [{ name: v.name.trim() || "Rychlý záznam", kcal, protein: p, carbs: c, fat: f }],
      });
      if (res.ok) onDone();
      else setError(res.error);
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Field label="Kalorie (kcal)" hint={!v.kcal && computed > 0 ? `z maker ≈ ${num(computed)} kcal` : undefined}>
        <Input autoFocus inputMode="decimal" value={v.kcal} onChange={set("kcal")} className="num h-14 text-2xl font-semibold" />
      </Field>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Bílk. (g)">
          <Input inputMode="decimal" value={v.protein} onChange={set("protein")} />
        </Field>
        <Field label="Sach. (g)">
          <Input inputMode="decimal" value={v.carbs} onChange={set("carbs")} />
        </Field>
        <Field label="Tuky (g)">
          <Input inputMode="decimal" value={v.fat} onChange={set("fat")} />
        </Field>
      </div>
      <Field label="Popis (volitelné)">
        <Input value={v.name} onChange={set("name")} placeholder="Rychlý záznam" />
      </Field>
      {error && <p className="text-sm text-neg">{error}</p>}
      <Button type="submit" size="lg" disabled={pending || kcal == null}>
        {pending && <Spinner />} Přidat{kcal != null ? ` · ${num(kcal)} kcal` : ""}
      </Button>
    </form>
  );
}

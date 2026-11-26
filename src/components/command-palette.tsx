"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Search, CornerDownLeft } from "lucide-react";
import { cn } from "@/lib/utils";

type Command = { id: string; label: string; group: string; keywords?: string; run: (router: ReturnType<typeof useRouter>) => void };

const go = (href: string) => (router: ReturnType<typeof useRouter>) => router.push(href);

/* ── privacy mode: blurs amounts inside [data-private] (income, portfolio, money cards) ── */
const PRIVACY_EVENT = "aio-privacy";
export function isPrivate() {
  return typeof document !== "undefined" && document.documentElement.dataset.privacy === "on";
}
export function setPrivacy(on: boolean) {
  document.documentElement.dataset.privacy = on ? "on" : "off";
  document.cookie = `privacy=${on ? "on" : "off"}; path=/; max-age=31536000; samesite=lax`;
  window.dispatchEvent(new Event(PRIVACY_EVENT));
}
export function usePrivacy() {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener(PRIVACY_EVENT, cb);
      return () => window.removeEventListener(PRIVACY_EVENT, cb);
    },
    isPrivate,
    () => false,
  );
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = next;
  document.cookie = `theme=${next}; path=/; max-age=31536000; samesite=lax`;
}

const COMMANDS: Command[] = [
  { id: "home", label: "Domů", group: "Přejít", keywords: "dashboard prehled", run: go("/") },
  { id: "workout", label: "Trénink", group: "Přejít", keywords: "workout gym", run: go("/workout") },
  { id: "programs", label: "Tréninkové programy", group: "Přejít", keywords: "plan sablona", run: go("/workout/programs") },
  { id: "exercises", label: "Knihovna cviků", group: "Přejít", keywords: "cviky alternativy", run: go("/workout/exercises") },
  { id: "history", label: "Historie tréninků", group: "Přejít", run: go("/workout/history") },
  { id: "body", label: "Tělesná váha a míry", group: "Přejít", keywords: "vaha body", run: go("/workout/body") },
  { id: "nutrition", label: "Výživa – dnešek", group: "Přejít", keywords: "kalorie jidlo", run: go("/nutrition") },
  { id: "foods", label: "Moje potraviny", group: "Přejít", run: go("/nutrition/foods") },
  { id: "trends", label: "Trendy výživy", group: "Přejít", run: go("/nutrition/trends") },
  { id: "nprofile", label: "Profil a cíle výživy", group: "Přejít", keywords: "tdee bmr makra", run: go("/nutrition/profile") },
  { id: "income", label: "Příjmy", group: "Přejít", keywords: "income penize", run: go("/income") },
  { id: "sources", label: "Zdroje příjmů / businessy", group: "Přejít", keywords: "matcha pronajem", run: go("/income/sources") },
  { id: "events", label: "Eventy", group: "Přejít", keywords: "festival akce", run: go("/income/events") },
  { id: "tx", label: "Transakce", group: "Přejít", run: go("/income/transactions") },
  { id: "recurring", label: "Opakované platby", group: "Přejít", keywords: "najem", run: go("/income/recurring") },
  { id: "portfolio", label: "Portfolio", group: "Přejít", keywords: "akcie krypto aktiva", run: go("/portfolio") },
  { id: "import", label: "Import CSV od brokera", group: "Přejít", keywords: "xtb degiro ibkr trading212", run: go("/portfolio/import") },
  { id: "goals", label: "Cíle", group: "Přejít", run: go("/goals") },
  { id: "ai", label: "AI asistent", group: "Přejít", keywords: "claude chat trener", run: go("/ai") },
  { id: "settings", label: "Nastavení", group: "Přejít", keywords: "api klic export", run: go("/settings") },
  { id: "add-food", label: "Zapsat jídlo", group: "Zapsat", keywords: "foto ean sken", run: go("/nutrition?add=1") },
  { id: "add-income", label: "Přidat příjem / výdaj", group: "Zapsat", run: go("/income?add=1") },
  { id: "start-workout", label: "Začít trénink", group: "Zapsat", run: go("/workout") },
  { id: "privacy", label: "Skrýt / zobrazit částky", group: "Akce", keywords: "soukromi privacy", run: () => setPrivacy(!isPrivate()) },
  { id: "theme", label: "Přepnout světlý / tmavý motiv", group: "Akce", keywords: "theme dark light", run: toggleTheme },
];

const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export const OPEN_PALETTE_EVENT = "aio-palette";

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        setQuery("");
        setActive(0);
      } else if (e.key === "Escape") setOpen(false);
    };
    const onOpen = () => {
      setOpen(true);
      setQuery("");
      setActive(0);
    };
    document.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
    };
  }, []);

  const results = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return COMMANDS;
    return COMMANDS.filter((c) => norm(`${c.label} ${c.keywords ?? ""} ${c.group}`).includes(q));
  }, [query]);

  const run = (c: Command | undefined) => {
    if (!c) return;
    setOpen(false);
    c.run(router);
  };

  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]">
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => setOpen(false)}
          />
          <motion.div
            role="dialog"
            aria-label="Příkazy"
            className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-line-strong bg-bg-elev shadow-2xl"
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }}
            transition={{ type: "spring", damping: 30, stiffness: 420 }}
            onAnimationComplete={() => inputRef.current?.focus()}
          >
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search className="h-4 w-4 shrink-0 text-muted" />
              <input
                ref={inputRef}
                autoFocus
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setActive((a) => Math.min(a + 1, results.length - 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setActive((a) => Math.max(a - 1, 0));
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    run(results[active]);
                  }
                }}
                placeholder="Kam chceš jít nebo co zapsat…"
                className="h-12 w-full bg-transparent outline-none placeholder:text-subtle"
              />
              <kbd className="hidden rounded-md border border-line px-1.5 py-0.5 text-[10px] text-muted md:block">ESC</kbd>
            </div>
            <div className="max-h-[50vh] overflow-y-auto p-2">
              {results.length === 0 && <div className="px-3 py-6 text-center text-sm text-muted">Nic nenalezeno</div>}
              {results.map((c, i) => (
                <button
                  key={c.id}
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => run(c)}
                  className={cn(
                    "flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 text-left text-sm transition-colors",
                    i === active ? "bg-card text-fg" : "text-fg-soft",
                  )}
                >
                  <span>{c.label}</span>
                  <span className="flex items-center gap-2 text-xs text-subtle">
                    {c.group}
                    {i === active && <CornerDownLeft className="h-3.5 w-3.5" />}
                  </span>
                </button>
              ))}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

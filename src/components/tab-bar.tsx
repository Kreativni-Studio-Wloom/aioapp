"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Search, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { OPEN_PALETTE_EVENT } from "@/components/command-palette";

type Item = { href: string; label: string; icon: LucideIcon };

const isActive = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"));

/** iOS 18+ Safari ticks the Taptic Engine when a `<input switch>` is toggled through its label. No-op elsewhere. */
function haptic() {
  try {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("switch", "");
    label.style.display = "none";
    label.appendChild(input);
    document.body.appendChild(label);
    label.click();
    label.remove();
  } catch {}
}

const LENS_SPRING = { type: "spring", stiffness: 520, damping: 34, mass: 0.7 } as const;

/**
 * Floating Liquid Glass tab bar (iOS 26 style): a glass capsule inset from the screen edges with a
 * separate circular search button. The selection is a glass lens that morphs between tabs; touching
 * the bar lifts the lens and you can scrub it across tabs, releasing navigates (like UITabBar).
 */
export function TabBar({ pathname, items }: { pathname: string; items: Item[] }) {
  const router = useRouter();
  const barRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; idx: number; moved: boolean } | null>(null);
  const [pressed, setPressed] = useState<number | null>(null);
  // Optimistic selection: jump the lens immediately, before the route finishes loading.
  const [pending, setPending] = useState<{ href: string; from: string } | null>(null);

  const routeIdx = items.findIndex((i) => isActive(pathname, i.href));
  const pendingIdx = pending && pending.from === pathname ? items.findIndex((i) => i.href === pending.href) : -1;
  const activeIdx = pendingIdx >= 0 ? pendingIdx : routeIdx;
  const lensIdx = pressed ?? activeIdx;

  const indexAt = (clientX: number) => {
    const r = barRef.current!.getBoundingClientRect();
    const i = Math.floor(((clientX - r.left) / r.width) * items.length);
    return Math.max(0, Math.min(items.length - 1, i));
  };

  const select = (idx: number) => {
    const item = items[idx];
    if (idx !== activeIdx) haptic();
    if (pathname !== item.href) setPending({ href: item.href, from: pathname });
  };

  return (
    <div className="tabbar fixed inset-x-0 z-40 flex items-center justify-center gap-2.5 px-4 md:hidden">
      <nav
        aria-label="Hlavní navigace"
        className="glass relative h-[62px] w-full max-w-[22rem] rounded-full p-1"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          const idx = indexAt(e.clientX);
          drag.current = { x: e.clientX, idx, moved: false };
          setPressed(idx);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          if (Math.abs(e.clientX - d.x) > 8) d.moved = true;
          const idx = indexAt(e.clientX);
          if (idx !== pressed) {
            if (d.moved) haptic();
            setPressed(idx);
          }
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          setPressed(null);
          if (d?.moved) {
            const idx = indexAt(e.clientX);
            select(idx);
            router.push(items[idx].href);
          }
        }}
        onPointerCancel={() => {
          drag.current = null;
          setPressed(null);
        }}
      >
        <div ref={barRef} className="relative flex h-full">
          {items.map((item, idx) => {
            const active = idx === activeIdx;
            return (
              <Link
                key={item.href}
                href={item.href}
                draggable={false}
                aria-current={active ? "page" : undefined}
                onClick={() => select(idx)}
                className="relative flex min-w-0 flex-1 flex-col items-center justify-center gap-[3px] rounded-full"
              >
                {idx === lensIdx && (
                  <motion.span
                    layoutId="tab-lens"
                    aria-hidden
                    className={cn("glass-lens absolute inset-0 rounded-full", pressed != null && "is-pressed")}
                    animate={{ scale: pressed != null ? 1.12 : 1 }}
                    transition={LENS_SPRING}
                  />
                )}
                <motion.span
                  className="relative flex flex-col items-center gap-[3px]"
                  animate={{ scale: pressed === idx ? 1.08 : 1 }}
                  transition={LENS_SPRING}
                >
                  <item.icon className={cn("h-[23px] w-[23px] transition-colors duration-200", active ? "text-fg" : "text-fg-soft")} strokeWidth={active ? 2.25 : 1.75} />
                  <span className={cn("max-w-full truncate px-0.5 text-[10px] leading-none font-medium tracking-[-0.01em] transition-colors duration-200", active ? "text-fg" : "text-fg-soft")}>
                    {item.label}
                  </span>
                </motion.span>
              </Link>
            );
          })}
        </div>
      </nav>

      <motion.button
        type="button"
        aria-label="Hledat"
        whileTap={{ scale: 1.1 }}
        transition={LENS_SPRING}
        onClick={() => {
          haptic();
          window.dispatchEvent(new Event(OPEN_PALETTE_EVENT));
        }}
        className="glass grid h-[62px] w-[62px] shrink-0 place-items-center rounded-full text-fg"
      >
        <Search className="h-[23px] w-[23px]" strokeWidth={1.9} />
      </motion.button>
    </div>
  );
}

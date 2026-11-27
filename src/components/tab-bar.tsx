"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useMotionValue, useSpring } from "motion/react";
import { Search, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { OPEN_PALETTE_EVENT } from "@/components/command-palette";

type Item = { href: string; label: string; icon: LucideIcon };

const isActive = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"));

/**
 * iOS 18+ Safari ticks the Taptic Engine when a `<input switch>` is toggled through its label. No-op elsewhere.
 * One hidden element is created once and reused, so scrubbing doesn't touch the DOM.
 */
let hapticLabel: HTMLLabelElement | null = null;
function haptic() {
  try {
    if (!hapticLabel) {
      hapticLabel = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.setAttribute("switch", "");
      hapticLabel.style.display = "none";
      hapticLabel.appendChild(input);
      document.body.appendChild(hapticLabel);
    }
    hapticLabel.click();
  } catch {}
}

// Lens motion: snappy but with a little overshoot, like the iOS 26 selection lens.
const SNAP = { stiffness: 480, damping: 36, mass: 0.8 };
const LIFT = { type: "spring", stiffness: 600, damping: 30 } as const;

/**
 * Floating Liquid Glass tab bar (iOS 26 style): a glass capsule inset from the screen edges with a
 * separate circular search button. The selection is a single glass lens that springs between tabs;
 * touching the bar lifts the lens, it follows the finger while scrubbing and snaps to the tab on release.
 *
 * The lens is positioned with a transform driven by a spring (no layout animations): the bar is fixed,
 * so page scroll / route loading can never make it jump.
 */
export function TabBar({ pathname, items }: { pathname: string; items: Item[] }) {
  const router = useRouter();
  const barRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; idx: number; moved: boolean; left: number; width: number } | null>(null);
  const [pressed, setPressed] = useState<number | null>(null);
  const [itemW, setItemW] = useState(0);
  // Optimistic selection: move the lens immediately, before the route finishes loading.
  const [pending, setPending] = useState<{ href: string; from: string } | null>(null);

  const n = items.length;
  const routeIdx = items.findIndex((i) => isActive(pathname, i.href));
  const pendingIdx = pending && pending.from === pathname ? items.findIndex((i) => i.href === pending.href) : -1;
  const activeIdx = pendingIdx >= 0 ? pendingIdx : routeIdx;
  const highlightIdx = pressed ?? activeIdx;

  const target = useMotionValue(0);
  const x = useSpring(target, SNAP);
  const placed = useRef(false);

  // Measure the slot width (and keep it right on rotation / resize).
  useLayoutEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const measure = () => setItemW(el.getBoundingClientRect().width / n);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [n]);

  // Spring the lens to the selected tab (jump without animation on first placement).
  useLayoutEffect(() => {
    if (activeIdx < 0) {
      // no tab selected on this page: next selection must not fly in from the lens' last spot
      if (!drag.current) placed.current = false;
      return;
    }
    if (!itemW || drag.current?.moved) return;
    const to = activeIdx * itemW;
    if (!placed.current) {
      target.jump(to);
      x.jump(to);
      placed.current = true;
    } else target.set(to);
  }, [activeIdx, itemW, target, x]);

  const indexAt = (clientX: number, d = drag.current) => {
    const r = d ?? barRef.current!.getBoundingClientRect();
    return Math.max(0, Math.min(n - 1, Math.floor(((clientX - r.left) / r.width) * n)));
  };

  const followFinger = (clientX: number, d: NonNullable<typeof drag.current>) => {
    const w = d.width / n;
    target.set(Math.max(0, Math.min(d.width - w, clientX - d.left - w / 2)));
  };

  const select = (idx: number) => {
    if (idx !== activeIdx) haptic();
    if (pathname !== items[idx].href) setPending({ href: items[idx].href, from: pathname });
  };

  const release = () => {
    drag.current = null;
    setPressed(null);
    if (activeIdx >= 0) target.set(activeIdx * itemW);
  };

  return (
    <div className="tabbar fixed inset-x-0 z-40 flex items-center justify-center gap-2.5 px-4 md:hidden">
      <nav
        aria-label="Hlavní navigace"
        className="glass relative h-[62px] w-full max-w-[22rem] rounded-full p-1"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          const r = barRef.current!.getBoundingClientRect();
          const d = { x: e.clientX, idx: 0, moved: false, left: r.left, width: r.width };
          d.idx = indexAt(e.clientX, d);
          drag.current = d;
          setPressed(d.idx);
          // lens grows in place over the touched tab; it starts following once the finger moves
          const to = d.idx * (r.width / n);
          if (activeIdx < 0) {
            // no tab selected on this page: the lens appears under the finger instead of flying in
            target.jump(to);
            x.jump(to);
          } else if (d.idx !== activeIdx) target.set(to);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          if (!d.moved && Math.abs(e.clientX - d.x) > 6) d.moved = true;
          if (!d.moved) return;
          followFinger(e.clientX, d);
          const idx = indexAt(e.clientX, d);
          if (idx !== d.idx) {
            d.idx = idx;
            haptic();
            setPressed(idx);
          }
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          if (d?.moved) {
            const idx = indexAt(e.clientX, d);
            select(idx);
            target.set(idx * (d.width / n));
            drag.current = null;
            setPressed(null);
            if (pathname !== items[idx].href) router.push(items[idx].href);
            return;
          }
          // a plain tap: the Link's onClick navigates
          drag.current = null;
          setPressed(null);
        }}
        onPointerCancel={release}
        onLostPointerCapture={() => drag.current && release()}
      >
        <div ref={barRef} className="relative flex h-full">
          {itemW > 0 && (activeIdx >= 0 || pressed != null) && (
            <motion.span
              aria-hidden
              className={cn("glass-lens pointer-events-none absolute inset-y-0 left-0 rounded-full", pressed != null && "is-pressed")}
              style={{ width: itemW, x }}
              initial={false}
              animate={{ scale: pressed != null ? 1.14 : 1 }}
              transition={LIFT}
            />
          )}
          {items.map((item, idx) => {
            const active = idx === highlightIdx;
            return (
              <Link
                key={item.href}
                href={item.href}
                draggable={false}
                aria-current={idx === activeIdx ? "page" : undefined}
                onClick={(e) => {
                  if (drag.current?.moved) return e.preventDefault();
                  select(idx);
                }}
                className="relative flex min-w-0 flex-1 flex-col items-center justify-center gap-[3px] rounded-full"
              >
                <motion.span
                  className="relative flex flex-col items-center gap-[3px]"
                  initial={false}
                  animate={{ scale: pressed === idx ? 1.08 : 1 }}
                  transition={LIFT}
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
        transition={LIFT}
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

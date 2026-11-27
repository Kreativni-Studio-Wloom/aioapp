"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Equipment } from "@/db/schema";
import { H, W, frame, shapeAttrs, type Shape, type Spec } from "@/lib/workout/anim/engine";
import { getAnimation } from "@/lib/workout/anim/library";
import { cn } from "@/lib/utils";

type Props = {
  exercise: { name: string; pattern: string; equipment: Equipment };
  /** "loop" animates while visible, "hover" only while hovered (list thumbnails), "static" never. */
  mode?: "loop" | "hover" | "static";
  className?: string;
};

/** Phase shown when not animating – the working position reads best. */
const STILL = 0.5;

const RM = "(prefers-reduced-motion: reduce)";
function useReducedMotion() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(RM);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(RM).matches,
    () => false,
  );
}

export function ExerciseAnimation({ exercise, mode = "loop", className }: Props) {
  const spec = useMemo(() => getAnimation(exercise), [exercise]);
  const ref = useRef<SVGSVGElement>(null);
  const [u, setU] = useState(STILL);
  const [visible, setVisible] = useState(false);
  const [hover, setHover] = useState(false);
  const reduced = useReducedMotion();
  const running = !reduced && visible && (mode === "loop" || (mode === "hover" && hover));

  useEffect(() => {
    const el = ref.current;
    if (!el || mode === "static") return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: "40px" });
    io.observe(el);
    return () => io.disconnect();
  }, [mode]);

  useEffect(() => {
    if (!running) return;
    const dur = spec.dur ?? 2600;
    let raf = 0;
    let last = performance.now();
    let phase = mode === "hover" ? STILL : 0;
    const tick = (now: number) => {
      phase = (phase + (now - last) / dur) % 1;
      last = now;
      setU(phase);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, spec, mode]);

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${W} ${H}`}
      className={cn("block select-none", className)}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={`Animace cviku ${exercise.name}`}
      onPointerEnter={mode === "hover" ? () => setHover(true) : undefined}
      onPointerLeave={mode === "hover" ? () => setHover(false) : undefined}
    >
      <Frame spec={spec} u={running ? u : STILL} />
    </svg>
  );
}

function Frame({ spec, u }: { spec: Spec; u: number }) {
  const shapes = frame(spec, u);
  return <>{shapes.map((s, i) => renderShape(s, i))}</>;
}

function renderShape(s: Shape, key: number) {
  const a = shapeAttrs(s);
  const props = {
    opacity: a.opacity as number | undefined,
    fill: a.fill as string | undefined,
    stroke: a.stroke as string,
    strokeWidth: a["stroke-width"] as number,
    strokeDasharray: a["stroke-dasharray"] as string | undefined,
  };
  if (s.k === "l") return <line key={key} {...props} x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} />;
  if (s.k === "c") return <circle key={key} {...props} cx={a.cx} cy={a.cy} r={a.r} />;
  return <path key={key} {...props} d={a.d as string} />;
}

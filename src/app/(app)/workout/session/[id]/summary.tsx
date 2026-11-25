"use client";

import { motion } from "motion/react";
import { Check, Trophy } from "lucide-react";
import { Button } from "@/components/ui";
import { AnimatedNumber } from "@/components/ui/client";
import { duration } from "@/lib/format";
import { fmtKg } from "@/lib/workout/calc";
import type { WorkoutFinishSummary } from "@/lib/workout/service";

// Deterministic "confetti" burst (monochrome squares/circles flying out from the badge).
const PARTICLES = Array.from({ length: 22 }, (_, i) => {
  const angle = (i / 22) * Math.PI * 2 + (i % 3) * 0.2;
  const dist = 90 + ((i * 37) % 70);
  return { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist, size: 4 + (i % 4) * 2, round: i % 2 === 0, delay: (i % 5) * 0.03, rotate: (i * 47) % 360 };
});

export function FinishSummary({ summary, onDone, onDetail }: { summary: WorkoutFinishSummary; onDone: () => void; onDetail: () => void }) {
  return (
    <div className="flex min-h-[80dvh] flex-col items-center justify-center py-10 text-center">
      <div className="relative grid h-40 w-40 place-items-center">
        {PARTICLES.map((p, i) => (
          <motion.span
            key={i}
            className="absolute bg-fg"
            style={{ width: p.size, height: p.size, borderRadius: p.round ? 999 : 2 }}
            initial={{ x: 0, y: 0, opacity: 0, scale: 0.4, rotate: 0 }}
            animate={{ x: p.x, y: p.y, opacity: [0, 1, 0], scale: 1, rotate: p.rotate }}
            transition={{ duration: 1.1, delay: 0.25 + p.delay, ease: [0.22, 1, 0.36, 1] }}
          />
        ))}
        <motion.div
          className="grid h-24 w-24 place-items-center rounded-full bg-fg text-inverse"
          initial={{ scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", damping: 12, stiffness: 220 }}
        >
          <Check className="h-12 w-12" strokeWidth={3} />
        </motion.div>
      </div>

      <motion.h1 className="mt-4 text-3xl font-semibold tracking-tight" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        Trénink hotový
      </motion.h1>
      <p className="mt-1 text-muted">{summary.name}</p>

      <motion.div className="mt-8 grid w-full max-w-md grid-cols-3 gap-2" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}>
        <div className="rounded-2xl bg-card px-2 py-4">
          <div className="text-xs text-muted">Čas</div>
          <div className="num mt-1 text-xl font-semibold">{duration(summary.durationSec)}</div>
        </div>
        <div className="rounded-2xl bg-card px-2 py-4">
          <div className="text-xs text-muted">Objem</div>
          <div className="mt-1 text-xl font-semibold">
            <AnimatedNumber value={summary.volumeKg} /> <span className="text-sm font-normal text-muted">kg</span>
          </div>
        </div>
        <div className="rounded-2xl bg-card px-2 py-4">
          <div className="text-xs text-muted">Série</div>
          <div className="mt-1 text-xl font-semibold">
            <AnimatedNumber value={summary.sets} />
          </div>
        </div>
      </motion.div>

      {summary.prs.length > 0 && (
        <motion.div className="mt-6 w-full max-w-md rounded-2xl border border-line-strong p-4 text-left" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
          <div className="mb-2 flex items-center gap-2 font-semibold">
            <Trophy className="h-4 w-4" /> Osobní rekordy ({summary.prs.length})
          </div>
          <ul className="space-y-1.5 text-sm">
            {summary.prs.map((pr, i) => (
              <motion.li
                key={pr.exerciseId}
                className="num flex justify-between gap-3"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.7 + i * 0.08 }}
              >
                <span className="truncate">{pr.exerciseName}</span>
                <span className="shrink-0 font-medium">
                  {pr.kind === "weight" ? `${fmtKg(pr.value)} kg × ${pr.reps}` : `1RM ${fmtKg(pr.value)} kg`}
                  <span className="ml-1.5 text-pos">+{fmtKg(Math.round((pr.value - pr.previous) * 10) / 10)}</span>
                </span>
              </motion.li>
            ))}
          </ul>
        </motion.div>
      )}

      <div className="mt-8 flex w-full max-w-md flex-col gap-2">
        <Button size="lg" onClick={onDone}>
          Hotovo
        </Button>
        <Button variant="ghost" onClick={onDetail}>
          Detail tréninku
        </Button>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Input } from "@/components/ui";
import { Segmented, Sheet } from "@/components/ui/client";
import { toNum } from "@/lib/utils";
import { fmtKg, platesPerSide } from "@/lib/workout/calc";

const PLATE_HEIGHT: Record<number, number> = { 25: 100, 20: 92, 15: 80, 10: 66, 5: 50, 2.5: 40, 1.25: 32 };

export function PlateCalculator({ open, initialKg, onClose }: { open: boolean; initialKg: number; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Kalkulačka kotoučů">
      {open && <PlateBody key={initialKg} initialKg={initialKg} />}
    </Sheet>
  );
}

function PlateBody({ initialKg }: { initialKg: number }) {
  const [value, setValue] = useState(initialKg ? String(initialKg).replace(".", ",") : "");
  const [bar, setBar] = useState<"20" | "15" | "10">("20");
  const total = toNum(value) ?? 0;
  const barKg = Number(bar);
  const { plates, remainder } = platesPerSide(total, barKg);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            inputMode="decimal"
            className="num h-14 pr-10 text-center text-2xl font-semibold"
            autoFocus
            onFocus={(e) => e.target.select()}
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">kg</span>
        </div>
        <Segmented
          layoutId="bar-weight"
          value={bar}
          onChange={setBar}
          options={[
            { value: "20", label: "20" },
            { value: "15", label: "15" },
            { value: "10", label: "10" },
          ]}
        />
      </div>
      <div className="text-center text-xs text-muted">Osa {barKg} kg · kotouče na každou stranu</div>

      {/* Bar visual: sleeve with plates */}
      <div className="flex h-28 items-center justify-center">
        <div className="h-3 w-16 rounded-l-full bg-line-strong" />
        <div className="h-5 w-2 bg-fg-soft" />
        <div className="flex items-center gap-[3px] px-1">
          {plates.map((p, i) => (
            <div
              key={i}
              className="num grid w-5 place-items-center rounded-[4px] bg-fg text-[9px] font-semibold text-inverse [writing-mode:vertical-rl]"
              style={{ height: PLATE_HEIGHT[p] ?? 40 }}
            >
              {fmtKg(p)}
            </div>
          ))}
        </div>
        <div className="h-3 w-10 rounded-r-full bg-line-strong" />
      </div>

      {total < barKg ? (
        <p className="text-center text-sm text-muted">Váha je nižší než samotná osa.</p>
      ) : plates.length ? (
        <div className="flex flex-wrap justify-center gap-2">
          {Object.entries(
            plates.reduce<Record<string, number>>((acc, p) => {
              acc[p] = (acc[p] ?? 0) + 1;
              return acc;
            }, {}),
          )
            .sort((a, b) => Number(b[0]) - Number(a[0]))
            .map(([p, n]) => (
              <span key={p} className="num rounded-full bg-card px-3 py-1.5 text-sm font-medium">
                {n}× {fmtKg(Number(p))} kg
              </span>
            ))}
        </div>
      ) : (
        <p className="text-center text-sm text-muted">Jen osa.</p>
      )}
      {remainder > 0 && <p className="num text-center text-xs text-muted">Nelze přesně naložit – chybí {fmtKg(remainder)} kg.</p>}
    </div>
  );
}

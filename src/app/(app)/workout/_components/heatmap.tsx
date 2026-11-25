import { addDays, dateLabel, isoDate } from "@/lib/format";
import { fmtVolume } from "@/lib/workout/calc";
import { WEEKDAYS_CS } from "@/lib/workout/constants";

/** GitHub-style calendar heatmap (columns = weeks, rows = Mon…Sun). Monochrome intensity by volume. */
export function Heatmap({ start, weeks, days }: { start: string; weeks: number; days: Record<string, { count: number; volumeKg: number }> }) {
  const today = isoDate();
  const max = Math.max(1, ...Object.values(days).map((d) => d.volumeKg));
  const cols = Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)));
  const total = Object.values(days).reduce((a, d) => a + d.count, 0);
  return (
    <div>
      <div className="flex gap-2">
        <div className="grid shrink-0 grid-rows-7 gap-[3px] pt-5 text-[9px] leading-none text-subtle">
          {WEEKDAYS_CS.map((d, i) => (
            <div key={d} className="flex h-full items-center">
              {i % 2 === 0 ? d : ""}
            </div>
          ))}
        </div>
        <div className="grid min-w-0 flex-1 gap-[3px]" style={{ gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))` }}>
          {cols.map((col, wi) => (
            <div key={wi} className="grid grid-rows-[16px_repeat(7,minmax(0,1fr))] gap-[3px]">
              <div className="truncate text-[9px] leading-4 text-subtle">
                {col[0].slice(8, 10) <= "07" ? dateLabel(col[0], { month: "short" }).replace(".", "") : ""}
              </div>
              {col.map((day) => {
                const d = days[day];
                const future = day > today;
                const intensity = d ? 0.25 + 0.75 * (d.volumeKg / max) : 0;
                return (
                  <div
                    key={day}
                    title={d ? `${dateLabel(day, { day: "numeric", month: "long" })}: ${d.count}× · ${fmtVolume(d.volumeKg)}` : dateLabel(day, { day: "numeric", month: "long" })}
                    className={`aspect-square w-full rounded-[3px] ${future ? "bg-transparent" : "bg-line"} ${day === today ? "ring-1 ring-fg-soft" : ""}`}
                    style={d ? { background: "var(--fg)", opacity: intensity } : undefined}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 text-xs text-muted">
        <span className="num">{total}</span> tréninků za posledních {weeks} týdnů
      </div>
    </div>
  );
}

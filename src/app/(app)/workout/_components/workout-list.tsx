import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { dateLabel, duration, relativeDay } from "@/lib/format";
import { fmtVolume } from "@/lib/workout/calc";
import type { WorkoutListItem } from "@/lib/workout/service";

export function WorkoutList({ items }: { items: WorkoutListItem[] }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-card">
      {items.map((w) => (
        <Link
          key={w.id}
          href={`/workout/history/${w.id}`}
          className="flex items-center gap-3 border-b border-line px-4 py-3 transition-colors last:border-0 hover:bg-card-hover"
        >
          <div className="w-12 shrink-0 text-center">
            <div className="text-[11px] uppercase text-muted">{dateLabel(w.date, { weekday: "short" })}</div>
            <div className="num text-lg font-semibold leading-tight">{dateLabel(w.date, { day: "numeric" })}</div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{w.name}</div>
            <div className="num truncate text-xs text-muted">
              {relativeDay(w.date)} · {w.exercises} cviků · {w.sets} sérií{w.durationSec ? ` · ${duration(w.durationSec)}` : ""}
            </div>
          </div>
          <div className="num shrink-0 text-sm font-medium">{fmtVolume(w.volumeKg)}</div>
          <ChevronRight className="h-4 w-4 shrink-0 text-subtle" />
        </Link>
      ))}
    </div>
  );
}

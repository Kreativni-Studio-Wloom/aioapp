import { Card, Empty, LinkButton, PageHeader, SectionTitle } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { MONTHS_CS } from "@/lib/format";
import { fmtVolume } from "@/lib/workout/calc";
import { getWorkoutHeatmap, getWorkoutsSince } from "@/lib/workout/service";
import { Heatmap } from "../_components/heatmap";
import { WorkoutList } from "../_components/workout-list";

const WEEKS = 16;

export default async function HistoryPage() {
  const user = await requireUser();
  const [heat, workouts] = await Promise.all([getWorkoutHeatmap(user.id, WEEKS), getWorkoutsSince(user.id, 365)]);

  // group list by month
  const byMonth = new Map<string, typeof workouts>();
  for (const w of workouts) {
    const k = w.date.slice(0, 7);
    byMonth.set(k, [...(byMonth.get(k) ?? []), w]);
  }

  return (
    <>
      <PageHeader title="Historie" back="/workout" />
      <Card>
        <Heatmap start={heat.start} weeks={WEEKS} days={heat.days} />
      </Card>

      {!workouts.length ? (
        <div className="mt-6">
          <Empty title="Zatím žádné tréninky" action={<LinkButton href="/workout">Začít trénink</LinkButton>}>
            Dokončené tréninky se tu objeví i s objemem a rekordy.
          </Empty>
        </div>
      ) : (
        [...byMonth.entries()].map(([month, list]) => (
          <div key={month} className="mt-8">
            <SectionTitle
              action={
                <span className="num text-xs text-muted">
                  {list.length}× · {fmtVolume(list.reduce((a, w) => a + w.volumeKg, 0))}
                </span>
              }
            >
              {MONTHS_CS[Number(month.slice(5, 7)) - 1]} {month.slice(0, 4)}
            </SectionTitle>
            <WorkoutList items={list} />
          </div>
        ))
      )}
    </>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, Empty, PageHeader, SectionTitle, Stat } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { dateLabel, num } from "@/lib/format";
import { fmtVolume } from "@/lib/workout/calc";
import { equipmentLabel, muscleLabel, patternLabel } from "@/lib/workout/constants";
import { getAlternatives, getExerciseHistory } from "@/lib/workout/service";
import { TrendChart, VolumeBars } from "../../_components/charts";
import { ExerciseAnimation } from "@/components/exercise-animation";
import { DeleteExerciseButton } from "./delete-button";

export default async function ExercisePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [history, alternatives] = await Promise.all([getExerciseHistory(user.id, id, 60), getAlternatives(user.id, id, 8).catch(() => [])]);
  if (!history) notFound();
  const { exercise, sessions, prs } = history;
  const chrono = [...sessions].reverse();
  const chart = chrono.map((s) => ({ date: s.date, top: s.topSetWeight, e1rm: s.bestE1rm }));
  const last = sessions[0];

  return (
    <>
      <PageHeader
        title={exercise.name}
        subtitle={`${muscleLabel(exercise.primaryMuscle)} · ${equipmentLabel(exercise.equipment)} · ${patternLabel(exercise.pattern)}`}
        back="/workout/exercises"
        action={exercise.isCustom ? <DeleteExerciseButton id={exercise.id} /> : undefined}
      />
      {exercise.secondaryMuscles.length > 0 && (
        <div className="-mt-3 mb-5 flex flex-wrap gap-1.5">
          {exercise.secondaryMuscles.map((m) => (
            <Badge key={m}>{muscleLabel(m)}</Badge>
          ))}
        </div>
      )}

      <Card className="mb-5 flex justify-center px-0 py-2 md:px-0 md:py-3">
        <ExerciseAnimation exercise={exercise} className="aspect-[4/3] w-full max-w-sm" />
      </Card>

      {!sessions.length ? (
        <Empty title="Zatím žádná historie">Jakmile cvik zapíšeš v tréninku, uvidíš tu grafy a osobní rekordy.</Empty>
      ) : (
        <>
          <Card className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Stat label="Odhad 1RM" value={prs.bestE1rm ? `${num(prs.bestE1rm.value, 1)} kg` : "–"} sub={prs.bestE1rm ? `${num(prs.bestE1rm.weightKg, 2)} × ${prs.bestE1rm.reps}` : undefined} />
            <Stat label="Nejvyšší váha" value={prs.bestWeight ? `${num(prs.bestWeight.weightKg, 2)} kg` : "–"} sub={prs.bestWeight ? `× ${prs.bestWeight.reps} · ${dateLabel(prs.bestWeight.date)}` : undefined} />
            <Stat label="Naposledy" value={last ? `${num(last.topSetWeight, 2)} × ${last.topSetReps}` : "–"} sub={last ? dateLabel(last.date) : undefined} />
            <Stat label="Tréninků" value={sessions.length} />
          </Card>

          <SectionTitle>Top série a odhad 1RM</SectionTitle>
          <Card>
            <TrendChart
              data={chart}
              lines={[
                { key: "e1rm", label: "Odhad 1RM", muted: true },
                { key: "top", label: "Top série", dots: true },
              ]}
            />
          </Card>

          <SectionTitle>Objem na trénink</SectionTitle>
          <Card>
            <VolumeBars data={chrono.map((s) => ({ date: s.date, value: s.volumeKg }))} />
          </Card>

          <SectionTitle>Osobní rekordy podle opakování</SectionTitle>
          <Card className="p-0 md:p-0">
            <table className="num w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="px-4 py-2.5 font-medium">Opakování</th>
                  <th className="px-4 py-2.5 font-medium">Váha</th>
                  <th className="px-4 py-2.5 font-medium">Odhad 1RM</th>
                  <th className="px-4 py-2.5 text-right font-medium">Datum</th>
                </tr>
              </thead>
              <tbody>
                {prs.byReps.map((r) => (
                  <tr key={r.reps} className="border-t border-line">
                    <td className="px-4 py-2.5">{r.reps}</td>
                    <td className="px-4 py-2.5 font-medium">{num(r.weightKg, 2)} kg</td>
                    <td className="px-4 py-2.5 text-muted">{num(r.reps === 1 ? r.weightKg : r.weightKg * (1 + r.reps / 30), 1)} kg</td>
                    <td className="px-4 py-2.5 text-right text-muted">{dateLabel(r.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <SectionTitle>Historie</SectionTitle>
          <div className="overflow-hidden rounded-2xl bg-card">
            {sessions.slice(0, 15).map((s) => (
              <Link key={s.workoutId} href={`/workout/history/${s.workoutId}`} className="block border-b border-line px-4 py-3 last:border-0 hover:bg-card-hover">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{dateLabel(s.date, { weekday: "short", day: "numeric", month: "short" })}</span>
                  <span className="num text-xs text-muted">
                    {fmtVolume(s.volumeKg)} · 1RM {num(s.bestE1rm, 1)}
                  </span>
                </div>
                <div className="num mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-fg-soft">
                  {s.sets.map((x, i) => (
                    <span key={i} className={x.isWarmup ? "text-subtle" : undefined}>
                      {num(x.weightKg, 2)}×{x.reps}
                      {x.rpe ? ` @${num(x.rpe, 1)}` : ""}
                    </span>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      {alternatives.length > 0 && (
        <>
          <SectionTitle>Náhrady</SectionTitle>
          <div className="overflow-hidden rounded-2xl bg-card">
            {alternatives.map((a) => (
              <Link key={a.id} href={`/workout/exercises/${a.id}`} className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-0 hover:bg-card-hover">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{a.name}</span>
                  <span className="block text-xs text-muted">
                    {a.match === "pattern_muscle" ? "Stejný pohyb i sval" : a.match === "muscle" ? "Stejný sval" : "Stejný pohyb"}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted">{equipmentLabel(a.equipment)}</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  );
}

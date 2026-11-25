import Link from "next/link";
import { notFound } from "next/navigation";
import { Trophy } from "lucide-react";
import { Card, LinkButton, PageHeader, SectionTitle, Stat } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { dateLabel, duration, num } from "@/lib/format";
import { fmtVolume } from "@/lib/workout/calc";
import { equipmentLabel, muscleLabel } from "@/lib/workout/constants";
import { getWorkout } from "@/lib/workout/service";
import { DeleteWorkoutButton } from "./delete-button";

export default async function WorkoutDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const user = await requireUser();
  const w = await getWorkout(user.id, id);
  if (!w) notFound();

  return (
    <>
      <PageHeader
        title={w.name}
        subtitle={`${dateLabel(w.startedAt, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · ${dateLabel(w.startedAt, { hour: "2-digit", minute: "2-digit" })}`}
        back="/workout/history"
        action={!w.finishedAt ? <LinkButton href={`/workout/session/${w.id}`} size="sm">Pokračovat</LinkButton> : undefined}
      />

      <Card className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Čas" value={w.durationSec ? duration(w.durationSec) : "–"} />
        <Stat label="Objem" value={fmtVolume(w.volumeKg)} />
        <Stat label="Pracovní série" value={w.sets} />
        <Stat label="Cviky" value={w.exercises.length} />
      </Card>

      {w.prs.length > 0 && (
        <>
          <SectionTitle>Osobní rekordy</SectionTitle>
          <Card className="space-y-2">
            {w.prs.map((pr) => (
              <div key={pr.exerciseId} className="num flex items-center justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <Trophy className="h-4 w-4 shrink-0 text-muted" />
                  <span className="truncate">{pr.exerciseName}</span>
                </span>
                <span className="shrink-0 font-medium">
                  {pr.kind === "weight" ? `${num(pr.value, 2)} kg × ${pr.reps}` : `1RM ${num(pr.value, 1)} kg`}
                  <span className="ml-1.5 text-pos">+{num(pr.value - pr.previous, 1)}</span>
                </span>
              </div>
            ))}
          </Card>
        </>
      )}

      <SectionTitle>Cviky</SectionTitle>
      <div className="grid gap-3 md:grid-cols-2">
        {w.exercises.map((ex) => (
          <Card key={`${ex.order}:${ex.exerciseId}`}>
            <div className="flex items-start justify-between gap-3">
              <Link href={`/workout/exercises/${ex.exerciseId}`} className="min-w-0 hover:underline">
                <div className="truncate font-medium">{ex.exerciseName}</div>
                <div className="text-xs text-muted">
                  {muscleLabel(ex.primaryMuscle)} · {equipmentLabel(ex.equipment)}
                </div>
              </Link>
              <div className="num shrink-0 text-right text-xs text-muted">
                <div>{fmtVolume(ex.volumeKg)}</div>
                {ex.bestE1rm > 0 && <div>1RM {num(ex.bestE1rm, 1)}</div>}
              </div>
            </div>
            <table className="num mt-3 w-full text-sm">
              <tbody>
                {ex.sets.map((s, i) => (
                  <tr key={s.id} className={s.isWarmup || !s.completed ? "text-subtle" : undefined}>
                    <td className="w-10 py-1 text-xs text-muted">{s.isWarmup ? "W" : i + 1 - ex.sets.slice(0, i).filter((x) => x.isWarmup).length}</td>
                    <td className="py-1 font-medium">{num(s.weightKg, 2)} kg</td>
                    <td className="py-1">× {s.reps}</td>
                    <td className="py-1 text-right text-xs text-muted">{s.rpe ? `RPE ${num(s.rpe, 1)}` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ))}
      </div>

      {w.notes && (
        <>
          <SectionTitle>Poznámky</SectionTitle>
          <Card className="whitespace-pre-wrap text-sm text-fg-soft">{w.notes}</Card>
        </>
      )}

      <div className="mt-10 flex justify-center">
        <DeleteWorkoutButton id={w.id} />
      </div>
    </>
  );
}

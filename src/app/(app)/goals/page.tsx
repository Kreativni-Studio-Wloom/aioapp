import Link from "next/link";
import { Check } from "lucide-react";
import { Card, Empty, PageHeader, ProgressBar, SectionTitle } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { dateLabel, money, num } from "@/lib/format";
import { listGoals, type GoalDTO } from "@/lib/goals/service";
import { listExercises } from "@/lib/workout/service";
import { listSources } from "@/lib/income/service";
import { GoalButton, DeleteGoal } from "./client";

export const metadata = { title: "Cíle" };

const fmt = (g: GoalDTO, v: number | null) => (v == null ? "–" : g.unit === "kg" ? `${num(v, 1)} kg` : money(v));

function GoalCard({ g }: { g: GoalDTO }) {
  return (
    <Card className={g.unit === "CZK" ? "private" : undefined}>
      <div className="flex items-start justify-between gap-3">
        <Link href={g.href} className="min-w-0 hover:underline">
          <div className="truncate font-semibold">{g.title}</div>
        </Link>
        <div className="flex shrink-0 items-center gap-1">
          {g.achievedAt && (
            <span className="flex items-center gap-1 text-xs text-pos">
              <Check className="h-3.5 w-3.5" /> splněno
            </span>
          )}
          <DeleteGoal id={g.id} />
        </div>
      </div>
      <div className="num mt-3 flex items-baseline justify-between text-sm">
        <span className="text-lg font-semibold">{fmt(g, g.current)}</span>
        <span className="text-muted">cíl {fmt(g, g.target)}</span>
      </div>
      <ProgressBar value={g.progress} max={1} className="mt-2" />
      <div className="mt-2 flex justify-between text-xs text-muted">
        <span className="num">{Math.round(g.progress * 100)} %{g.start != null ? ` · start ${fmt(g, g.start)}` : ""}</span>
        <span>
          {g.achievedAt
            ? `splněno ${dateLabel(g.achievedAt)}`
            : g.deadline
              ? g.daysLeft != null && g.daysLeft < 0
                ? `termín ${dateLabel(g.deadline)} uplynul`
                : `do ${dateLabel(g.deadline)} · ${g.daysLeft} dní`
              : "bez termínu"}
        </span>
      </div>
    </Card>
  );
}

export default async function GoalsPage() {
  const user = await requireUser();
  const [goals, exercises, sources] = await Promise.all([listGoals(user.id), listExercises(user.id), listSources(user.id)]);
  const open = goals.filter((g) => !g.achievedAt);
  const done = goals.filter((g) => g.achievedAt);
  const button = (
    <GoalButton exercises={exercises.map((e) => ({ id: e.id, name: e.name }))} sources={sources.map((s) => ({ id: s.id, name: s.name }))} />
  );

  return (
    <div>
      <PageHeader title="Cíle" subtitle="Napříč tréninkem, váhou, příjmy a portfoliem" action={button} />
      {goals.length === 0 ? (
        <Empty title="Zatím žádné cíle" action={button}>
          Např. „bench 100 kg“, „váha 78 kg do června“, „500 000 Kč z Matchi letos“ nebo „čisté jmění 2 mil.“. Progres se počítá sám z tvých dat.
        </Empty>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            {open.map((g) => (
              <GoalCard key={g.id} g={g} />
            ))}
          </div>
          {done.length > 0 && (
            <>
              <SectionTitle className="mt-8">Splněné</SectionTitle>
              <div className="grid gap-3 md:grid-cols-2">
                {done.map((g) => (
                  <GoalCard key={g.id} g={g} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

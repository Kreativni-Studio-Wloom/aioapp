import Link from "next/link";
import { ArrowRight, BookOpen, CalendarDays, ListChecks, Play, Scale, Sparkles, TrendingDown } from "lucide-react";
import { Badge, Card, CardLink, Empty, LinkButton, PageHeader, SectionTitle, Stat } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { requireUser } from "@/lib/auth";
import { dateLabel, duration, num } from "@/lib/format";
import { fmtVolume } from "@/lib/workout/calc";
import { WEEKDAYS_LONG_CS } from "@/lib/workout/constants";
import { getActiveWorkout, getLatestWeight, getRecentWorkouts, getStagnation, getTodayPlan, getWeekStats } from "@/lib/workout/service";
import { startWorkoutAction } from "./actions";
import { WorkoutList } from "./_components/workout-list";

export default async function WorkoutHome() {
  const user = await requireUser();
  const [active, plan, week, stagnation, recent, weight] = await Promise.all([
    getActiveWorkout(user.id),
    getTodayPlan(user.id),
    getWeekStats(user.id),
    getStagnation(user.id),
    getRecentWorkouts(user.id, 5),
    getLatestWeight(user.id),
  ]);

  return (
    <>
      <PageHeader
        title="Trénink"
        subtitle={dateLabel(new Date(), { weekday: "long", day: "numeric", month: "long" })}
        action={
          <LinkButton href="/ai?module=workout" variant="secondary" size="sm">
            <Sparkles className="h-4 w-4" /> AI kouč
          </LinkButton>
        }
      />

      {active && (
        <Link
          href={`/workout/session/${active.id}`}
          className="mb-4 flex items-center gap-3 rounded-2xl bg-fg p-4 text-inverse transition-transform active:scale-[0.985]"
        >
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-inverse opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-inverse" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-xs opacity-70">Rozpracovaný trénink</div>
            <div className="truncate font-semibold">{active.name}</div>
          </div>
          <span className="flex items-center gap-1 text-sm font-medium">
            Pokračovat <ArrowRight className="h-4 w-4" />
          </span>
        </Link>
      )}

      {plan ? (
        <Card className="p-5 md:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs text-muted">
                {plan.restDay ? "Dnes volno · další v pořadí" : plan.reason === "weekday" ? `Dnes · ${WEEKDAYS_LONG_CS[(plan.day.weekday ?? 1) - 1]}` : "Další v pořadí"}
              </div>
              <div className="mt-1 truncate text-2xl font-semibold tracking-tight">{plan.day.name}</div>
              <div className="truncate text-sm text-muted">{plan.programName}</div>
            </div>
            <Badge>{plan.day.exercises.length} cviků</Badge>
          </div>
          {plan.day.exercises.length > 0 && (
            <ul className="mt-4 space-y-1.5 text-sm">
              {plan.day.exercises.slice(0, 6).map((e) => (
                <li key={e.id} className="flex justify-between gap-3">
                  <span className="truncate text-fg-soft">{e.exerciseName}</span>
                  <span className="num shrink-0 text-muted">
                    {e.sets} × {e.repMin === e.repMax ? e.repMin : `${e.repMin}–${e.repMax}`}
                  </span>
                </li>
              ))}
              {plan.day.exercises.length > 6 && <li className="text-xs text-subtle">+ {plan.day.exercises.length - 6} dalších</li>}
            </ul>
          )}
          {!active && (
            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <form action={startWorkoutAction} className="flex-1">
                <input type="hidden" name="programDayId" value={plan.day.id} />
                <SubmitButton size="lg" className="w-full" pendingText="Začínám…">
                  <Play className="h-5 w-5" fill="currentColor" /> Začít trénink
                </SubmitButton>
              </form>
              <form action={startWorkoutAction}>
                <SubmitButton size="lg" variant="secondary" className="w-full">
                  Prázdný trénink
                </SubmitButton>
              </form>
            </div>
          )}
          <div className="mt-3 text-center">
            <Link href={`/workout/programs/${plan.programId}`} className="text-xs text-muted hover:text-fg">
              Jiný den programu →
            </Link>
          </div>
        </Card>
      ) : (
        <Empty
          title="Nemáš aktivní program"
          action={
            <div className="flex flex-col gap-2 sm:flex-row">
              <LinkButton href="/workout/programs">Vybrat program</LinkButton>
              {!active && (
                <form action={startWorkoutAction}>
                  <SubmitButton variant="secondary" className="w-full">
                    Prázdný trénink
                  </SubmitButton>
                </form>
              )}
            </div>
          }
        >
          Vytvoř si vlastní program nebo začni ze šablony (PPL, Upper/Lower, Full body). Nebo rovnou zapisuj prázdný trénink.
        </Empty>
      )}

      <SectionTitle>Tento týden</SectionTitle>
      <Card className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Tréninky" value={week.workouts} />
        <Stat label="Objem" value={fmtVolume(week.volumeKg)} />
        <Stat label="Pracovní série" value={week.sets} />
        <Stat label="Čas" value={week.durationSec ? duration(week.durationSec) : "–"} />
      </Card>

      {stagnation.length > 0 && (
        <>
          <SectionTitle>Stagnace</SectionTitle>
          <div className="grid gap-3 md:grid-cols-2">
            {stagnation.slice(0, 6).map((s) => (
              <CardLink key={s.exerciseId} href={`/workout/exercises/${s.exerciseId}`}>
                <div className="flex items-start gap-3">
                  <TrendingDown className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate font-medium">{s.exerciseName}</div>
                      <Badge>{s.sessions}× bez zlepšení</Badge>
                    </div>
                    <div className="num mt-0.5 text-xs text-muted">
                      Nejlepší série {num(s.weightKg, 2)} kg × {s.reps}
                    </div>
                    <div className="mt-2 text-sm text-fg-soft">{s.suggestion.text}</div>
                  </div>
                </div>
              </CardLink>
            ))}
          </div>
        </>
      )}

      <SectionTitle
        action={
          recent.length > 0 && (
            <Link href="/workout/history" className="text-xs text-muted hover:text-fg">
              Vše →
            </Link>
          )
        }
      >
        Poslední tréninky
      </SectionTitle>
      {recent.length ? <WorkoutList items={recent} /> : <div className="rounded-2xl bg-card p-4 text-sm text-muted">Zatím žádný dokončený trénink.</div>}

      <SectionTitle>Sekce</SectionTitle>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <NavTile href="/workout/programs" icon={<ListChecks className="h-5 w-5" />} label="Programy" />
        <NavTile href="/workout/exercises" icon={<BookOpen className="h-5 w-5" />} label="Cviky" />
        <NavTile href="/workout/history" icon={<CalendarDays className="h-5 w-5" />} label="Historie" />
        <NavTile href="/workout/body" icon={<Scale className="h-5 w-5" />} label="Tělo" sub={weight ? `${num(weight.weightKg, 1)} kg` : undefined} />
        <NavTile href="/ai?module=workout" icon={<Sparkles className="h-5 w-5" />} label="AI kouč" className="col-span-2 md:col-span-1" />
      </div>
    </>
  );
}

function NavTile({ href, icon, label, sub, className }: { href: string; icon: React.ReactNode; label: string; sub?: string; className?: string }) {
  return (
    <CardLink href={href} className={className}>
      <div className="text-fg-soft">{icon}</div>
      <div className="mt-3 font-medium">{label}</div>
      {sub && <div className="num text-xs text-muted">{sub}</div>}
    </CardLink>
  );
}

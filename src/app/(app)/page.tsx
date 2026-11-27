import Link from "next/link";
import { Dumbbell, Apple, Wallet, LineChart, Sparkles, Plus, AlertTriangle, ArrowUpRight, Target } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { dateLabel, money, num } from "@/lib/format";
import { CardLink, Delta, ProgressBar } from "@/components/ui";
import { AnimatedNumber, Ring } from "@/components/ui/client";
import { getWorkoutSummary } from "@/lib/workout/summary";
import { getNutritionSummary } from "@/lib/nutrition/summary";
import { getIncomeSummary } from "@/lib/income/summary";
import { getPortfolioSummary } from "@/lib/portfolio/summary";
import { listGoals } from "@/lib/goals/service";
import { Stagger, StaggerItem } from "./stagger";

async function safe<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (e) {
    console.error("dashboard", e);
    return null;
  }
}

function greeting() {
  const h = Number(new Intl.DateTimeFormat("cs-CZ", { hour: "numeric", hour12: false, timeZone: "Europe/Prague" }).format(new Date()));
  if (h < 5) return "Dobrou noc";
  if (h < 11) return "Dobré ráno";
  if (h < 18) return "Dobrý den";
  return "Dobrý večer";
}

function CardHead({ icon: Icon, label }: { icon: typeof Dumbbell; label: string }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <div className="flex items-center gap-2 text-sm font-medium text-muted">
        <Icon className="h-4 w-4" strokeWidth={1.75} /> {label}
      </div>
      <ArrowUpRight className="h-4 w-4 text-subtle" />
    </div>
  );
}

export default async function Home() {
  const user = await requireUser();
  const [w, n, i, p, g] = await Promise.all([
    safe(getWorkoutSummary(user.id)),
    safe(getNutritionSummary(user.id)),
    safe(getIncomeSummary(user.id)),
    safe(getPortfolioSummary(user.id)),
    safe(listGoals(user.id)),
  ]);
  const openGoals = (g ?? []).filter((x) => !x.achievedAt).slice(0, 4);

  const quick = [
    { href: w?.activeWorkoutId ? `/workout/session/${w.activeWorkoutId}` : "/workout", label: w?.activeWorkoutId ? "Pokračovat v tréninku" : "Trénink", icon: Dumbbell },
    { href: "/nutrition?add=1", label: "Jídlo", icon: Plus },
    { href: "/income?add=1", label: "Příjem", icon: Plus },
    { href: "/ai", label: "Zeptat se", icon: Sparkles },
  ];

  return (
    <div>
      <header className="mb-6">
        <div className="text-sm text-muted first-letter:uppercase">{dateLabel(new Date(), { weekday: "long", day: "numeric", month: "long" })}</div>
        <h1 className="mt-1 text-[28px] font-semibold tracking-tight md:text-3xl">
          {greeting()}
          {user.name ? `, ${user.name}` : ""}
        </h1>
      </header>

      <div className="no-scrollbar -mx-4 mb-6 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
        {quick.map((q) => (
          <Link
            key={q.label}
            href={q.href}
            className="flex shrink-0 items-center gap-2 rounded-full border border-line-strong px-4 py-2.5 text-sm font-medium transition-colors hover:bg-card active:scale-[0.97]"
          >
            <q.icon className="h-4 w-4" strokeWidth={2} /> {q.label}
          </Link>
        ))}
      </div>

      <Stagger className="grid gap-3 md:grid-cols-2">
        {/* Workout */}
        <StaggerItem>
          <CardLink href="/workout" className="h-full">
            <CardHead icon={Dumbbell} label="Trénink" />
            {w ? (
              <>
                {w.activeWorkoutId ? (
                  <div className="text-xl font-semibold">Rozpracovaný trénink</div>
                ) : w.today ? (
                  <div>
                    <div className="text-xs text-muted">Dnes · {w.today.programName}</div>
                    <div className="text-xl font-semibold">{w.today.dayName}</div>
                    <div className="text-sm text-muted">{w.today.exerciseCount} cviků</div>
                  </div>
                ) : (
                  <div className="text-xl font-semibold">{w.lastWorkout ? `Naposledy: ${w.lastWorkout.name}` : "Začni první trénink"}</div>
                )}
                <div className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4">
                  <div>
                    <div className="text-xs text-muted">Tento týden</div>
                    <div className="num text-lg font-semibold">{w.weekWorkouts}×</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted">Objem</div>
                    <div className="num text-lg font-semibold">{num(w.weekVolumeKg / 1000, 1)} t</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted">Váha</div>
                    <div className="num text-lg font-semibold">{w.latestWeightKg ? `${num(w.latestWeightKg, 1)} kg` : "–"}</div>
                  </div>
                </div>
                {w.stagnating.length > 0 && (
                  <div className="mt-3 flex items-center gap-2 text-sm text-fg-soft">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span className="truncate">Stagnace: {w.stagnating.map((s) => s.exerciseName).join(", ")}</span>
                  </div>
                )}
              </>
            ) : (
              <div className="text-sm text-muted">Nedostupné</div>
            )}
          </CardLink>
        </StaggerItem>

        {/* Nutrition */}
        <StaggerItem>
          <CardLink href="/nutrition" className="h-full">
            <CardHead icon={Apple} label="Výživa" />
            {n ? (
              n.profileComplete ? (
                <div className="flex items-center gap-5">
                  <Ring value={n.kcal} max={n.kcalTarget} size={104} stroke={9}>
                    <div>
                      <AnimatedNumber value={Math.max(0, n.kcalTarget - n.kcal)} className="text-xl font-semibold" />
                      <div className="text-[10px] uppercase tracking-wider text-muted">zbývá</div>
                    </div>
                  </Ring>
                  <div className="flex-1 space-y-2.5">
                    {[
                      ["Bílkoviny", n.protein, n.proteinTarget],
                      ["Sacharidy", n.carbs, n.carbsTarget],
                      ["Tuky", n.fat, n.fatTarget],
                    ].map(([label, v, max]) => (
                      <div key={label as string}>
                        <div className="mb-1 flex justify-between text-xs">
                          <span className="text-muted">{label}</span>
                          <span className="num">
                            {Math.round(v as number)} / {Math.round(max as number)} g
                          </span>
                        </div>
                        <ProgressBar value={v as number} max={max as number} />
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <div className="text-xl font-semibold">Nastav si profil</div>
                  <div className="text-sm text-muted">Spočítám ti kalorie a makra podle cíle.</div>
                </div>
              )
            ) : (
              <div className="text-sm text-muted">Nedostupné</div>
            )}
          </CardLink>
        </StaggerItem>

        {/* Income */}
        <StaggerItem>
          <CardLink href="/income" className="h-full" data-private>
            <CardHead icon={Wallet} label="Příjmy" />
            {i ? (
              <>
                <div className="text-xs text-muted">Tento měsíc čistého</div>
                <div className="num text-3xl font-semibold tracking-tight">
                  <AnimatedNumber value={i.monthNet} preset="money" />
                </div>
                <div className="mt-1 text-sm">
                  <Delta value={i.monthNet - i.lastMonthNet} suffix=" Kč" /> <span className="text-muted">vs. minulý měsíc</span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4">
                  <div>
                    <div className="text-xs text-muted">Letos čistého</div>
                    <div className="num text-lg font-semibold">{money(i.yearNet)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted">Průměr / měsíc (12 m)</div>
                    <div className="num text-lg font-semibold">{money(i.avgMonthlyNet12m)}</div>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-sm text-muted">Nedostupné</div>
            )}
          </CardLink>
        </StaggerItem>

        {/* Portfolio */}
        <StaggerItem>
          <CardLink href="/portfolio" className="h-full" data-private>
            <CardHead icon={LineChart} label="Portfolio" />
            {p ? (
              <>
                <div className="text-xs text-muted">Hodnota aktiv</div>
                <div className="num text-3xl font-semibold tracking-tight">
                  <AnimatedNumber value={p.totalCzk} preset="money" />
                </div>
                <div className="mt-1 text-sm">
                  <Delta value={p.dayChangeCzk} suffix=" Kč" /> <span className="text-muted">dnes ({p.dayChangePct >= 0 ? "+" : ""}{num(p.dayChangePct, 2)} %)</span>
                </div>
                {p.allocation.length > 0 && (
                  <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-line">
                    {p.allocation.map((a, idx) => (
                      <div key={a.class} style={{ width: `${a.pct}%`, opacity: 1 - idx * 0.16 }} className="h-full bg-fg first:rounded-l-full" title={a.class} />
                    ))}
                  </div>
                )}
                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4">
                  <div>
                    <div className="text-xs text-muted">Čisté jmění</div>
                    <div className="num text-lg font-semibold">{money(p.netWorthCzk)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted">Nerealizovaný zisk</div>
                    <div className="num text-lg font-semibold">
                      <Delta value={p.unrealizedCzk} suffix=" Kč" />
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-sm text-muted">Nedostupné</div>
            )}
          </CardLink>
        </StaggerItem>
      </Stagger>

      <Link href="/goals" className="mt-3 block rounded-2xl border border-line p-4 transition-colors hover:bg-card md:p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-muted">
            <Target className="h-4 w-4" strokeWidth={1.75} /> Cíle
          </div>
          <ArrowUpRight className="h-4 w-4 text-subtle" />
        </div>
        {openGoals.length === 0 ? (
          <div className="text-sm text-muted">Nastav si cíl – bench 100 kg, váha 78 kg, 500 000 Kč z Matchi… Progres se počítá sám.</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {openGoals.map((goal) => (
              <div key={goal.id} data-private={goal.unit === "CZK" || undefined}>
                <div className="mb-1 flex justify-between gap-3 text-sm">
                  <span className="truncate">{goal.title}</span>
                  <span className="num shrink-0 text-muted">{Math.round(goal.progress * 100)} %</span>
                </div>
                <ProgressBar value={goal.progress} max={1} />
              </div>
            ))}
          </div>
        )}
      </Link>

      <Link
        href="/ai"
        className="mt-3 flex items-center gap-3 rounded-2xl border border-line-strong p-4 transition-colors hover:bg-card md:p-5"
      >
        <Sparkles className="h-5 w-5" strokeWidth={1.75} />
        <div className="flex-1">
          <div className="font-medium">AI asistent</div>
          <div className="text-sm text-muted">Zeptej se na cokoliv z tvých dat, nebo nech upravit trénink.</div>
        </div>
        <ArrowUpRight className="h-4 w-4 text-subtle" />
      </Link>
    </div>
  );
}

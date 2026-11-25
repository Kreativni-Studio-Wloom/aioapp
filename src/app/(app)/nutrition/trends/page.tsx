import Link from "next/link";
import { Card, PageHeader, SectionTitle, Stat } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { addDays, isoDate, num } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getRange, getTargets } from "@/lib/nutrition/service";
import { TrendsChart } from "./trends-chart";

const RANGES = [7, 30, 90] as const;

export default async function TrendsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const days = RANGES.find((r) => String(r) === sp.r) ?? 7;
  const today = isoDate();
  const from = addDays(today, -(days - 1));
  const [range, targets] = await Promise.all([getRange(user.id, from, today), getTargets(user.id)]);

  // stats over logged days (today excluded unless it is the only one, since it is usually incomplete)
  const logged = range.filter((d) => d.entries > 0 && d.date !== today);
  const base = logged.length ? logged : range.filter((d) => d.entries > 0);
  const avg = (k: "kcal" | "protein" | "carbs" | "fat" | "fiber") => (base.length ? base.reduce((s, d) => s + d[k], 0) / base.length : 0);
  const onTarget = base.filter((d) => Math.abs(d.kcal - targets.kcal) <= targets.kcal * 0.1).length;
  const proteinHit = base.filter((d) => d.protein >= targets.protein * 0.9).length;
  const weights = range.filter((d) => d.weightKg != null);
  const weightDelta = weights.length >= 2 ? weights[weights.length - 1].weightKg! - weights[0].weightKg! : null;

  return (
    <>
      <PageHeader title="Trendy" subtitle="Příjem vs. cíl a vývoj váhy" back="/nutrition" />
      <div className="mb-4 inline-flex rounded-xl bg-card p-1">
        {RANGES.map((r) => (
          <Link
            key={r}
            href={`/nutrition/trends?r=${r}`}
            scroll={false}
            className={cn("rounded-lg px-3 py-1.5 text-sm font-medium transition-colors", r === days ? "bg-fg text-inverse" : "text-muted hover:text-fg")}
          >
            {r} dní
          </Link>
        ))}
      </div>

      <Card className="px-2 md:px-4">
        <TrendsChart data={range} target={targets.kcal} />
      </Card>

      <SectionTitle className="mt-6">Průměr ({base.length} {base.length === 1 ? "den" : base.length < 5 ? "dny" : "dní"} se záznamem)</SectionTitle>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <Stat label="Energie" value={`${num(avg("kcal"))} kcal`} sub={`cíl ${num(targets.kcal)}`} />
        </Card>
        <Card>
          <Stat label="Bílkoviny" value={`${num(avg("protein"))} g`} sub={`cíl ${num(targets.protein)} g`} />
        </Card>
        <Card>
          <Stat label="Sacharidy" value={`${num(avg("carbs"))} g`} sub={`cíl ${num(targets.carbs)} g`} />
        </Card>
        <Card>
          <Stat label="Tuky" value={`${num(avg("fat"))} g`} sub={`cíl ${num(targets.fat)} g`} />
        </Card>
        <Card>
          <Stat label="Dny v cíli (±10 %)" value={`${onTarget} / ${base.length}`} />
        </Card>
        <Card>
          <Stat label="Dny s bílkovinami" value={`${proteinHit} / ${base.length}`} sub="≥ 90 % cíle" />
        </Card>
        <Card>
          <Stat label="Vláknina" value={`${num(avg("fiber"), 1)} g`} />
        </Card>
        <Card>
          <Stat
            label="Váha"
            value={weights.length ? `${num(weights[weights.length - 1].weightKg, 1)} kg` : "–"}
            sub={weightDelta != null ? `${weightDelta > 0 ? "+" : weightDelta < 0 ? "−" : ""}${num(Math.abs(weightDelta), 1)} kg za období` : "málo vážení"}
          />
        </Card>
      </div>
    </>
  );
}

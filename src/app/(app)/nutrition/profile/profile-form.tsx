"use client";

import { useState, useTransition } from "react";
import { Button, Card, Field, Input, Row, SectionTitle, Select } from "@/components/ui";
import { Segmented, Spinner } from "@/components/ui/client";
import { dateLabel, num } from "@/lib/format";
import { cn, toNum } from "@/lib/utils";
import { ACTIVITY, GOALS, computeTargets, type ActivityLevel, type Goal, type Sex, type TargetsDetail } from "@/lib/nutrition/calc";
import type { AdaptiveInfo, NutritionProfile } from "@/lib/nutrition/service";
import { adoptAdaptiveAction, saveProfileAction, setKcalOverrideAction } from "../actions";

const s = (v: number | null | undefined) => (v == null ? "" : String(v).replace(".", ","));

export function ProfileForm({
  profile,
  detail: saved,
  latestWeight,
  adaptive,
  adaptiveKcal,
}: {
  profile: NutritionProfile;
  detail: TargetsDetail;
  latestWeight: { weightKg: number; date: string } | null;
  adaptive: AdaptiveInfo;
  adaptiveKcal: number | null;
}) {
  const [sex, setSex] = useState<Sex | "">(profile.sex ?? "");
  const [birthDate, setBirthDate] = useState(profile.birthDate ?? "");
  const [height, setHeight] = useState(s(profile.heightCm));
  const [weight, setWeight] = useState(s(latestWeight?.weightKg));
  const [activity, setActivity] = useState<ActivityLevel>(profile.activityLevel ?? "moderate");
  const [goal, setGoal] = useState<Goal>(profile.goal ?? "maintain");
  const [rate, setRate] = useState(s(profile.rateKgPerWeek ?? 0.5));
  const [proteinPerKg, setProteinPerKg] = useState(s(profile.proteinPerKg ?? 2));
  const [fatPct, setFatPct] = useState(s(Math.round((profile.fatPct ?? 0.25) * 100)));
  const [override, setOverride] = useState(s(profile.kcalOverride));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const input = {
    sex: sex || null,
    birthDate: birthDate || null,
    heightCm: toNum(height),
    activityLevel: activity,
    goal,
    rateKgPerWeek: toNum(rate) ?? 0,
    proteinPerKg: toNum(proteinPerKg) ?? 2,
    fatPct: (toNum(fatPct) ?? 25) / 100,
    kcalOverride: toNum(override) ? Math.round(toNum(override)!) : null,
  };
  const d = computeTargets(input, toNum(weight));
  const factor = ACTIVITY.find((a) => a.value === activity)?.factor ?? 1.55;

  const save = () =>
    startTransition(async () => {
      setMsg(null);
      const res = await saveProfileAction({ ...input, weightKg: toNum(weight) });
      setMsg(res.ok ? { ok: true, text: "Uloženo" } : { ok: false, text: res.error });
    });

  const adopt = () =>
    startTransition(async () => {
      const res = await adoptAdaptiveAction();
      if (res.ok && res.data) setOverride(String(res.data));
      setMsg(res.ok ? { ok: true, text: "Adaptivní cíl nastaven" } : { ok: false, text: res.error });
    });

  const clearOverride = () =>
    startTransition(async () => {
      const res = await setKcalOverrideAction(null);
      if (res.ok) setOverride("");
      setMsg(res.ok ? { ok: true, text: "Vlastní cíl zrušen" } : { ok: false, text: res.error });
    });

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_1fr] md:items-start">
      <div className="flex flex-col gap-4">
        <SectionTitle>Tělo</SectionTitle>
        <Segmented
          value={sex || "none"}
          onChange={(v) => setSex(v === "none" ? "" : (v as Sex))}
          options={[
            { value: "male", label: "Muž" },
            { value: "female", label: "Žena" },
          ]}
          layoutId="sex"
          className="w-full"
        />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Datum narození" hint={d.age != null ? `${d.age} let` : undefined}>
            <Input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} max={new Date().toISOString().slice(0, 10)} />
          </Field>
          <Field label="Výška (cm)">
            <Input inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} />
          </Field>
        </div>
        <Field
          label="Aktuální váha (kg)"
          hint={latestWeight ? `Poslední záznam ${dateLabel(latestWeight.date)} · změna se uloží k dnešku` : "Uloží se jako dnešní vážení"}
        >
          <Input inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} />
        </Field>
        <Field label="Aktivita" hint={ACTIVITY.find((a) => a.value === activity)?.hint}>
          <Select value={activity} onChange={(e) => setActivity(e.target.value as ActivityLevel)}>
            {ACTIVITY.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label} (×{num(a.factor, 3)})
              </option>
            ))}
          </Select>
        </Field>

        <SectionTitle className="mt-4">Cíl</SectionTitle>
        <Segmented value={goal} onChange={setGoal} options={GOALS} layoutId="goal" className="w-full" />
        {goal !== "maintain" && (
          <Field label={`Tempo (kg / týden)`} hint={`${goal === "lose" ? "Doporučeno 0,25–0,75" : "Doporučeno 0,1–0,4"} kg týdně`}>
            <Input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Bílkoviny (g / kg)" hint="1,6–2,2 pro trénující">
            <Input inputMode="decimal" value={proteinPerKg} onChange={(e) => setProteinPerKg(e.target.value)} />
          </Field>
          <Field label="Tuky (% kcal)" hint="obvykle 20–35 %">
            <Input inputMode="decimal" value={fatPct} onChange={(e) => setFatPct(e.target.value)} />
          </Field>
        </div>
        <Field label="Vlastní cíl kcal" hint="Prázdné = vypočítaný cíl">
          <Input inputMode="numeric" value={override} onChange={(e) => setOverride(e.target.value)} placeholder={String(d.formulaKcal)} />
        </Field>
        <div className="flex items-center gap-3">
          <Button size="lg" onClick={save} disabled={pending} className="flex-1">
            {pending && <Spinner />} Uložit
          </Button>
        </div>
        {msg && <p className={cn("text-sm", msg.ok ? "text-muted" : "text-neg")}>{msg.text}</p>}
      </div>

      <div className="flex flex-col gap-3 md:sticky md:top-10">
        <SectionTitle>Výsledek</SectionTitle>
        <Card>
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-xs text-muted">Denní cíl</div>
              <div className="num text-4xl font-semibold tracking-tight">
                {num(d.kcal)} <span className="text-base font-normal text-muted">kcal</span>
              </div>
            </div>
            {d.overridden && <span className="text-xs text-muted">vlastní hodnota</span>}
          </div>
          <div className="num mt-4 grid grid-cols-3 gap-2 text-center">
            <MacroBox label="Bílkoviny" g={d.protein} kcal={d.protein * 4} total={d.kcal} />
            <MacroBox label="Sacharidy" g={d.carbs} kcal={d.carbs * 4} total={d.kcal} />
            <MacroBox label="Tuky" g={d.fat} kcal={d.fat * 9} total={d.kcal} />
          </div>
        </Card>

        <Card>
          <div className="mb-1 text-sm font-medium">Jak to počítáme</div>
          {!d.profileComplete ? (
            <p className="text-sm text-muted">Doplň pohlaví, datum narození, výšku a váhu. Do té doby platí výchozí cíl 2000 kcal.</p>
          ) : (
            <div className="num text-sm">
              <Row>
                <span className="text-muted">
                  BMR (Mifflin-St Jeor)
                  <span className="block text-xs text-subtle">
                    10×{num(toNum(weight), 1)} + 6,25×{num(toNum(height), 1)} − 5×{d.age} {sex === "male" ? "+ 5" : "− 161"}
                  </span>
                </span>
                <span>{num(d.bmr)} kcal</span>
              </Row>
              <Row>
                <span className="text-muted">
                  TDEE
                  <span className="block text-xs text-subtle">BMR × {num(factor, 3)}</span>
                </span>
                <span>{num(d.tdee)} kcal</span>
              </Row>
              <Row>
                <span className="text-muted">
                  {goal === "lose" ? "Deficit" : goal === "gain" ? "Přebytek" : "Úprava"}
                  <span className="block text-xs text-subtle">
                    {goal === "maintain" ? "udržování" : `${num(toNum(rate), 2)} kg × 7700 / 7`}
                    {d.clamped && ` = ${num(Math.abs(d.rawDelta))}, omezeno na bezpečnou mez`}
                  </span>
                </span>
                <span>
                  {d.delta > 0 ? "+" : d.delta < 0 ? "−" : ""}
                  {num(Math.abs(d.delta))} kcal
                </span>
              </Row>
              <Row>
                <span className="font-medium">Vypočtený cíl</span>
                <span className="font-medium">{num(d.formulaKcal)} kcal</span>
              </Row>
              <Row>
                <span className="text-muted">
                  Makra
                  <span className="block text-xs text-subtle">
                    B {num(toNum(proteinPerKg), 1)} g/kg · T {num(toNum(fatPct))} % · S zbytek
                  </span>
                </span>
                <span className="text-right text-xs text-muted">
                  {num(d.protein)} × 4 + {num(d.fat)} × 9 + {num(d.carbs)} × 4
                </span>
              </Row>
            </div>
          )}
        </Card>

        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium">Adaptivní TDEE</div>
              <p className="mt-0.5 text-xs text-muted">Z reálného příjmu a vývoje váhy za posledních 28 dní.</p>
            </div>
            {adaptive.tdee != null && (
              <div className="num text-right">
                <div className="text-xl font-semibold">{num(adaptive.tdee)}</div>
                <div className="text-xs text-muted">vs. vzorec {num(saved.tdee)}</div>
              </div>
            )}
          </div>
          {adaptive.tdee != null ? (
            <>
              <div className="num mt-3 text-sm">
                <Row>
                  <span className="text-muted">Průměrný příjem ({adaptive.foodDays} kompletních dní)</span>
                  <span>{num(adaptive.avgIntake)} kcal</span>
                </Row>
                <Row>
                  <span className="text-muted">Trend váhy ({adaptive.weightDays} vážení)</span>
                  <span>
                    {(adaptive.trendKgPerWeek ?? 0) > 0 ? "+" : ""}
                    {num(adaptive.trendKgPerWeek, 2)} kg/týden
                  </span>
                </Row>
              </div>
              {adaptiveKcal != null && (
                <Button variant="secondary" onClick={adopt} disabled={pending} className="mt-3 w-full bg-bg-elev">
                  Použít · cíl {num(adaptiveKcal)} kcal
                </Button>
              )}
            </>
          ) : (
            <p className="num mt-3 text-sm text-muted">
              Potřebujeme alespoň {adaptive.requiredDays} kompletně zapsaných dní (≥ 2 jídla nebo ≥ 50 % cíle) a {adaptive.requiredDays} vážení. Zatím:{" "}
              {adaptive.foodDays} dní jídla, {adaptive.weightDays} vážení.
            </p>
          )}
          {saved.overridden && (
            <Button variant="ghost" size="sm" onClick={clearOverride} disabled={pending} className="mt-2">
              Zrušit vlastní cíl ({num(saved.kcal)} kcal)
            </Button>
          )}
        </Card>
      </div>
    </div>
  );
}

function MacroBox({ label, g, kcal, total }: { label: string; g: number; kcal: number; total: number }) {
  return (
    <div className="rounded-xl bg-bg-elev px-2 py-2.5">
      <div className="text-lg font-semibold">{num(g)} g</div>
      <div className="text-[11px] text-muted">
        {label} · {total > 0 ? Math.round((kcal / total) * 100) : 0} %
      </div>
    </div>
  );
}

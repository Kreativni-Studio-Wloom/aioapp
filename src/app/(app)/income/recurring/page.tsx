import { Card, Empty, SectionTitle, Stat } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { money } from "@/lib/format";
import { generateRecurring, listRecurringRules, listSources } from "@/lib/income/service";
import { IncomeHeader, SignedMoney } from "../_components/bits";
import { RuleButton, RuleRow } from "../_components/forms";

export default async function RecurringPage() {
  const user = await requireUser();
  await generateRecurring(user.id);
  const [rules, sources] = await Promise.all([listRecurringRules(user.id), listSources(user.id)]);
  const opts = sources.map((s) => ({ id: s.id, name: s.name }));
  const active = rules.filter((r) => r.active);
  // nominal monthly value (in the rule's currency; CZK rules only for the sum to stay exact)
  const czk = active.filter((r) => r.currency === "CZK");
  const monthlyIncome = czk.filter((r) => r.kind === "income").reduce((s, r) => s + r.amount, 0);
  const monthlyExpense = czk.filter((r) => r.kind === "expense").reduce((s, r) => s + r.amount, 0);

  return (
    <>
      <IncomeHeader title="Opakované" subtitle="Nájmy, mzdy, pravidelné platby – zapisují se samy" action={<RuleButton sources={opts} />} />
      {rules.length === 0 ? (
        <Empty title="Žádná opakovaná pravidla" action={<RuleButton sources={opts} size="md" />}>
          Např. nájem 18 000 Kč každého 5. v měsíci. Transakce se vytvoří automaticky, jakmile nastane den splatnosti.
        </Empty>
      ) : (
        <>
          <Card className="grid grid-cols-3 gap-3">
            <Stat label="Měsíčně příjmy" value={money(monthlyIncome)} />
            <Stat label="Měsíčně výdaje" value={money(monthlyExpense)} />
            <Stat label="Čistý" value={<SignedMoney value={monthlyIncome - monthlyExpense} />} sub={czk.length < active.length ? "jen pravidla v CZK" : undefined} />
          </Card>
          <SectionTitle className="mt-8">Pravidla</SectionTitle>
          <Card className="py-1 md:py-1">
            {rules.map((r) => (
              <RuleRow key={r.id} rule={r} sources={opts} />
            ))}
          </Card>
        </>
      )}
    </>
  );
}

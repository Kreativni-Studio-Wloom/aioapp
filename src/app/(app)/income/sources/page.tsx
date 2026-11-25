import { Badge, CardLink, Empty, SectionTitle } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { dateLabel, money, pct } from "@/lib/format";
import { SOURCE_TYPE_LABEL } from "@/lib/income/constants";
import { listSources, type SourceWithTotals } from "@/lib/income/service";
import { IncomeHeader, SignedMoney } from "../_components/bits";
import { SourceButton } from "../_components/forms";

function SourceCard({ s }: { s: SourceWithTotals }) {
  return (
    <CardLink href={`/income/sources/${s.id}`} className={s.archived ? "opacity-60" : undefined}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-semibold">{s.name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge>{SOURCE_TYPE_LABEL[s.type]}</Badge>
            {s.currency !== "CZK" && <Badge>{s.currency}</Badge>}
            {s.archived && <Badge>Archiv</Badge>}
          </div>
        </div>
        <div className="text-right">
          <SignedMoney value={s.net} className="text-lg font-semibold" />
          <div className="text-xs text-muted">čistý celkem</div>
        </div>
      </div>
      <div className="num mt-4 flex justify-between gap-3 text-xs text-muted">
        <span>
          Příjmy {money(s.income)} · Výdaje {money(s.expense)}
          {s.margin != null && s.expense > 0 && ` · ${pct(s.margin, 0)}`}
        </span>
        <span className="shrink-0">{s.lastDate ? dateLabel(s.lastDate) : "bez záznamů"}</span>
      </div>
    </CardLink>
  );
}

export default async function SourcesPage() {
  const user = await requireUser();
  const sources = await listSources(user.id, { includeArchived: true });
  const active = sources.filter((s) => !s.archived);
  const archived = sources.filter((s) => s.archived);

  return (
    <>
      <IncomeHeader title="Zdroje" subtitle="Podnikání, pronájmy, investice, práce" action={<SourceButton />} />
      {active.length === 0 ? (
        <Empty title="Žádné zdroje" action={<SourceButton variant="primary" size="md" />}>
          Zdroj je cokoliv, co ti vydělává – např. matcha stánek, pronájem bytu nebo zaměstnání.
        </Empty>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {active.map((s) => (
            <SourceCard key={s.id} s={s} />
          ))}
        </div>
      )}
      {archived.length > 0 && (
        <>
          <SectionTitle className="mt-8">Archiv</SectionTitle>
          <div className="grid gap-3 md:grid-cols-2">
            {archived.map((s) => (
              <SourceCard key={s.id} s={s} />
            ))}
          </div>
        </>
      )}
    </>
  );
}

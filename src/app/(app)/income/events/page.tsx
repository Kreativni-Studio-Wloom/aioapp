import type { ReactNode } from "react";
import Link from "next/link";
import { Card, Empty, SectionTitle, Stat } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { isoDate, money, pct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getEventAnalytics, listEvents, listSources } from "@/lib/income/service";
import { EventRow, IncomeHeader, SignedMoney } from "../_components/bits";
import { EventButton } from "../_components/forms";

type Props = { searchParams: Promise<{ source?: string; y?: string }> };

function Chip({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "flex h-9 items-center rounded-full border px-3.5 text-sm transition-colors",
        active ? "border-fg bg-fg text-inverse" : "border-line text-fg-soft hover:border-line-strong hover:text-fg",
      )}
    >
      {children}
    </Link>
  );
}

export default async function EventsPage({ searchParams }: Props) {
  const user = await requireUser();
  const sp = await searchParams;
  const sources = (await listSources(user.id, { includeArchived: true })).filter((s) => s.type === "business");
  const sourceId = sources.some((s) => s.id === sp.source) ? sp.source : undefined;
  const year = sp.y && /^\d{4}$/.test(sp.y) ? Number(sp.y) : undefined;

  const range = year ? { from: `${year}-01-01`, to: `${year}-12-31` } : {};
  const [events, an, allEvents] = await Promise.all([
    listEvents(user.id, sourceId, range),
    getEventAnalytics(user.id, { sourceId, year }),
    year ? listEvents(user.id, sourceId) : Promise.resolve(null),
  ]);
  const years = [...new Set((allEvents ?? events).map((e) => Number(e.startDate.slice(0, 4))))].sort((a, b) => b - a);
  const today = isoDate();
  const upcoming = events.filter((e) => e.startDate > today).reverse();
  const past = events.filter((e) => e.startDate <= today);
  const activeOpts = sources.filter((s) => !s.archived).map((s) => ({ id: s.id, name: s.name }));
  const href = (p: { source?: string; y?: number }) => {
    const q = new URLSearchParams();
    const src = "source" in p ? p.source : sourceId;
    const yy = "y" in p ? p.y : year;
    if (src) q.set("source", src);
    if (yy) q.set("y", String(yy));
    const s = q.toString();
    return `/income/events${s ? `?${s}` : ""}`;
  };

  return (
    <>
      <IncomeHeader title="Akce" subtitle="Festivaly, trhy a další prodejní akce" action={<EventButton sources={activeOpts} sourceId={sourceId} />} />

      {(sources.length > 1 || years.length > 1) && (
        <div className="-mx-4 mb-5 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0">
          <div className="flex w-max gap-1.5">
            {sources.length > 1 && (
              <>
                <Chip href={href({ source: undefined })} active={!sourceId}>
                  Všechny zdroje
                </Chip>
                {sources.map((s) => (
                  <Chip key={s.id} href={href({ source: s.id })} active={sourceId === s.id}>
                    {s.name}
                  </Chip>
                ))}
                <span className="mx-1 w-px bg-line" />
              </>
            )}
            <Chip href={href({ y: undefined })} active={!year}>
              Celkem
            </Chip>
            {years.map((y) => (
              <Chip key={y} href={href({ y })} active={year === y}>
                {y}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {events.length === 0 ? (
        <Empty title="Žádné akce" action={<EventButton sources={activeOpts} sourceId={sourceId} size="md" />}>
          {sources.length
            ? "Založ akci a zapisuj k ní tržby i náklady (stánek, suroviny, doprava…). Uvidíš zisk na akci i na den."
            : "Akce patří ke zdroji typu Podnikání – nejdřív si ho založ v sekci Zdroje."}
        </Empty>
      ) : (
        <>
          <Card className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Stat label="Akcí" value={an.count} sub={`čistý celkem ${money(an.totalNet)}`} />
            <Stat label="Průměr na akci" value={<SignedMoney value={an.avgNet} />} />
            <Stat label="Zisk na den" value={<SignedMoney value={an.avgProfitPerDay} />} sub="průměr přes všechny dny" />
            <Stat label="Průměrná marže" value={an.avgMargin != null ? pct(an.avgMargin, 0) : "–"} />
          </Card>

          {an.count > 1 && (
            <div className="mt-8 grid gap-x-6 md:grid-cols-2">
              <div>
                <SectionTitle>Nejziskovější</SectionTitle>
                <Card className="py-2 md:py-2">
                  {an.best.map((e) => (
                    <EventRow key={e.id} e={e} showSource={!sourceId && sources.length > 1} />
                  ))}
                </Card>
              </div>
              <div>
                <SectionTitle>Nejlepší zisk na den</SectionTitle>
                <Card className="py-2 md:py-2">
                  {an.byNetPerDay.map((e) => (
                    <EventRow key={e.id} e={e} metric="perDay" />
                  ))}
                </Card>
                {an.worst.length > 0 && (
                  <>
                    <SectionTitle>Nejslabší</SectionTitle>
                    <Card className="py-2 md:py-2">
                      {an.worst.map((e) => (
                        <EventRow key={e.id} e={e} />
                      ))}
                    </Card>
                  </>
                )}
              </div>
            </div>
          )}

          {upcoming.length > 0 && (
            <>
              <SectionTitle>Nadcházející</SectionTitle>
              <Card className="py-2 md:py-2">
                {upcoming.map((e) => (
                  <EventRow key={e.id} e={e} showSource={!sourceId && sources.length > 1} />
                ))}
              </Card>
            </>
          )}

          <SectionTitle>Proběhlé ({past.length})</SectionTitle>
          <Card className="py-2 md:py-2">
            {past.length ? (
              past.map((e) => <EventRow key={e.id} e={e} showSource={!sourceId && sources.length > 1} />)
            ) : (
              <p className="py-6 text-center text-sm text-muted">Zatím žádná proběhlá akce</p>
            )}
          </Card>
        </>
      )}
    </>
  );
}

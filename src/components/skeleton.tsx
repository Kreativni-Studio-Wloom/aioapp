import { cn } from "@/lib/utils";

/**
 * Loading placeholders shaped like the content they stand in for (instead of a spinner).
 * `Bone` on the page background uses the card colour; inside a `SkCard` use `tone="inset"`.
 */
export function Bone({ className, tone = "card" }: { className?: string; tone?: "card" | "inset" }) {
  return <div aria-hidden className={cn("rounded-md", tone === "inset" ? "bg-line" : "bg-card", className)} />;
}

export function SkCard({ className, children }: { className?: string; children?: React.ReactNode }) {
  return <div className={cn("rounded-2xl bg-card p-4 md:p-5", className)}>{children}</div>;
}

/** Wrapper: pulses and tells assistive tech that content is loading. */
export function Skeleton({ className, children, label = "Načítám…" }: { className?: string; children: React.ReactNode; label?: string }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className={cn("animate-pulse", className)}>
      {children}
    </div>
  );
}

export function SkHeader({ subtitle = true, action = false }: { subtitle?: boolean; action?: boolean }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <Bone className="h-8 w-44 rounded-lg" />
        {subtitle && <Bone className="mt-2 h-4 w-60" />}
      </div>
      {action && <Bone className="h-10 w-28 rounded-xl" />}
    </div>
  );
}

/** A card with a few lines of text. */
export function SkTextCard({ lines = 2, className }: { lines?: number; className?: string }) {
  return (
    <SkCard className={className}>
      <Bone tone="inset" className="h-4 w-1/3" />
      {Array.from({ length: lines }, (_, i) => (
        <Bone key={i} tone="inset" className={cn("mt-3 h-3", i % 2 ? "w-1/2" : "w-3/4")} />
      ))}
    </SkCard>
  );
}

/** A row of small stat cards (label + number). */
export function SkStats({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-3", count >= 4 && "md:grid-cols-4", count === 3 && "md:grid-cols-3", className)}>
      {Array.from({ length: count }, (_, i) => (
        <SkCard key={i}>
          <Bone tone="inset" className="h-3 w-16" />
          <Bone tone="inset" className="mt-3 h-6 w-24" />
        </SkCard>
      ))}
    </div>
  );
}

/** List rows (e.g. search results, transactions) – without a card around them. */
export function SkRows({ count = 4, className, tone }: { count?: number; className?: string; tone?: "card" | "inset" }) {
  return (
    <div className={className}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex min-h-12 items-center justify-between gap-3 border-b border-line py-3 last:border-0">
          <div className="min-w-0 flex-1">
            <Bone tone={tone} className={cn("h-4", i % 2 ? "w-1/2" : "w-2/3")} />
            <Bone tone={tone} className="mt-2 h-3 w-1/3" />
          </div>
          <Bone tone={tone} className="h-4 w-12" />
        </div>
      ))}
    </div>
  );
}

export function SkSectionTitle() {
  return <Bone className="mb-3 mt-8 h-5 w-32" />;
}

/** Placeholder rows for search results / pickers inside sheets (whose background is close to the card colour). */
export function SearchSkeleton({ count = 3, label = "Hledám…" }: { count?: number; label?: string }) {
  return (
    <Skeleton label={label}>
      <SkRows count={count} tone="inset" />
    </Skeleton>
  );
}

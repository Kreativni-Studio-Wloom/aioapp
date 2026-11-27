import { Bone, SkCard, SkHeader, SkSectionTitle, SkStats, SkTextCard, Skeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <Skeleton>
      <SkHeader action />
      <SkCard className="p-5 md:p-6">
        <Bone tone="inset" className="h-3 w-24" />
        <Bone tone="inset" className="mt-3 h-7 w-1/2" />
        <Bone tone="inset" className="mt-2 h-4 w-1/3" />
        <Bone tone="inset" className="mt-6 h-12 w-full rounded-xl" />
      </SkCard>
      <SkSectionTitle />
      <SkStats count={4} />
      <SkSectionTitle />
      <div className="grid gap-3 md:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <SkTextCard key={i} lines={1} />
        ))}
      </div>
    </Skeleton>
  );
}

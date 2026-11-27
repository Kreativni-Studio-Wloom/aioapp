import { Bone, SkCard, SkHeader, SkRows, SkSectionTitle, SkStats, Skeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <Skeleton>
      <SkHeader action />
      <SkCard className="mb-3">
        <Bone tone="inset" className="h-3 w-24" />
        <Bone tone="inset" className="mt-3 h-9 w-40" />
        <div className="mt-5 grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i}>
              <Bone tone="inset" className="h-3 w-14" />
              <Bone tone="inset" className="mt-2 h-5 w-20" />
            </div>
          ))}
        </div>
      </SkCard>
      <SkStats count={3} />
      <SkSectionTitle />
      <SkRows count={5} />
    </Skeleton>
  );
}

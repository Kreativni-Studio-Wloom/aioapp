import { Bone, SkCard, SkHeader, SkRows, SkSectionTitle, SkStats, Skeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <Skeleton>
      <SkHeader action />
      <SkCard className="p-5 md:p-6">
        <Bone tone="inset" className="h-3 w-28" />
        <Bone tone="inset" className="mt-3 h-10 w-48" />
        <Bone tone="inset" className="mt-2 h-4 w-32" />
        <Bone tone="inset" className="mt-6 h-36 w-full rounded-xl" />
      </SkCard>
      <SkStats count={4} className="mt-3" />
      <SkSectionTitle />
      <SkRows count={5} />
    </Skeleton>
  );
}

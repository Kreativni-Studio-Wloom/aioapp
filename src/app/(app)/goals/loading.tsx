import { Bone, SkCard, SkHeader, Skeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <Skeleton>
      <SkHeader action />
      <div className="grid gap-3 md:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <SkCard key={i}>
            <Bone tone="inset" className="h-4 w-1/2" />
            <Bone tone="inset" className="mt-2 h-3 w-1/3" />
            <Bone tone="inset" className="mt-5 h-2 w-full rounded-full" />
            <div className="mt-2 flex justify-between">
              <Bone tone="inset" className="h-3 w-16" />
              <Bone tone="inset" className="h-3 w-10" />
            </div>
          </SkCard>
        ))}
      </div>
    </Skeleton>
  );
}

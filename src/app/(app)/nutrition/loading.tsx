import { Bone, SkCard, Skeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <Skeleton>
      <div className="mb-5 flex items-center justify-between gap-3">
        <Bone className="h-8 w-32 rounded-lg" />
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <Bone key={i} className="h-10 w-10 rounded-xl" />
          ))}
        </div>
      </div>
      <div className="mb-4 flex items-center justify-between">
        <Bone className="h-11 w-11 rounded-xl" />
        <Bone className="h-5 w-24" />
        <Bone className="h-11 w-11 rounded-xl" />
      </div>
      <SkCard className="flex items-center gap-5 p-5">
        <div className="h-28 w-28 shrink-0 rounded-full bg-line" />
        <div className="flex-1 space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i}>
              <Bone tone="inset" className="h-3 w-20" />
              <Bone tone="inset" className="mt-1.5 h-2 w-full rounded-full" />
            </div>
          ))}
        </div>
      </SkCard>
      <div className="mt-6 space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <SkCard key={i} className="flex items-center justify-between">
            <Bone tone="inset" className="h-4 w-24" />
            <Bone tone="inset" className="h-4 w-16" />
          </SkCard>
        ))}
      </div>
    </Skeleton>
  );
}

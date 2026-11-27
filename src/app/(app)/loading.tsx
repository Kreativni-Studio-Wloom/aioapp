import { Bone, SkCard, Skeleton } from "@/components/skeleton";

/** Dashboard placeholder – also shown right after sign-in while the summaries load. */
export default function Loading() {
  return (
    <Skeleton>
      <div className="mb-6">
        <Bone className="h-4 w-32" />
        <Bone className="mt-2 h-8 w-56 rounded-lg" />
      </div>
      <div className="mb-6 flex gap-2 overflow-hidden">
        {[0, 1, 2, 3].map((i) => (
          <Bone key={i} className="h-10 w-28 shrink-0 rounded-full" />
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <SkCard key={i}>
            <Bone tone="inset" className="h-4 w-24" />
            <Bone tone="inset" className="mt-5 h-6 w-2/3" />
            <div className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4">
              {[0, 1, 2].map((j) => (
                <div key={j}>
                  <Bone tone="inset" className="h-3 w-14" />
                  <Bone tone="inset" className="mt-2 h-5 w-12" />
                </div>
              ))}
            </div>
          </SkCard>
        ))}
      </div>
    </Skeleton>
  );
}

import { Bone, Skeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <Skeleton className="md:grid md:grid-cols-[220px_1fr] md:gap-8">
      <div className="hidden space-y-2 md:block">
        {[0, 1, 2, 3, 4].map((i) => (
          <Bone key={i} className="h-9 w-full rounded-xl" />
        ))}
      </div>
      <div className="flex min-h-[60dvh] flex-col">
        <div className="flex-1 space-y-4">
          <Bone className="ml-auto h-10 w-2/3 rounded-2xl" />
          <Bone className="h-20 w-5/6 rounded-2xl" />
          <Bone className="ml-auto h-10 w-1/2 rounded-2xl" />
        </div>
        <Bone className="mt-6 h-12 w-full rounded-2xl" />
      </div>
    </Skeleton>
  );
}

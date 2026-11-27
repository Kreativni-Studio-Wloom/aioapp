"use client";

import dynamic from "next/dynamic";
import { Bone, SkCard, Skeleton } from "@/components/skeleton";
import type { ExerciseDTO, SessionData } from "@/lib/workout/service";

// Client-only: the session reads localStorage (offline queue, rest timer) on first render.
const Session = dynamic(() => import("./session").then((m) => m.Session), {
  ssr: false,
  loading: () => <SessionSkeleton />,
});

export function SessionLoader(props: { data: SessionData; exercises: ExerciseDTO[] }) {
  return <Session {...props} />;
}

function SessionSkeleton() {
  return (
    <Skeleton label="Načítám trénink…">
      <div className="mb-5">
        <Bone className="h-4 w-28" />
        <Bone className="mt-2 h-8 w-52 rounded-lg" />
      </div>
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <SkCard key={i}>
            <Bone tone="inset" className="h-5 w-1/2" />
            <Bone tone="inset" className="mt-2 h-3 w-1/3" />
            <div className="mt-4 space-y-2">
              {[0, 1, 2].map((j) => (
                <Bone key={j} tone="inset" className="h-11 w-full rounded-xl" />
              ))}
            </div>
          </SkCard>
        ))}
      </div>
    </Skeleton>
  );
}

"use client";

import dynamic from "next/dynamic";
import { Spinner } from "@/components/ui/client";
import type { ExerciseDTO, SessionData } from "@/lib/workout/service";

// Client-only: the session reads localStorage (offline queue, rest timer) on first render.
const Session = dynamic(() => import("./session").then((m) => m.Session), {
  ssr: false,
  loading: () => (
    <div className="grid min-h-[60dvh] place-items-center text-muted">
      <Spinner className="h-6 w-6" />
    </div>
  ),
});

export function SessionLoader(props: { data: SessionData; exercises: ExerciseDTO[] }) {
  return <Session {...props} />;
}

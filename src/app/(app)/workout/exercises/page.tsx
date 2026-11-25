import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { listExercises } from "@/lib/workout/service";
import { ExerciseLibrary } from "./library";

export default async function ExercisesPage() {
  const user = await requireUser();
  const exercises = await listExercises(user.id);
  return (
    <>
      <PageHeader title="Cviky" subtitle={`${exercises.length} cviků v knihovně`} back="/workout" />
      <ExerciseLibrary exercises={exercises} />
    </>
  );
}

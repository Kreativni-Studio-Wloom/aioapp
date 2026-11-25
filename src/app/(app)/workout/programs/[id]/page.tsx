import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getActiveWorkout, getProgram, listExercises } from "@/lib/workout/service";
import { ProgramEditor } from "./editor";

export default async function ProgramPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const user = await requireUser();
  const [program, exercises, active] = await Promise.all([getProgram(user.id, id), listExercises(user.id), getActiveWorkout(user.id)]);
  if (!program) notFound();
  return <ProgramEditor key={program.id} program={program} exercises={exercises} hasActiveWorkout={!!active} />;
}

import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getSessionData, listExercises } from "@/lib/workout/service";
import { SessionLoader } from "./loader";

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const user = await requireUser();
  const [data, exercises] = await Promise.all([getSessionData(user.id, id), listExercises(user.id)]);
  if (!data) notFound();
  if (data.workout.finishedAt) redirect(`/workout/history/${id}`);
  return <SessionLoader data={data} exercises={exercises} />;
}

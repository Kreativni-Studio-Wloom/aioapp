"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ConfirmButton } from "@/components/ui/client";
import { deleteExerciseAction } from "../../actions";

export function DeleteExerciseButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <ConfirmButton
      size="sm"
      disabled={pending}
      confirmText="Smazat i historii?"
      onConfirm={() =>
        start(async () => {
          const r = await deleteExerciseAction(id);
          if (r.ok) router.push("/workout/exercises");
        })
      }
    >
      Smazat
    </ConfirmButton>
  );
}

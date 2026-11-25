"use client";

import { useTransition } from "react";
import { ConfirmButton } from "@/components/ui/client";
import { deleteWorkoutAction } from "../../actions";

export function DeleteWorkoutButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <ConfirmButton size="sm" disabled={pending} confirmText="Opravdu smazat trénink?" onConfirm={() => start(async () => void (await deleteWorkoutAction(id)))}>
      Smazat trénink
    </ConfirmButton>
  );
}

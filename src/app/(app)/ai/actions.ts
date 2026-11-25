"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, t } from "@/db";
import { requireUser } from "@/lib/auth";
import { resolveAction } from "@/lib/assistant";

export async function approveAction(id: string) {
  const user = await requireUser();
  const r = await resolveAction(user.id, id, true);
  revalidatePath("/", "layout");
  return r;
}

export async function rejectAction(id: string) {
  const user = await requireUser();
  return resolveAction(user.id, id, false);
}

export async function deleteConversation(id: string) {
  const user = await requireUser();
  await db.delete(t.aiConversations).where(and(eq(t.aiConversations.id, id), eq(t.aiConversations.userId, user.id)));
  revalidatePath("/ai");
}

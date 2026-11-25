"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createCode, getClient } from "@/lib/oauth";

export async function approve(form: FormData) {
  const user = await requireUser();
  const get = (k: string) => String(form.get(k) ?? "");
  const client = await getClient(get("client_id"));
  const redirectUri = get("redirect_uri");
  if (!client || !client.redirectUris.includes(redirectUri)) throw new Error("Invalid client");

  const target = new URL(redirectUri);
  const state = get("state");
  if (state) target.searchParams.set("state", state);

  if (get("decision") !== "allow") {
    target.searchParams.set("error", "access_denied");
    redirect(target.toString());
  }

  const code = await createCode({
    clientId: client.id,
    userId: user.id,
    redirectUri,
    codeChallenge: get("code_challenge"),
    scope: get("scope") || null,
  });
  target.searchParams.set("code", code);
  redirect(target.toString());
}

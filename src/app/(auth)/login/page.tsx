import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { AuthForm } from "../auth-form";

export const metadata = { title: "Přihlášení" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getUser()) redirect("/");
  const { next } = await searchParams;
  return <AuthForm mode="login" next={typeof next === "string" ? next : undefined} />;
}

import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { AuthForm } from "../auth-form";

export const metadata = { title: "Přihlášení" };

const NOTICES: Record<string, string> = {
  link: "Odkaz už neplatí nebo byl otevřený v jiném prohlížeči. Pokud šlo o potvrzení e-mailu, účet je nejspíš potvrzený – zkus se přihlásit.",
  confirmed: "E-mail je potvrzený, můžeš se přihlásit.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getUser()) redirect("/");
  const { next, m } = await searchParams;
  return (
    <AuthForm
      mode="login"
      next={typeof next === "string" ? next : undefined}
      notice={typeof m === "string" ? NOTICES[m] : undefined}
    />
  );
}

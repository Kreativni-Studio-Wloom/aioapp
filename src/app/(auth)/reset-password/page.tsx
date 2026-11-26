import { requireUser } from "@/lib/auth";
import { AuthForm } from "../auth-form";

export const metadata = { title: "Nové heslo" };

/** Reached from the reset e-mail via /auth/callback, which has already signed the user in. */
export default async function ResetPasswordPage() {
  await requireUser();
  return <AuthForm mode="reset" />;
}

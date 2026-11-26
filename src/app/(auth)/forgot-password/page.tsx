import { AuthForm } from "../auth-form";

export const metadata = { title: "Zapomenuté heslo" };

export default function ForgotPasswordPage() {
  return <AuthForm mode="forgot" />;
}

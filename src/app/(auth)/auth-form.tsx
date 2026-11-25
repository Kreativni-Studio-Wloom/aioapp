"use client";

import Link from "next/link";
import { useActionState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { login, register, type AuthState } from "./actions";

export function AuthForm({ mode, next }: { mode: "login" | "register"; next?: string }) {
  const [state, action] = useActionState<AuthState, FormData>(mode === "login" ? login : register, undefined);

  return (
    <motion.form
      action={action}
      className="flex w-full flex-col gap-4"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <input type="hidden" name="next" value={next ?? "/"} />
      {mode === "register" && (
        <Field label="Jméno">
          <Input name="name" autoComplete="name" placeholder="Volitelné" />
        </Field>
      )}
      <Field label="E-mail">
        <Input name="email" type="email" autoComplete="email" inputMode="email" required autoFocus />
      </Field>
      <Field label="Heslo">
        <Input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={8} />
      </Field>
      {mode === "register" && (
        <Field label="Heslo znovu">
          <Input name="password2" type="password" autoComplete="new-password" required minLength={8} />
        </Field>
      )}

      <AnimatePresence>
        {state?.error && (
          <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="text-sm text-neg">
            {state.error}
          </motion.p>
        )}
      </AnimatePresence>

      <SubmitButton size="lg" className="mt-2 w-full">
        {mode === "login" ? "Přihlásit" : "Vytvořit účet"}
      </SubmitButton>

      <p className="text-center text-sm text-muted">
        {mode === "login" ? (
          <>
            Nemáš účet?{" "}
            <Link href="/register" className="text-fg underline-offset-4 hover:underline">
              Registrace
            </Link>
          </>
        ) : (
          <>
            Už máš účet?{" "}
            <Link href="/login" className="text-fg underline-offset-4 hover:underline">
              Přihlášení
            </Link>
          </>
        )}
      </p>
    </motion.form>
  );
}

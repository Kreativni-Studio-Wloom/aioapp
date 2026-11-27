"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Field, Input } from "@/components/ui";
import { Spinner, SubmitButton } from "@/components/ui/client";
import { forgotPassword, login, register, resetPassword, type AuthState } from "./actions";

type Mode = "login" | "register" | "forgot" | "reset";

const ACTIONS = { login, register, forgot: forgotPassword, reset: resetPassword };
const SUBMIT: Record<Mode, string> = {
  login: "Přihlásit",
  register: "Vytvořit účet",
  forgot: "Poslat odkaz",
  reset: "Uložit nové heslo",
};

const PENDING: Record<Mode, string> = {
  login: "Přihlašuji…",
  register: "Vytvářím účet…",
  forgot: "Odesílám…",
  reset: "Ukládám…",
};

const linkCls = "text-fg underline-offset-4 hover:underline";

export function AuthForm({ mode, next, notice }: { mode: Mode; next?: string; notice?: string }) {
  const [state, action] = useActionState<AuthState, FormData>(ACTIONS[mode], undefined);
  const done = !!state?.info && (mode === "register" || mode === "forgot");
  const redirectTo = state?.redirectTo;

  // full page load: the app shell and dashboard render fresh with the new session cookies
  useEffect(() => {
    if (redirectTo) window.location.replace(redirectTo);
  }, [redirectTo]);

  return (
    <motion.form
      action={action}
      className="flex w-full flex-col gap-4"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <input type="hidden" name="next" value={next ?? "/"} />
      {notice && !state && <p className="rounded-xl bg-card px-4 py-3 text-sm text-muted">{notice}</p>}

      {!done && (
        <>
          {mode === "reset" && <p className="text-sm text-muted">Zvol si nové heslo.</p>}
          {mode === "forgot" && <p className="text-sm text-muted">Pošleme ti e-mail s odkazem pro nastavení nového hesla.</p>}
          {mode === "register" && (
            <Field label="Jméno">
              <Input name="name" autoComplete="name" placeholder="Volitelné" />
            </Field>
          )}
          {mode !== "reset" && (
            <Field label="E-mail">
              <Input name="email" type="email" autoComplete="email" inputMode="email" required autoFocus />
            </Field>
          )}
          {mode !== "forgot" && (
            <Field label={mode === "reset" ? "Nové heslo" : "Heslo"}>
              <Input
                name="password"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
                minLength={mode === "login" ? 1 : 8}
                autoFocus={mode === "reset"}
              />
            </Field>
          )}
          {(mode === "register" || mode === "reset") && (
            <Field label="Heslo znovu">
              <Input name="password2" type="password" autoComplete="new-password" required minLength={8} />
            </Field>
          )}
          {mode === "register" && (
            <div className="space-y-3 text-sm text-fg-soft">
              <label className="flex items-start gap-3">
                <input type="checkbox" name="terms" required className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--fg)]" />
                <span>
                  Je mi alespoň 15 let a souhlasím s{" "}
                  <Link href="/pravni/podminky" target="_blank" className="underline underline-offset-4">
                    podmínkami užívání
                  </Link>
                  .
                </span>
              </label>
              <label className="flex items-start gap-3">
                <input type="checkbox" name="health" required className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--fg)]" />
                <span>
                  Výslovně souhlasím se zpracováním údajů o mém zdraví (váha, jídlo, trénink), které do AIO zapíšu, za účelem jejich vyhodnocení
                  v aplikaci. Souhlas mohu kdykoli odvolat smazáním účtu.
                </span>
              </label>
              <p className="text-xs text-muted">
                Jak s údaji zacházíme, popisují{" "}
                <Link href="/pravni/soukromi" target="_blank" className="underline underline-offset-4">
                  zásady ochrany osobních údajů
                </Link>
                .
              </p>
            </div>
          )}
        </>
      )}

      <AnimatePresence>
        {state?.error && (
          <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="text-sm text-neg">
            {state.error}
          </motion.p>
        )}
        {state?.info && (
          <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="rounded-xl bg-card px-4 py-3 text-sm">
            {state.info}
          </motion.p>
        )}
      </AnimatePresence>

      {!done && (
        <SubmitButton size="lg" className="mt-2 w-full" pendingText={PENDING[mode]} disabled={!!redirectTo}>
          {redirectTo ? (
            <>
              <Spinner /> Načítám aplikaci…
            </>
          ) : (
            SUBMIT[mode]
          )}
        </SubmitButton>
      )}

      <div className="space-y-2 text-center text-sm text-muted">
        {mode === "login" && (
          <>
            <p>
              Nemáš účet?{" "}
              <Link href="/register" className={linkCls}>
                Registrace
              </Link>
            </p>
            <p>
              <Link href="/forgot-password" className={linkCls}>
                Zapomenuté heslo?
              </Link>
            </p>
          </>
        )}
        {mode === "register" && (
          <p>
            Už máš účet?{" "}
            <Link href="/login" className={linkCls}>
              Přihlášení
            </Link>
          </p>
        )}
        {mode === "forgot" && (
          <p>
            <Link href="/login" className={linkCls}>
              Zpět na přihlášení
            </Link>
          </p>
        )}
      </div>
    </motion.form>
  );
}

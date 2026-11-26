"use client";

import { useActionState, useEffect, useState, useSyncExternalStore, useTransition } from "react";

const noopSubscribe = () => () => {};
/** Client-only value without a setState-in-effect round trip (server snapshot = null). */
function useClientValue<T>(get: () => T): T | null {
  return useSyncExternalStore(noopSubscribe, get, () => null);
}
import { AnimatePresence, motion } from "motion/react";
import { Check, Copy, Trash2 } from "lucide-react";
import { Button, Field, Input, Row } from "@/components/ui";
import { Segmented, SubmitButton, ConfirmButton } from "@/components/ui/client";
import type { ActionResult } from "@/lib/utils";
import {
  setTheme,
  updateAccount,
  changePassword,
  createApiKey,
  deleteApiKey,
  savePushSubscription,
  removePushSubscription,
  sendTestPush,
  signOutOtherDevices,
  deleteAccount,
} from "./actions";

function Saved({ state }: { state: ActionResult | undefined }) {
  return (
    <AnimatePresence>
      {state && (
        <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={state.ok ? "text-sm text-pos" : "text-sm text-neg"}>
          {state.ok ? "Uloženo" : state.error}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

export function AccountForm(props: { name: string; stagnationSessions: number; defaultRestSeconds: number }) {
  const [state, action] = useActionState(updateAccount, undefined);
  return (
    <form action={action} className="grid gap-4 md:grid-cols-3">
      <Field label="Jméno">
        <Input name="name" defaultValue={props.name} />
      </Field>
      <Field label="Pauza mezi sériemi (s)">
        <Input name="defaultRestSeconds" inputMode="numeric" defaultValue={props.defaultRestSeconds} />
      </Field>
      <Field label="Stagnace po (trénincích)" hint="Upozornění, když se váha nehne">
        <Input name="stagnationSessions" inputMode="numeric" defaultValue={props.stagnationSessions} />
      </Field>
      <div className="flex items-center gap-3 md:col-span-3">
        <SubmitButton size="sm">Uložit</SubmitButton>
        <Saved state={state} />
      </div>
    </form>
  );
}

export function PasswordForm() {
  const [state, action] = useActionState(changePassword, undefined);
  return (
    <form action={action} className="grid gap-4 md:grid-cols-2">
      <Field label="Současné heslo">
        <Input name="current" type="password" autoComplete="current-password" required />
      </Field>
      <Field label="Nové heslo">
        <Input name="next" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <div className="flex items-center gap-3 md:col-span-2">
        <SubmitButton size="sm" variant="secondary">
          Změnit heslo
        </SubmitButton>
        <Saved state={state} />
      </div>
    </form>
  );
}

export function ThemeSwitch({ theme }: { theme: "dark" | "light" }) {
  const [value, setValue] = useState(theme);
  const [, start] = useTransition();
  return (
    <Segmented
      layoutId="theme"
      value={value}
      onChange={(v) => {
        setValue(v);
        document.documentElement.dataset.theme = v;
        start(() => setTheme(v));
      }}
      options={[
        { value: "dark", label: "Tmavý" },
        { value: "light", label: "Světlý" },
      ]}
    />
  );
}

export function SignOutOthers() {
  const [pending, start] = useTransition();
  return (
    <Button size="sm" variant="secondary" disabled={pending} onClick={() => start(() => signOutOtherDevices())}>
      Odhlásit ostatní zařízení
    </Button>
  );
}

type KeyRow = { id: string; name: string; prefix: string; lastUsedAt: string | null; createdAt: string };

export function ApiKeys({ keys }: { keys: KeyRow[] }) {
  const [name, setName] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  return (
    <div>
      <div className="flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Název (např. Claude, Zkratky)" />
        <Button
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await createApiKey(name);
              if (r.ok && r.data) {
                setCreated(r.data.key);
                setName("");
              }
            })
          }
        >
          Vytvořit
        </Button>
      </div>
      <AnimatePresence>
        {created && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="mt-3 rounded-xl border border-line-strong p-3">
              <div className="mb-2 text-xs text-muted">Zkopíruj si klíč teď – znovu už zobrazit nepůjde.</div>
              <div className="flex items-center gap-2">
                <code className="num min-w-0 flex-1 truncate text-sm">{created}</code>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    navigator.clipboard.writeText(created);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {keys.length > 0 && (
        <div className="mt-3">
          {keys.map((k) => (
            <Row key={k.id}>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{k.name}</div>
                <div className="num text-xs text-muted">
                  {k.prefix}… · vytvořen {k.createdAt}
                  {k.lastUsedAt ? ` · použit ${k.lastUsedAt}` : ""}
                </div>
              </div>
              <ConfirmButton size="sm" onConfirm={() => deleteApiKey(k.id)} confirmText="Smazat?">
                <Trash2 className="h-4 w-4" />
              </ConfirmButton>
            </Row>
          ))}
        </div>
      )}
    </div>
  );
}

function b64ToUint8(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export function PushToggle({ vapidKey }: { vapidKey: string }) {
  const supported = useClientValue(() => "serviceWorker" in navigator && "PushManager" in window && !!vapidKey);
  const [sub, setSub] = useState<PushSubscription | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (supported) navigator.serviceWorker.getRegistration().then((r) => r?.pushManager.getSubscription().then(setSub));
  }, [supported]);

  if (supported === null) return null;
  if (!supported)
    return (
      <p className="text-sm text-muted">
        Notifikace tu nejsou dostupné. Na iPhonu fungují jen po přidání aplikace na plochu (iOS 16.4+){!vapidKey && " a po nastavení VAPID klíčů"}.
      </p>
    );

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <div className="font-medium">Push notifikace</div>
        <div className="text-sm text-muted">{sub ? "Toto zařízení dostává notifikace." : "Konec pauzy, připomínky a týdenní přehled."}</div>
        {msg && <div className="mt-1 text-sm text-muted">{msg}</div>}
      </div>
      <div className="flex gap-2">
        {sub && (
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => start(async () => setMsg((await sendTestPush()).ok ? "Odesláno." : "Nepodařilo se odeslat."))}>
            Test
          </Button>
        )}
        <Button
          size="sm"
          variant={sub ? "secondary" : "primary"}
          disabled={pending}
          onClick={() =>
            start(async () => {
              try {
                if (sub) {
                  await removePushSubscription(sub.endpoint);
                  await sub.unsubscribe();
                  setSub(null);
                  return;
                }
                const perm = await Notification.requestPermission();
                if (perm !== "granted") return setMsg("Notifikace nejsou povolené v systému.");
                const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
                await navigator.serviceWorker.ready;
                const s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(vapidKey) });
                const json = s.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
                await savePushSubscription(json);
                setSub(s);
              } catch (e) {
                setMsg(e instanceof Error ? e.message : "Chyba");
              }
            })
          }
        >
          {sub ? "Vypnout" : "Zapnout"}
        </Button>
      </div>
    </div>
  );
}

export function InstallHelp() {
  const standalone = useClientValue(
    () => window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true,
  );
  if (standalone) return <div className="text-sm text-muted">Aplikace běží jako nainstalovaná ✓</div>;
  return (
    <div className="grid gap-4 text-sm md:grid-cols-3">
      <div>
        <div className="font-medium">iPhone</div>
        <div className="mt-1 text-muted">Safari → Sdílet → Přidat na plochu</div>
      </div>
      <div>
        <div className="font-medium">Mac</div>
        <div className="mt-1 text-muted">Safari → Soubor → Přidat do Docku (nebo Chrome → Instalovat)</div>
      </div>
      <div>
        <div className="font-medium">Windows / Android</div>
        <div className="mt-1 text-muted">Chrome / Edge → ikona Instalovat v adresním řádku</div>
      </div>
    </div>
  );
}

export function DeleteAccount({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionResult | undefined, FormData>(deleteAccount, undefined);
  if (!open)
    return (
      <Button size="sm" variant="secondary" className="text-neg" onClick={() => setOpen(true)}>
        Smazat účet
      </Button>
    );
  return (
    <form action={action} className="w-full space-y-3">
      <p className="text-sm text-fg-soft">
        Smažeme účet a <strong>všechna data</strong> – tréninky, výživu, příjmy, portfolio, cíle, konverzace s AI i připojené integrace. Nejde to vrátit.
        Pokud si chceš data nechat, stáhni si nejdřív export výše.
      </p>
      <Field label={`Pro potvrzení napiš svůj e-mail (${email})`}>
        <Input name="confirm" type="email" autoComplete="off" required />
      </Field>
      {state && !state.ok && <p className="text-sm text-neg">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="danger" disabled={pending}>
          {pending ? "Mažu…" : "Trvale smazat účet"}
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(false)}>
          Zrušit
        </Button>
      </div>
    </form>
  );
}

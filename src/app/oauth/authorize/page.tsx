import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getClient } from "@/lib/oauth";
import { Button } from "@/components/ui";
import { approve } from "./actions";

export const metadata = { title: "Připojit aplikaci" };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="pt-safe pb-safe flex min-h-dvh flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center text-4xl font-bold tracking-tighter">AIO</div>
        {children}
      </div>
    </div>
  );
}

export default async function AuthorizePage({ searchParams }: PageProps<"/oauth/authorize">) {
  const sp = await searchParams;
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const q = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string"));

  const user = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/oauth/authorize?${q}`)}`);

  const client = await getClient(get("client_id"));
  const redirectUri = get("redirect_uri");
  let error: string | null = null;
  if (!client) error = "Neznámá aplikace (client_id).";
  else if (!client.redirectUris.includes(redirectUri)) error = "Neplatná adresa pro návrat (redirect_uri).";
  else if (get("response_type") !== "code") error = "Nepodporovaný response_type.";
  else if (!get("code_challenge") || (get("code_challenge_method") || "S256") !== "S256") error = "Chybí PKCE (S256).";

  if (error || !client)
    return (
      <Shell>
        <p className="text-center text-neg">{error}</p>
      </Shell>
    );

  const host = (() => {
    try {
      return new URL(redirectUri).host;
    } catch {
      return redirectUri;
    }
  })();

  return (
    <Shell>
      <div className="rounded-3xl bg-card p-6">
        <div className="text-lg font-semibold tracking-tight">{client.name} chce přístup k tvému AIO</div>
        <p className="mt-2 text-sm text-muted">Účet {user.email}</p>
        <ul className="mt-5 space-y-2 text-sm text-fg-soft">
          <li>• Číst všechna data: trénink, výživu, příjmy, portfolio</li>
          <li>• Zapisovat: tréninky, programy, jídlo, příjmy a výdaje, transakce aktiv</li>
        </ul>
        <p className="mt-5 text-xs text-subtle">Návrat na {host}. Přístup můžeš kdykoliv zrušit v Nastavení → API a integrace.</p>
        <form action={approve} className="mt-6 flex gap-2">
          {[...q.entries()].map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <Button type="submit" name="decision" value="deny" variant="secondary" className="flex-1">
            Zamítnout
          </Button>
          <Button type="submit" name="decision" value="allow" className="flex-1">
            Povolit
          </Button>
        </form>
      </div>
    </Shell>
  );
}

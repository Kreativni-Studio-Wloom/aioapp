import { cookies } from "next/headers";
import { desc, eq } from "drizzle-orm";
import { db, t } from "@/db";
import { requireUser } from "@/lib/auth";
import { Card, PageHeader, SectionTitle, Row, LinkButton } from "@/components/ui";
import { dateLabel } from "@/lib/format";
import { aiModel, availableProviders, currentProvider, PROVIDER_LABEL } from "@/lib/ai";
import { logout } from "../../(auth)/actions";
import { AccountForm, PasswordForm, ThemeSwitch, AiProviderSwitch, ApiKeys, PushToggle, SignOutOthers, InstallHelp, DeleteAccount } from "./client";
import { LegalLinks } from "@/components/legal-links";

export const metadata = { title: "Nastavení" };

export default async function SettingsPage() {
  const user = await requireUser();
  const [profile] = await db.select().from(t.profiles).where(eq(t.profiles.userId, user.id));
  const keys = await db
    .select({ id: t.apiKeys.id, name: t.apiKeys.name, prefix: t.apiKeys.prefix, lastUsedAt: t.apiKeys.lastUsedAt, createdAt: t.apiKeys.createdAt })
    .from(t.apiKeys)
    .where(eq(t.apiKeys.userId, user.id))
    .orderBy(desc(t.apiKeys.createdAt));
  const providers = availableProviders();
  const provider = await currentProvider();
  const theme = (await cookies()).get("theme")?.value === "light" ? "light" : "dark";

  return (
    <div>
      <PageHeader title="Nastavení" subtitle={user.email} />

      <SectionTitle>Účet</SectionTitle>
      <Card>
        <AccountForm name={user.name ?? ""} stagnationSessions={profile?.stagnationSessions ?? 3} defaultRestSeconds={profile?.defaultRestSeconds ?? 120} />
      </Card>

      <SectionTitle>Vzhled</SectionTitle>
      <Card className="flex items-center justify-between">
        <div>
          <div className="font-medium">Motiv</div>
          <div className="text-sm text-muted">Černobílý, tmavý nebo světlý</div>
        </div>
        <ThemeSwitch theme={theme} />
      </Card>

      <SectionTitle>Instalace aplikace</SectionTitle>
      <Card>
        <InstallHelp />
      </Card>

      <SectionTitle>Notifikace</SectionTitle>
      <Card>
        <PushToggle vapidKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""} />
      </Card>

      <SectionTitle>Profil výživy</SectionTitle>
      <Card className="flex items-center justify-between gap-3">
        <div className="text-sm text-muted">Výška, věk, aktivita, cíl a výpočet kalorií</div>
        <LinkButton href="/nutrition/profile" variant="secondary" size="sm">
          Upravit
        </LinkButton>
      </Card>

      <SectionTitle>AI</SectionTitle>
      <Card>
        <Row className="flex-wrap gap-3 py-0">
          <div>
            <div className="font-medium">Poskytovatel AI</div>
            <div className="text-sm text-muted">
              {provider
                ? `${PROVIDER_LABEL[provider]} · ${aiModel(provider)} – AI trenér, rozpoznání jídla, import plánů a asistent.`
                : "Chybí ANTHROPIC_API_KEY nebo OPENAI_API_KEY v prostředí serveru."}
            </div>
            {provider && providers.length < 2 && (
              <div className="mt-1 text-xs text-muted">
                Pro přepínání doplň i {provider === "anthropic" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY"} do prostředí serveru.
              </div>
            )}
          </div>
          {provider ? <AiProviderSwitch provider={provider} available={providers} /> : <span className="text-muted text-sm">Vypnuto</span>}
        </Row>
      </Card>

      <SectionTitle>API a integrace</SectionTitle>
      <Card>
        <p className="mb-4 text-sm text-muted">
          Osobní API klíče pro REST API (<code className="text-fg-soft">/api/v1</code>), MCP server pro Clauda (<code className="text-fg-soft">/api/mcp</code>) a iOS Zkratky.
          Dokumentace je v <a className="underline underline-offset-4" href="/api/v1">/api/v1</a>.
        </p>
        <ApiKeys keys={keys.map((k) => ({ ...k, lastUsedAt: k.lastUsedAt ? dateLabel(k.lastUsedAt) : null, createdAt: dateLabel(k.createdAt) }))} />
      </Card>

      <SectionTitle>Data</SectionTitle>
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted">Kompletní export všech tvých dat (JSON)</div>
        <a href="/api/export" className="inline-flex h-8 items-center rounded-xl bg-bg-elev px-3 text-sm font-medium hover:bg-card-hover">
          Stáhnout export
        </a>
      </Card>

      <SectionTitle>Zabezpečení</SectionTitle>
      <Card className="space-y-5">
        <PasswordForm />
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
          <div className="text-sm text-muted">Přihlášení spravuje Supabase Auth</div>
          <div className="flex gap-2">
            <SignOutOthers />
            <form action={logout}>
              <button type="submit" className="inline-flex h-8 items-center rounded-xl bg-bg-elev px-3 text-sm font-medium text-neg hover:bg-card-hover">
                Odhlásit
              </button>
            </form>
          </div>
        </div>
      </Card>
      <SectionTitle>Smazání účtu</SectionTitle>
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted">Trvale smaže účet a všechna data. Zároveň tím odvoláš souhlas se zpracováním údajů o zdraví.</div>
        <DeleteAccount email={user.email} />
      </Card>

      <LegalLinks className="mt-10" />
      <div className="h-8" />
    </div>
  );
}

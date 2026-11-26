# AIO – spuštění a nasazení

Krok za krokem, jak dostat aplikaci na `aioapp.eu`. Všechno, co jde udělat bez tvých účtů, je hotové; tady je zbytek.

---

## 1. Lokální vývoj (už běží)

```bash
npm install
npm run dev            # http://localhost:3000
```

- Lokální databáze: Postgres z Homebrew (`DATABASE_URL` v `.env.local`).
- Změna schématu DB: upravit `src/db/schema.ts` → `npm run db:push`.
- Testovací účet: `dev@aioapp.test`, heslo je v `.env.local` (`DEV_LOGIN_PASSWORD`).

---

## 2. Supabase (databáze v EU)

1. V kořeni projektu vytvoř soubor `.env.production.local` s jedním řádkem (connection string z Supabase → Connect → ORM/Drizzle, **transaction pooler**, port 6543, doplň své heslo k DB):
   ```
   DATABASE_URL="postgresql://postgres.edgwhlbewukquenrrdns:TVOJE-HESLO@aws-0-eu-central-1.pooler.supabase.com:6543/postgres"
   ```
2. Spusť:
   ```bash
   npm run db:setup:prod
   ```
   Vytvoří všechny tabulky a nahraje knihovnu cviků (pro migrace si sám přepne na session pooler, port 5432).

> Soubor `.env.production.local` je v `.gitignore`, na GitHub se nedostane.

### Přihlašování (Supabase Auth)

Registraci, přihlášení, potvrzení e-mailu i reset hesla řeší Supabase Auth. Data aplikace jsou dál v našich tabulkách, účet se s nimi spáruje podle e-mailu.

1. Supabase → **Project Settings → API Keys** → zkopíruj **Publishable key** (`sb_publishable_…`, případně legacy `anon`) → na Vercel jako `SUPABASE_PUBLISHABLE_KEY`.
2. Supabase → **Authentication → URL Configuration**:
   - **Site URL**: `https://aioapp-32dm.vercel.app` (po napojení domény `https://aioapp.eu`)
   - **Redirect URLs**: `https://aioapp-32dm.vercel.app/**`, `https://aioapp.eu/**`, `http://localhost:3000/**`
3. Volitelně **Authentication → Sign In / Providers → Email**: „Confirm email“ vypnout, pokud nechceš potvrzovat e-mail (pak jsi po registraci rovnou přihlášený).
4. Až máš svůj účet: **Authentication → Sign In / Providers → Allow new users to sign up** vypnout (a/nebo `ALLOW_REGISTRATION=false` na Vercelu).

> Vestavěný e-mail Supabase posílá jen pár e-mailů za hodinu. Pro víc stačí nastavit vlastní SMTP (Authentication → Emails → SMTP).

---

## 3. Vercel

Repozitář na GitHubu už existuje. Vercel → **Add New → Project** → importuj ho (Next.js se pozná sám), před prvním deployem vyplň **Environment Variables**:

| Proměnná | Hodnota |
|---|---|
| `DATABASE_URL` | stejný řetězec jako v `.env.production.local` (port 6543) |
| `APP_URL` | `https://aioapp.eu` (dokud nemáš doménu, adresa z Vercelu, např. `https://aioapp.vercel.app`) |
| `SUPABASE_PUBLISHABLE_KEY` | Publishable key ze Supabase (viz výše). `SUPABASE_URL` není potřeba – odvodí se z `DATABASE_URL`. |
| `ALLOW_REGISTRATION` | `true`, po vytvoření svého účtu přepni na `false` a dej Redeploy |
| `CRON_SECRET` | náhodný řetězec (`openssl rand -hex 24`) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | z `.env.local` (nebo nové: `npx web-push generate-vapid-keys`) |
| `VAPID_PRIVATE_KEY` | z `.env.local` |
| `VAPID_SUBJECT` | `mailto:tvuj@email` |
| `ANTHROPIC_API_KEY` | **později** – klíč z console.anthropic.com (AI asistent, fotky jídla). Bez něj vše ostatní funguje. |

Denní cron (`vercel.json`, 17:00 UTC) aktualizuje kurzy ČNB, ceny aktiv, čisté jmění, opakované platby a posílá notifikace.

---

## 4. Doména aioapp.eu

1. Kup doménu (Wedos / Forpsi / Cloudflare Registrar …).
2. Vercel → Project → **Settings → Domains** → přidej `aioapp.eu` a `www.aioapp.eu`.
3. U registrátora nastav DNS přesně podle toho, co Vercel ukáže (typicky `A @ → 76.76.21.21` a `CNAME www → cname.vercel-dns.com`).
4. HTTPS certifikát se vystaví automaticky.

---

## 5. Instalace jako aplikace

- **iPhone:** Safari → `aioapp.eu` → Sdílet → **Přidat na plochu**. Pak v aplikaci Nastavení → Notifikace → Zapnout.
- **Mac:** Safari → Soubor → **Přidat do Docku** (nebo Chrome → ikona Instalovat).
- **Windows:** Chrome/Edge → Instalovat aplikaci.

---

## 6. Claude jako „vstup“ do aplikace (MCP konektor)

Claude pak umí číst **všechna** tvoje data a zapisovat (tréninky, programy, jídlo, příjmy, eventy, aktiva…). Celkem 78 nástrojů.

**Claude app (web, desktop i mobil):**
1. claude.ai → Settings → **Connectors** → **Add custom connector**.
2. Název `AIO`, URL `https://aioapp.eu/api/mcp` → Add → **Connect**.
3. Otevře se přihlášení do AIO → **Povolit**. Hotovo, konektor se sám synchronizuje i do mobilní aplikace.
4. V chatu ho zapni v menu nástrojů (ikona posuvníků). U zápisů se tě Claude zeptá na potvrzení.

Přístup zrušíš v AIO → Nastavení → API a integrace (smazáním položky „Claude“).

**Claude Code / skripty** (API klíč místo OAuth): v AIO vytvoř klíč a pak
```bash
claude mcp add --transport http aio https://aioapp.eu/api/mcp --header "Authorization: Bearer aio_…"
```

---

## 7. iOS Zkratky (váha, rychlý zápis)

Zkratka → akce **Získat obsah URL**:
- URL: `https://aioapp.eu/api/v1/tools/log_body_weight`
- Metoda: POST, hlavička `Authorization: Bearer aio_…`
- Tělo (JSON): `weightKg` = *Zeptat se na číslo*

Seznam všech nástrojů a vstupů: `https://aioapp.eu/api/v1`.

---

## Architektura v kostce

```
src/app/(app)/…        stránky (Domů, Trénink, Výživa, Příjmy, Portfolio, AI, Nastavení)
src/lib/<modul>/       service.ts (logika + DB), summary.ts (dashboard)
src/lib/ai-tools.ts    jeden registr nástrojů → AI asistent, MCP server i REST API
src/app/api/…          ai/chat (stream), mcp, v1, export, cron
src/db/schema.ts       celé datové schéma (Drizzle / Postgres)
public/sw.js           service worker (offline, push)
```

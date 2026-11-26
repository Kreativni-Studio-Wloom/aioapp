# Fakta o provozu – AIO (aioapp.eu)

Zdroj pravdy pro právní dokumenty. Každý fakt má zdroj. Stav k 27. 11. 2026.

## Provozovatel

| Fakt | Hodnota | Zdroj |
|---|---|---|
| Typ | fyzická osoba, nepodnikatel (bez IČO) | sdělil provozovatel |
| Jméno | Adam Grigar | odvozeno z git autora (`grigaradam <grigar.adam@gmail.com>`) – **potvrdit** |
| Kontakt (uživatelé i GDPR) | grigar.adam@gmail.com | sdělil provozovatel |
| Adresa | neuvedena (nepodnikatel nemá povinnost ji zveřejnit; poskytne na vyžádání) | předpoklad – viz ZPRAVA.md |
| Pověřenec | nejmenován (povinnost nevzniká) | čl. 37 GDPR |

## Služba

| Fakt | Hodnota | Zdroj |
|---|---|---|
| Co to je | osobní tracker: trénink, výživa, příjmy, portfolio, cíle, AI asistent | PLAN.md, `src/app/(app)/**` |
| Cena | zdarma, bez placených funkcí, bez reklam | sdělil provozovatel |
| Registrace | otevřená všem (`ALLOW_REGISTRATION`), provozovatel ji možná později vypne | sdělil provozovatel, `src/lib/auth.ts:14` |
| URL | https://aioapp.eu (dočasně https://aioapp-32dm.vercel.app) | SETUP.md |
| Uživatelský obsah veřejně | žádný – data vidí jen jejich vlastník | `src/lib/*/service.ts` (filtr `userId`) |
| Věk | 15+ (předpoklad, nejbezpečnější varianta) | předpoklad |

## Procesy a osobní údaje

| Proces | Údaje | Kde v kódu |
|---|---|---|
| Registrace, přihlášení, reset hesla, potvrzení e-mailu | e-mail, jméno (nepovinné), heslo (hash u Supabase Auth), časy přihlášení | `src/app/(auth)/actions.ts`, Supabase Auth |
| Trénink | programy, tréninky, série (váha, opakování, RPE), poznámky | `src/lib/workout/service.ts` |
| Tělo | tělesná váha, % tuku, obvod pasu | `schema.ts` `body_metrics` |
| Výživa | věk, pohlaví, výška, váha, aktivita, cíl, snědená jídla, voda | `src/lib/nutrition/**` |
| Fotka / text jídla | fotka (zmenšená, **neukládá se**), text → Claude API | `src/lib/nutrition/estimate.ts`, `add-sheet.tsx` |
| EAN sken | kamera v prohlížeči (lokálně), EAN kód → Open Food Facts | `scanner.tsx`, `src/lib/nutrition/off.ts` |
| Příjmy | zdroje, eventy, transakce, částky, měny, poznámky | `src/lib/income/**` |
| Portfolio | aktiva, transakce, závazky, čisté jmění | `src/lib/portfolio/**` |
| Cíle | cíle napříč moduly | `src/lib/goals/service.ts` |
| AI asistent | obsah konverzací (uloženy v DB, lze smazat), data z modulů posílaná modelu | `src/lib/assistant.ts`, `src/app/api/ai/chat/route.ts` |
| Integrace (MCP, REST API, iOS Zkratky) | API klíče / OAuth tokeny (hash), datum použití | `src/lib/oauth.ts`, `schema.ts` `api_keys` |
| Web push | endpoint a klíče odběru | `schema.ts` `push_subscriptions`, `src/lib/push.ts` |
| Export dat | JSON všech dat | `src/app/api/export/route.ts` |
| Denní cron | kurzy ČNB, ceny aktiv, snapshot jmění, upozornění | `src/app/api/cron/daily/route.ts` |

Zvláštní kategorie (čl. 9 GDPR): **údaje o zdraví** – tělesná váha, složení těla, příjem jídla, tréninková zátěž.

## Zpracovatelé a třetí strany

| Subjekt | Role | Co dostává | Místo |
|---|---|---|---|
| Supabase Inc. | zpracovatel – databáze a přihlašování | všechna data účtu | servery EU (Frankfurt, `aws-0-eu-central-1`); společnost v USA → SCC |
| Vercel Inc. | zpracovatel – hosting aplikace | požadavky, IP adresy v logu | region `fra1` (Frankfurt), společnost USA → DPF |
| Anthropic PBC | zpracovatel – AI (Claude API) | jen při použití AI: zpráva, fotka jídla, data potřebná k odpovědi | USA → SCC; vstupy netrénuje (obchodní podmínky API) |
| Apple / Google / Mozilla push služby | doručení notifikace | obsah notifikace přes endpoint | dle prohlížeče, USA |
| Open Food Facts | samostatný subjekt | jen EAN kód / hledaný text, bez identifikace uživatele | Francie |
| Yahoo Finance, CoinGecko | zdroj cen | jen tickery, bez identifikace uživatele | USA / Singapur |
| ČNB | kurzy | nic o uživateli | ČR |
| Anthropic (Claude app přes MCP) | jen pokud si uživatel sám propojí | data, která si uživatel vyžádá | podle smlouvy uživatele s Anthropic |

Žádná analytika, reklama, pixely, Google Fonts z CDN (fonty `next/font` jsou servírovány z vlastní domény).

## Cookies a úložiště (vše nezbytné / vyžádané uživatelem)

| Název | Typ | Účel | Doba |
|---|---|---|---|
| `sb-<projekt>-auth-token` (+ `.0`, `.1`) | HTTP cookie, 1st party | přihlášení (Supabase) | do odhlášení, obnovuje se (max. 400 dní) |
| `sb-<projekt>-auth-token-code-verifier` | HTTP cookie, 1st party | dokončení potvrzení e-mailu / resetu hesla | do dokončení, krátce |
| `theme` | HTTP cookie, 1st party | uživatelem zvolený světlý/tmavý motiv | 1 rok |
| `privacy` | HTTP cookie, 1st party | uživatelem zapnutý režim skrytí částek | 1 rok |
| `aio.workout.rest.v1` | localStorage | běžící odpočet pauzy | do konce pauzy |
| `aio.workout.queue.v1` | localStorage | offline fronta zapsaných sérií | do synchronizace |
| Service worker cache `aio-v1-*` | Cache Storage | offline režim, ikony | do aktualizace aplikace |

## Platby, doprava, zboží

Žádné. Služba je bezplatná, neprodává zboží ani předplatné.

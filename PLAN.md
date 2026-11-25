# AIO App (aioapp.eu): plán

Osobní „all-in-one“ tracker: trénink, příjmy, portfolio, kalorie. Jeden web za přihlášením, instalovatelný na iPhone (plocha) i na PC/Mac jako aplikace. Design černobílý, minimalistický, rychlý, s jemnými animacemi.

---

## 1. Jak to bude fungovat na všech zařízeních

**Základ: PWA (Progressive Web App).** Jeden kód, jedna adresa `aioapp.eu`:

| Zařízení | Jak se instaluje | Výsledek |
|---|---|---|
| iPhone | Safari → Sdílet → *Přidat na plochu* | ikona na ploše, celá obrazovka bez lišty Safari, vlastní splash |
| Mac | Safari → Soubor → *Přidat do Docku* (nebo Chrome → Instalovat) | samostatné okno v Docku |
| Windows | Chrome / Edge → *Instalovat aplikaci* | samostatné okno, Start menu |
| Kdekoliv jinde | prostě otevřít web | funguje i bez instalace |

Od iOS 16.4 umí PWA na ploše i **web push notifikace** (konec pauzy mezi sériemi, připomínky jídla, upozornění na stagnaci).

**Claude Artifacts / otevřenost.** Artifact je stránka hostovaná na claude.ai, takže jako hlavní aplikace se nehodí (vlastní doména, přihlášení, kamera pro skener). Aby to zůstalo „otevřené na více způsobů“, postavíme aplikaci **API-first**:

- veškerá data jdou přes vlastní REST API (`/api/v1/...`) s osobními API klíči,
- nad ním **MCP server**, takže Claude (desktop, Claude Code, mobilní app) může přímo číst a zapisovat: „zapiš mi dnešní příjem z eventu 12 400 Kč“, „jak jsem na tom s bench pressem?“,
- z toho API pak jde kdykoliv udělat Artifact dashboard, iOS Zkratky (Shortcuts), widget nebo nativní appku, bez přepisování backendu.

---

## 2. Technologie (doporučení)

| Vrstva | Volba | Proč |
|---|---|---|
| Framework | **Next.js (App Router) + TypeScript** | web + API v jednom, server components = rychlé |
| UI | **Tailwind CSS + shadcn/ui** (upravené do B/W) | minimalistické, plná kontrola |
| Animace | **Motion** (Framer Motion) + View Transitions API | plynulé přechody mezi moduly, mikrointerakce |
| Grafy | **Recharts** nebo visx, monochromatické | progres, příjmy, portfolio |
| Databáze | **PostgreSQL (Supabase)** + Drizzle ORM | relace mezi moduly, Row Level Security, úložiště fotek |
| Auth | **Supabase Auth** (e-mail + heslo, registrace, reset hesla) + **passkeys / Face ID**, volitelně 2FA | klasická registrace dle zadání, ale na iPhonu přihlášení Face ID |
| PWA | **Serwist** (service worker), manifest, offline cache | instalace, offline zápis tréninku v posilovně bez signálu |
| AI | **Claude API** (tool use + vision) | AI trenér, rozpoznání jídla z fotky/textu |
| Potraviny | **Open Food Facts API** (EAN, zdarma, dobré pokrytí CZ/EU) + vlastní DB potravin | skenování čárových kódů |
| Skener | **@zxing/browser** (Safari nemá BarcodeDetector) | EAN přes kameru v PWA |
| Ceny aktiv | akcie/ETF: Twelve Data / Finnhub · krypto: CoinGecko · kurzy: **ČNB** | denní přecenění, vše přepočteno do CZK |
| Hosting | **Vercel** (app) + Supabase (EU region, Frankfurt) | HTTPS, rychlé nasazení, data v EU (GDPR) |
| Cron | Vercel Cron / Supabase pg_cron | denní ceny, kurzy, kontrola stagnace, notifikace |

Měsíční náklady pro jednoho uživatele: hosting a DB v free tierech; doména ~200–300 Kč/rok; Claude API podle používání (řádově desítky až nízké stovky Kč měsíčně).

---

## 3. Struktura aplikace

```
/                 Domů: dnešní přehled napříč moduly + přepínač systémů
/workout          Trénink
/nutrition        Kalorie a živiny
/income           Příjmy (a výdaje)
/portfolio        Portfolio a čisté jmění
/ai               Univerzální AI asistent (vidí všechny moduly)
/settings         Profil, cíle, měna, API klíče, export dat
```

**Navigace:** na telefonu spodní tab bar (palec), na PC levý sidebar. Všude **Cmd/Ctrl+K paleta** a velké tlačítko „+“ pro rychlé zapsání čehokoliv („jídlo“, „série“, „příjem“).

**Domovská stránka:** karty modulů s klíčovou metrikou dne:
- Trénink: dnešní plán / poslední trénink, týdenní objem
- Výživa: zbývající kcal + makra (kruhy)
- Příjmy: tento měsíc vs. průměr
- Portfolio: hodnota + denní změna
- Čisté jmění celkem

---

## 4. Moduly

### 4.1 Workout tracker
**Zadání:**
- Šablony tréninků / programy (např. PPL, Upper/Lower), přiřazení ke dnům
- Zápis série: váha × opakování, RPE/RIR, poznámka; předvyplnění z minula
- **Rest timer** mezi sériemi (auto start po zapsání série, vibrace, push notifikace i při zamčeném telefonu)
- Progres: graf váhy, odhad 1RM, objem po svalových partiích, osobní rekordy
- **Detekce stagnace:** stejná pracovní váha N tréninků (výchozí 3–4) bez nárůstu opakování → upozornění + návrh (deload, změna rozsahu opakování, variace)
- **Alternativy cviku:** každý cvik má tagy (sval, pohyb, vybavení); „stroj je obsazený“ → nabídne náhradu se stejným vzorcem pohybu
- **AI trenér:** chat nad tvými daty; přes tool use může **sám upravit plán** (přidat/odebrat cvik, změnit série, nastavit progresi). Každá změna se ukáže jako diff ke schválení a jde vrátit

**Navíc doporučuji:**
- Automatická progrese (double progression: po dosažení horní hranice opakování zvedne váhu)
- Kalkulačka kotoučů, warm-up série vypočtené z pracovní váhy
- Supersety, dropsety
- Tělesné míry a váha (graf, průměr 7 dní), progress fotky (soukromé)
- Kalendář / heatmapa tréninků, streak
- Offline režim: v posilovně často není signál, zápis se synchronizuje později

### 4.2 Income tracker
**Zadání:**
- Zdroje příjmů / **businessy** (Matcha, pronájem nemovitosti, investice, …), každý s typem
- U businessu **eventy/projekty** (např. konkrétní festival): příjmy zapisované per event
- Investice: zápis výběrů zisku
- Přehledy: rok, měsíc, průměrný měsíční příjem, rozpad podle zdroje, meziroční srovnání

**Navíc doporučuji (výrazně zvyšuje užitečnost):**
- **Výdaje** u businessů/eventů (stánek, suroviny, doprava, poplatky) → **zisk a marže na event**; bez toho číslo příjmu klame
- Pronájem: nájemné, měsíční kontrola „přišlo / nepřišlo“, náklady (fond oprav, opravy), čistý výnos a yield
- Opakované příjmy (nájem každý měsíc), auto-návrh záznamu
- Měny (EUR → CZK kurzem ČNB ke dni)
- Hrubý / čistý příjem, poznámka k daním (OSVČ, §9 pronájem, §10 investice); export CSV pro účetní
- Event analytika: nejvýnosnější typ eventu, příjem na den / hodinu
- Přílohy (fotka účtenky / faktury)

### 4.3 Portfolio tracker
**Zadání:** zapsání všech aktiv a automatické sledování hodnoty.

- Třídy aktiv: akcie/ETF, krypto, hotovost/spořicí účty, nemovitosti (ruční ocenění), ostatní (komodity, sběratelské věci)
- Transakce (nákup, prodej, dividenda, poplatek) → průměrná nákupní cena, nerealizovaný / realizovaný zisk
- Denní přecenění přes cron, vše v CZK
- Alokace (koláč), vývoj hodnoty v čase

**Navíc:**
- **Čisté jmění** = portfolio + nemovitosti + hotovost − dluhy (hypotéka)
- **Propojení s příjmy:** výběr zisku z investice se automaticky zapíše i do Income (jeden zápis, dvě místa)
- Dividendový kalendář, cílová alokace + upozornění na rebalanc
- Import CSV od brokera (XTB, Degiro, IBKR, Trading 212)
- Hlídání časového testu 3 let pro osvobození od daně (CZ)

### 4.4 Kalorie a živiny
**Zadání:**
- Profil: věk, pohlaví, výška, váha, aktivita, cíl (hubnutí / udržování / nabírání, tempo)
- Výpočet: BMR (Mifflin-St Jeor) → TDEE → cílové kcal a makra (bílkoviny dle váhy)
- Zápis jídla třemi způsoby:
  1. **Fotka** → Claude vision odhadne jídlo, gramáž a živiny; ty jen potvrdíš/upravíš
  2. **Text** („2 vejce, 80 g ovesných vloček, banán“) → AI rozparsuje
  3. **EAN sken** → Open Food Facts → zadáš gramy

**Navíc:**
- **Adaptivní TDEE:** z reálného trendu váhy a příjmu kalorií se cíl sám dolaďuje (nejpřesnější metoda)
- Oblíbená a opakovaná jídla, vlastní recepty (spočítá živiny na porci), „kopírovat včerejšek“
- Vlastní potraviny + cache naskenovaných
- Voda, vláknina, cukr, sůl, vybrané mikroživiny
- **Propojení s tréninkem:** v tréninkový den mírně vyšší kcal/sacharidy, hlídání bílkovin
- Týdenní report (průměr, dodržení cílů, trend váhy)

### 4.5 Univerzální AI asistent
Jeden chat (`/ai`, a kontextově v každém modulu), který má nástroje do všech modulů:
- „Kolik jsem vydělal na eventech letos a který byl nejlepší?“
- „Navrhni mi jídla na zbytek dne, ať doberu bílkoviny.“
- „Bench stagnuje 4 týdny, uprav mi plán.“
Zápisy dělá přes stejné API jako UI, se schválením u větších změn.

---

## 5. Souvislosti mezi moduly

```
Tělesná váha ──► adaptivní TDEE (výživa) ──► cíle kcal
      ▲                                       │
      └──── trénink (objem, tréninkové dny) ◄─┘

Portfolio: výběr zisku ──► Income (investice)
Income: nájem ──► Nemovitost (yield) ──► Čisté jmění ◄── Portfolio
AI asistent ──► čte a píše všude přes API / MCP
```

---

## 6. Další funkce, na které ses neptal, ale vyplatí se

| Funkce | Proč |
|---|---|
| **Výdaje** (aspoň u businessů a nemovitostí) | bez nich nevidíš zisk |
| **Spánek, kroky, váha přes iOS Zkratky** | PWA nemá přístup k Apple Health; Zkratka může každé ráno poslat data přes API |
| **Návyky / denní check-in** (spánek, energie, nálada) | AI pak vidí souvislosti (špatný spánek → horší výkon) |
| **Cíle** napříč moduly | „100 kg bench do června“, „500 k příjmů z Matchi“ s progress barem |
| **Týdenní review** (neděle, push) | souhrn všech modulů na jedné obrazovce |
| **Export / záloha dat** (JSON, CSV) | data jsou tvoje, kdykoliv odchod |
| **Režim soukromí** | skrytí částek jedním tapem (když ukazuješ telefon) |
| **Přístupové role** | později pustit parťáka z Matchi jen do jednoho businessu |

---

## 7. Design systém

- **Barvy:** čistě černobílá škála (`#000`–`#fff`, 6–8 odstínů šedi); jediný akcent je kontrast. Výchozí tmavý režim + světlý režim. Zelená/červená jen nenápadně pro +/− v číslech (volitelné).
- **Typografie:** Inter / Geist pro UI, **tabulární číslice** (monospace číslice) u všech čísel.
- **Animace:** 150–250 ms, spring u karet a sheetů, číslice „dojíždějí“ při změně, přechody mezi moduly přes View Transitions, haptika (vibrace) na Androidu; respektuje `prefers-reduced-motion`.
- **Mobile-first:** cíle dotyku ≥ 44 px, bottom sheets místo modálů, safe areas (notch, home indicator), velká čísla, zápis série na 2 tapy.
- **PC:** víceslopcové layouty, klávesové zkratky, tabulky s řazením.

---

## 8. Datový model (zjednodušeně)

```
users, profiles (výška, cíle, měna, jednotky)

exercises (název, svaly, vzorec pohybu, vybavení)  exercise_alternatives
programs → program_days → program_exercises (série, rozsah opakování, progrese)
workouts → workout_sets (cvik, váha, opakování, RPE, čas)
body_metrics (datum, váha, míry)  progress_photos

foods (zdroj: OFF/vlastní/AI, EAN, živiny na 100 g)  recipes → recipe_items
meals → meal_items (food, gramy, živiny snapshot)  nutrition_targets (historie)

income_sources (typ: business / pronájem / investice / práce)
events (patří k business)  transactions (příjem/výdaj, částka, měna, kurz, event?, kategorie)
recurring_rules

assets (třída, ticker, měna)  asset_transactions  price_history  fx_rates (ČNB)
liabilities  net_worth_snapshots

ai_conversations, ai_actions (navržená změna, stav, undo)
api_keys, push_subscriptions, goals, habits
```
Všechny tabulky s `user_id` + Row Level Security, takže registrace dalších lidí je bezpečná od začátku.

---

## 9. Plán tvorby po fázích

| Fáze | Obsah | Výstup |
|---|---|---|
| **0. Základ** | Next.js projekt, design systém (B/W komponenty, animace), PWA (manifest, ikony, splash, service worker), Supabase, registrace/přihlášení, layout s tab barem/sidebarem, domovská stránka, nasazení na Vercel + doména aioapp.eu | prázdná, ale instalovatelná appka na iPhonu |
| **1. Workout** | cviky + alternativy, programy, zápis sérií, rest timer, historie, grafy, PR, detekce stagnace, offline zápis | první plně použitelný modul |
| **2. Výživa** | profil + výpočet cílů, databáze potravin, EAN sken (OFF), text a foto přes Claude, denní přehled, oblíbená jídla | |
| **3. Income** | zdroje, eventy, příjmy + výdaje, opakované platby, roční/měsíční přehledy, CSV export | |
| **4. Portfolio** | aktiva, transakce, cron přecenění, ČNB kurzy, alokace, čisté jmění, propojení s Income | |
| **5. AI** | AI trenér s tool use a schvalováním změn, univerzální asistent napříč moduly | |
| **6. Otevřenost** | veřejné REST API + API klíče, MCP server pro Claude, iOS Zkratky (váha, spánek, rychlý zápis), push notifikace | |
| **7. Doladění** | adaptivní TDEE, týdenní review, cíle, návyky, import CSV od brokera, režim soukromí | |

Pořadí lze změnit; každá fáze je samostatně použitelná.

---

## 10. Co od tebe budu potřebovat

1. **Doménu `aioapp.eu`**: koupit (např. Forpsi, Wedos, Cloudflare) a pak nastavit DNS na Vercel
2. **Účty** (zdarma): GitHub, Vercel, Supabase; já vše připravím, přihlásíš se a vložíš klíče do `.env`
3. **Claude API klíč** (console.anthropic.com) pro AI funkce (fáze 2 a 5)
4. **API klíč pro ceny akcií** (Twelve Data / Finnhub free tier, fáze 4)
5. Rozhodnout otevřené otázky níže

### Otevřené otázky
- Výchozí měna CZK a jednotky kg? (předpoklad: ano)
- Výchozí tmavý režim, nebo podle systému?
- Kterým modulem začít po základu? (návrh: Workout)
- Máš existující data k importu (Strong/Hevy export, Excel s příjmy, výpis od brokera)?

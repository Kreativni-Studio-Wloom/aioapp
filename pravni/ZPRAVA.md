# Závěrečná zpráva – právní dokumenty AIO (27. 11. 2026)

Legislativa: reference skillu ke stavu 19. 11. 2026, tedy méně než 2 týdny staré – ověřování přeskočeno.

## Vytvořené dokumenty

| Dokument | URL | Zdroj |
|---|---|---|
| Podmínky užívání v1.0 | `/pravni/podminky` | `pravni/podminky-uzivani.md` |
| Zásady ochrany osobních údajů v1.0 | `/pravni/soukromi` | `pravni/zasady-ochrany-osobnich-udaju.md` |
| Zásady cookies v1.0 | `/pravni/cookies` | `pravni/zasady-cookies.md` |
| Archiv verzí | `/pravni/archiv` | `pravni/archiv/<dokument>/<verze>.html` |

## Změny v kódu

- `src/app/pravni/**` – stránky dokumentů a archivu (veřejné, `src/proxy.ts`), styl `.legal-prose` v `globals.css`
- `src/content/legal.generated.ts` + `scripts/build-legal.mjs` (`npm run legal:build`)
- `src/components/legal-links.tsx` – patička na přihlášení/registraci, právních stránkách a v Nastavení
- Registrace: checkbox podmínek + věku 15+, samostatný checkbox výslovného souhlasu s údaji o zdraví; serverová kontrola a záznam souhlasů (verze, čas) do Supabase `user_metadata.consents`
- Nastavení → **Smazat účet** (smaže všechna data i identitu v Supabase Auth)
- Označení AI v chatu a u odhadu jídla

## Co musí provozovatel udělat

1. **Potvrdit jméno „Adam Grigar“** (odvozeno z gitu). Jinak upravit v `pravni/*.md`, `src/components/legal-links.tsx`, přegenerovat HTML a `npm run legal:build`.
2. **Stávající 3 účty** vznikly bez souhlasu se zdravotními údaji. Pokud jsou testovací, smaž je (Supabase → Authentication → Users + v aplikaci Nastavení → Smazat účet); svůj vlastní účet můžeš ponechat – jako provozovatel souhlas nepotřebuješ.
3. **Supabase → Authentication → Emails**: do šablony „Confirm signup“ můžeš přidat odkaz na `https://aioapp.eu/pravni/podminky` (podmínky v textové podobě po registraci).
4. Pokud z AIO uděláš placenou službu nebo ji budeš provozovat jako OSVČ/firma: je potřeba doplnit IČO, VOP, poučení a funkci „Odstoupit od smlouvy“ (§ 1830a OZ, od 1. 1. 2027), případně prohlášení o přístupnosti – spusť skill znovu.

## Předpoklady

- Adresa provozovatele se nezveřejňuje (nepodnikatel), poskytne se na vyžádání e-mailem.
- Věková hranice 15 let (§ 7 zák. 110/2019 Sb.).
- Spotřebitelská ADR (ČOI) se neuvádí: spor spotřebitele s nepodnikatelem do její působnosti nespadá.

## Kdy revidovat

Nový tracker/analytika (pak cookie lišta), nový zpracovatel, placené funkce, změna právní formy provozovatele, zákon o digitální ekonomice (tisk 69, v Senátu do 12. 12. 2026).

Dokumenty jsou připraveny podle aktuální legislativy a praxe velkých českých služeb; u netypických modelů (zdravotní služby, finanční poradenství) doporučuji revizi advokátem.

# Kontrola právních dokumentů – AIO (27. 11. 2026)

Typ webu podle matice: **SaaS (bezplatná webová aplikace s účtem) + AI**. Provozovatel je fyzická osoba – nepodnikatel, služba je zdarma.

## Automatická kontrola

`check_docs.py pravni --typ saas` → 1 hlášení: „Chybí IČO“ – **falešný poplach**, provozovatel IČO nemá (uvedeno výslovně v každém dokumentu).

## Povinné dokumenty a prvky

| Položka | Stav | Kde |
|---|---|---|
| Identifikace provozovatele | ✔ jméno, „nepodnikatel, bez IČO“, e-mail | všechny dokumenty čl. 1, patička |
| Zásady ochrany osobních údajů (čl. 13 GDPR) | ✔ | `/pravni/soukromi` |
| Zvláštní kategorie – údaje o zdraví (čl. 9) | ✔ výslovný souhlas, samostatný nezaškrtnutý checkbox, záznam (verze + čas v `user_metadata.consents`) | registrace, zásady čl. 2.2 |
| Zásady cookies | ✔ jen nezbytné, seznam ze kódu | `/pravni/cookies` |
| Cookie lišta | – není potřeba (žádné nenezbytné cookies, žádné trackery) | FAKTA.md |
| Podmínky užívání | ✔ | `/pravni/podminky` |
| VOP spotřebitelské, reklamační řád, odstoupení, tlačítko § 1830a | – nevztahuje se: provozovatel není podnikatel a služba je bezplatná; smlouvu lze kdykoli ukončit smazáním účtu | ZPRAVA.md |
| Registrace: odkaz na podmínky + zásady, věk 15+ | ✔ | `src/app/(auth)/auth-form.tsx` |
| Smazání účtu v aplikaci | ✔ Nastavení → Smazat účet (data + Supabase identita) | `settings/actions.ts` `deleteAccount` |
| Export dat (čl. 15, 20) | ✔ JSON | Nastavení → Data |
| Patička s odkazy | ✔ přihlášení/registrace, právní stránky, Nastavení | `src/components/legal-links.tsx` |
| Označení AI (čl. 50 AI Act) | ✔ chat i odhad jídla z fotky/textu | `ai/chat.tsx`, `nutrition/add-sheet.tsx` |
| Archiv verzí | ✔ | `/pravni/archiv`, `pravni/archiv/` |
| ODR odkaz | ✔ není | – |
| Prohlášení o přístupnosti | – nevztahuje se (není e-commerce, nepodnikatel) | – |
| DSA (hosting UGC) | – nevztahuje se (data nejsou veřejná) | – |

## „Útok oponenta“

- **ÚOOÚ – zdravotní údaje bez souhlasu u stávajících účtů:** 3 účty vznikly před zavedením checkboxu. → V ZPRAVA.md úkol: smazat testovací účty, nebo je požádat o souhlas (přihlásit se a zaregistrovat znovu).
- **ÚOOÚ – „vázaný“ souhlas (čl. 7 odst. 4):** souhlas je podmínkou služby, ale údaje o zdraví jsou jejím samotným předmětem (tracker výživy a tréninku), ne vedlejším účelem – obhajitelné; odvolání je jednoduché (smazání účtu).
- **Předávání do USA:** Supabase, Vercel, Anthropic jmenováni, záruky (DPF / SCC) uvedeny.
- **Retence:** uvedeny konkrétní lhůty (účet, zálohy 30 dní, logy 30 dní, Anthropic 30 dní, tokeny 30 dní / 1 rok).
- **Omezení odpovědnosti:** žádné vyloučení náhrady újmy; jen vymezení informativní povahy výpočtů (§ 1814, § 2898 OZ v pořádku).
- **Změna podmínek:** taxativní důvody, 30 dní předem, právo vypovědět (§ 1752 OZ).

# Zásady cookies

**Účinné od:** 27. 11. 2026 · **Verze:** 1.1

## 1. Co jsou cookies

Cookies jsou malé textové soubory, které web ukládá do vašeho zařízení. Podobně fungují i další technologie, které tu souhrnně označujeme jako cookies – úložiště prohlížeče (localStorage) a mezipaměť aplikace (Cache Storage).

Provozovatelem aplikace AIO (aioapp.eu) a správcem osobních údajů je **Adam Grigar** (fyzická osoba, nepodnikatel, bez IČO), e-mail grigar.adam@gmail.com.

## 2. Jaké cookies používáme

Aplikace AIO používá **pouze nezbytné cookies** – bez nich se nelze přihlásit, aplikace by nefungovala offline, nebo by si nepamatovala nastavení, které jste sami zvolili. **Nepoužíváme analytické, marketingové ani reklamní cookies**, měřicí pixely, sociální pluginy ani obsah třetích stran, který by vás sledoval.

Nezbytné cookies ukládáme bez souhlasu podle § 89 odst. 3 zákona č. 127/2005 Sb., o elektronických komunikacích. Osobní údaje v nich zpracováváme na základě plnění smlouvy o užívání aplikace a oprávněného zájmu na jejím bezpečném fungování. Proto se vás neptáme na souhlas cookie lištou.

**Souhlas a jeho změna či odvolání:** protože žádné cookies vyžadující souhlas nepoužíváme, souhlas neudělujete a není co odvolávat. Motiv, skrytí částek a poskytovatele AI můžete kdykoli přepnout v aplikaci; cookies můžete smazat v prohlížeči (čl. 4).

Pokud bychom v budoucnu chtěli použít jiné než nezbytné cookies, zeptáme se vás předem na souhlas a tyto zásady aktualizujeme.

## 3. Seznam cookies

| Název | Účel | Doba platnosti | Typ |
|---|---|---|---|
| `sb-…-auth-token` (případně rozdělená na `.0`, `.1`) | přihlášení k účtu (poskytovatel přihlašování Supabase, cookie je uložena na naší doméně) | do odhlášení, automaticky se obnovuje, nejdéle 400 dní | HTTP cookie (první strana) |
| `sb-…-auth-token-code-verifier` | bezpečné dokončení potvrzení e-mailu nebo obnovení hesla | do dokončení akce | HTTP cookie (první strana) |
| `theme` | zapamatování světlého / tmavého motivu, který jste zvolili | 1 rok | HTTP cookie (první strana) |
| `privacy` | zapamatování režimu skrytí částek, který jste zapnuli | 1 rok | HTTP cookie (první strana) |
| `ai_provider` | zapamatování poskytovatele AI (Claude nebo ChatGPT), kterého jste zvolili v Nastavení | 400 dní | HTTP cookie (první strana) |
| `aio.workout.rest.v1` | běžící odpočet pauzy mezi sériemi (přežije zamknutí telefonu) | do konce pauzy | localStorage |
| `aio.workout.queue.v1` | zapsané série, které se zatím nepodařilo odeslat (offline režim) | do odeslání na server | localStorage |
| `aio-v1-static`, `aio-v1-pages` | mezipaměť ikon a stránek pro rychlé načtení a offline režim | do aktualizace aplikace | Cache Storage (service worker) |

## 4. Jak cookies smazat

Cookies a data webu můžete kdykoli smazat v nastavení prohlížeče (Safari: Nastavení → Safari → Pokročilé → Data webových stránek; Chrome: Nastavení → Ochrana soukromí → Soubory cookie). Po smazání se odhlásíte a nastavení motivu a poskytovatele AI se vrátí na výchozí; neodeslané offline záznamy by se ztratily.

Podrobnosti o zpracování osobních údajů najdete v [Zásadách ochrany osobních údajů](/pravni/soukromi).

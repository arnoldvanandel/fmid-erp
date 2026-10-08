# Richtlijnen voor FMID ERP

Dit bestand geldt voor iedereen die aan deze repo werkt: collega's, en AI-assistenten
(Claude, ChatGPT/Codex, Copilot, Cursor, Gemini, …). Lees het voordat je iets aan de
interface of aan documenten (PDF's, mails) verandert.

## Taal

- Alles wat de gebruiker ziet is **Nederlands**: labels, knoppen, meldingen, mails, PDF's.
- Code volgt de bestaande stijl: Nederlandse namen voor domeinbegrippen
  (`inkooporder`, `leverancier`, `voegInkooporderRegelToe`), commentaar in het Nederlands.

## Huisstijl

De huisstijl komt uit het FMID-logo: een **blauwe zeshoek met witte "F"** en **"MID" in groen**.

### Logo

| Bestand | Gebruik |
| --- | --- |
| `public/fmid-logo.png` | Volledig logo (zeshoek + "MID"), transparante achtergrond. Inlogscherm, zijbalk, PDF's. |
| `public/favicon.png` | Alleen de zeshoek, 64×64. Browsertabblad. |
| `public/apple-touch-icon.png` | Alleen de zeshoek, 180×180. Beginscherm op telefoon/tablet. |
| `public/briefpapier-voet.jpg` | Foto (draaibank) uit de voet van het briefpapier. Alleen voor documenten. |

- Gebruik altijd deze bestanden; maak geen eigen variant of nagetekend logo.
- Toon het logo op een **witte (lichte) achtergrond**. Op een donkere achtergrond (zoals de
  zijbalk) zet je het in een wit vlak, zie `.sidebar-logo` in `src/index.css`.
- Niet uitrekken, niet inkleuren, geen schaduw of filters toevoegen.

### Kleuren

Alle kleuren staan als CSS-variabelen in `:root` in `src/index.css`. **Gebruik altijd de
variabelen, nooit losse hex-waarden** in componenten of inline styles.

| Variabele | Waarde | Gebruik |
| --- | --- | --- |
| `--fmid-blauw` | `#3a4899` | Hoofdkleur: primaire knoppen, links, focus, koppen in documenten |
| `--fmid-blauw-licht` | `#4755a2` | Actief menu-item in de zijbalk |
| `--fmid-groen` | `#5ab031` | Accent, spaarzaam: dunne lijnen/randen (bovenrand inlogkaart, actief menu-item, voetlijn PDF) |
| `--color-primary` | = `--fmid-blauw` | Gebruik deze in componenten, niet `--fmid-blauw` direct |
| `--color-primary-hover` | `#2f3b80` | Hover van primaire knoppen |
| `--color-primary-tint` | `#eceefa` | Lichte achtergrond/focus-ring |
| `--color-success` / `-danger` / `-warning` | groen / rood / oranje | **Alleen** voor statussen en meldingen, niet als huisstijlkleur |

- Groen is een accentkleur: gebruik het niet voor grote vlakken of voor primaire knoppen.
- Het "succes"-groen (`--color-success`) is bewust anders dan het FMID-groen, zodat een
  status nooit met de huisstijl verward wordt.
- Zijbalk: donker FMID-blauw (`#1b2150`). Inhoud: lichtgrijze achtergrond (`--color-bg`)
  met witte kaarten (`.card`).

### Componenten

Gebruik de bestaande klassen uit `src/index.css` in plaats van nieuwe stijlen te verzinnen:

- Knoppen: `.btn` + `.btn-primary` (hoofdactie, max. één per scherm/dialoog),
  `.btn-secondary`, `.btn-danger` (verwijderen, alleen voor admins), `.btn-ghost`, `.btn-sm`.
- Formulieren: `.field`, `.field-row`, `.hint`.
- Tabellen: `.data-table`, getallen rechts uitgelijnd met `.num`.
- Statussen: `.badge` + `.badge-success` / `-warning` / `-danger` / `-neutral`.
- Meldingen: `.banner` + `.banner-danger` / `-info` / `-warning`.
- Dialogen: `Modal` uit `src/components/Modal.jsx`.
- Lettertype: de systeemfont uit `:root`; geen webfonts toevoegen.

### Documenten (PDF's en mails)

- Alle documenten (inkooporder, orderbevestiging, pakbon, factuur) staan op het
  FMID-briefpapier: `src/pages/inkooporders/Briefpapier.jsx` + `afdruk.css` (`.brief-*`),
  nagebouwd naar het drukwerk `Brief_FMID_voorzijde` (map Huisstijl FMI Dussen/Drukwerk).
  Logo linksboven, bedrijfsgegevens rechtsboven (grijs, labels in FMID-blauw, Gill Sans),
  onderaan groene band met blauwe balk, de foto `public/briefpapier-voet.jpg` en de
  bankgegevens. De inhoud is compact (Arial 8–8,5 pt) en voor alle documenten gelijk:
  titel + nummer links met het adres rechts, een gegevensblok (`.doc-gegevens`) en een
  regeltabel met blauwe kopregel (`.doc-regels`), zodat er ±29 regels op één A4 passen.
  Gedeelde onderdelen (gegevensveld, eenheden, landnamen, leveringsconditie) staan in
  `src/pages/inkooporders/documentDelen.jsx`. Documenten zijn in de taal van de
  leverancier/klant (NL/DE/EN).
- `afdruk.css` definieert `--fmid-blauw` en `--fmid-groen` opnieuw op `.afdruk-pagina`,
  omdat de PDF-bijlage buiten de app wordt gerenderd. Houd die waarden gelijk aan `src/index.css`.
- Bedrijfsgegevens (adres, tel./fax, mail, web, bank, IBAN/BIC, KvK, BTW-nummer) staan in
  `BEDRIJF` in `src/pages/inkooporders/bedrijf.js`; hergebruik die.
- Uitgaande mail gebruikt het lettertype **Aptos (Hoofdtekst) 12 pt**, gelijk aan Outlook
  (`MAIL_FONT` in `src/lib/inkooporderMail.js`), en sluit af met de handtekening van de
  afzender (`handtekening` in `users/{uid}`, anders `standaardHandtekening()`).
- Nieuwe documentsoorten (bijv. verkooporder, pakbon) bouw je op dezelfde manier, zodat
  afdrukken en mailen (zie `src/lib/inkooporderMail.js`) hetzelfde blijven werken.

## Werkwijze

- Firestore-regels staan in `firestore.rules`; nieuwe collecties krijgen daar een `match`
  volgens het bestaande patroon (lezen/aanmaken: `isActive()`, verwijderen: `isAdmin()`).
- Mail gaat via de Cloud Function `verstuurMail` (`functions/index.js`): zet een document
  in de collectie `mail`. Geen Firebase Extensions gebruiken.
- Controleer `npm run build` voordat je commit. Wijzigingen die je in de browser kunt zien,
  bekijk je ook echt (inlogscherm, zijbalk, formulier of afdruk).

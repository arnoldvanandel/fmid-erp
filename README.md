# FMID ERP (webapp)

Eerste versie van een eigen bedrijfsapp, als vervanging/aanvulling op onderdelen van
Axapta: inloggen met meerdere collega's, artikelbeheer en voorraadmutaties.
Gebouwd met React + Firebase (Firestore + Authentication + Hosting).

Dit project draait nog niet ergens — je moet het zelf aan een Firebase-project
koppelen. Dat kost ongeveer 15 minuten. Volg de stappen hieronder in volgorde.

## 1. Firebase-project aanmaken

1. Ga naar https://console.firebase.google.com en log in met je Google-account.
2. Klik "Project toevoegen", geef het een naam (bijv. `fmid-erp`) en maak het aan.
   Google Analytics is niet nodig, mag je uitzetten.

## 2. Authentication inschakelen

1. Ga in het linkermenu naar **Build → Authentication** → "Get started".
2. Kies bij "Sign-in method" de provider **E-mail/wachtwoord** en zet die op "Ingeschakeld".
3. Ga naar het tabblad **Users** en klik "Add user" om jezelf als eerste gebruiker
   toe te voegen (jouw e-mailadres + een wachtwoord). Doe dit ook voor elke collega
   die toegang moet krijgen.

## 3. Firestore Database inschakelen

1. Ga naar **Build → Firestore Database** → "Create database".
2. Kies een locatie in de buurt (bijv. `eur3 (Europe)`).
3. Start in **productiemodus** (de rules in dit project regelen de beveiliging, zie
   `firestore.rules`).

## 4. Web-app registreren en configuratie ophalen

1. Ga naar **Project instellingen** (tandwiel-icoon linksboven) → tabblad "Algemeen".
2. Scrol naar "Uw apps" → klik het `</>`-icoon (Web-app toevoegen). Geef een naam,
   Firebase Hosting is optioneel aan te vinken.
3. Je krijgt een `firebaseConfig`-object te zien met waarden zoals `apiKey`,
   `authDomain`, `projectId`, etc. Die heb je nodig in stap 5.

## 5. Project lokaal instellen

```bash
# In deze projectmap:
cp .env.example .env.local
```

Open `.env.local` en vul de waarden in met wat je bij stap 4 hebt gekregen:

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

Installeer daarna de dependencies (vereist internetverbinding naar de npm-registry):

```bash
npm install
```

## 6. Firestore-beveiligingsregels deployen

De regels in `firestore.rules` zorgen dat alleen ingelogde collega's mogen
lezen/schrijven, en dat alleen beheerders kunnen verwijderen of rollen wijzigen.
Installeer eenmalig de Firebase CLI en deploy de regels:

```bash
npm install -g firebase-tools
firebase login
firebase use --add          # kies je zojuist aangemaakte project
firebase deploy --only firestore:rules
```

## 6b. Cloud Storage inschakelen (voor PDF-documenten bij artikelen)

Nodig voor de functie "documenten koppelen aan een artikel" (tabblad "Documenten"
bij een artikel). Zonder deze stap blijft de rest van de app gewoon werken, maar
geeft uploaden de melding dat Storage niet beschikbaar is.

1. Ga in de Firebase Console naar **Build → Storage** → "Get started" en volg de
   wizard (kies dezelfde locatie als je Firestore-database).
2. **Let op:** Cloud Storage vereist tegenwoordig het Blaze-abonnement
   (pay-as-you-go, met een gratis quota). Je wordt gevraagd te upgraden als je
   nog op Spark zit — voor het gebruik hier (een paar PDF's per artikel) blijf
   je ruim binnen de gratis quota.
3. Deploy de storage-rules:

```bash
firebase deploy --only storage
```

## 7. Lokaal draaien

```bash
npm run dev
```

Open de getoonde localhost-URL, log in met het account uit stap 2.

**Tip:** ga meteen naar "Locaties" en maak er minstens één aan (bijv. code "HFD" voor
Hoofdmagazijn) — zonder locatie kun je geen voorraadmutatie boeken.

## 8. Jezelf beheerder maken

De allereerste gebruiker krijgt automatisch de rol "invoer" (net als iedereen).
Om jezelf beheerder te maken, zodat je later andere collega's kunt promoveren via
het scherm "Gebruikers" in de app:

1. Log één keer in met je account (zodat je profiel wordt aangemaakt).
2. Ga in de Firebase Console naar **Firestore Database** → collectie `users` →
   jouw document (te herkennen aan je e-mailadres).
3. Wijzig het veld `role` van `invoer` naar `admin`.
4. Herlaad de app — je ziet nu ook het menu-item "Gebruikers", waarmee je vanaf nu
   andere collega's kunt promoveren zonder terug te hoeven naar de Firebase Console.

## 9. Live zetten (Firebase Hosting)

```bash
npm run build
firebase deploy
```

Firebase geeft je daarna een `https://<project-id>.web.app`-adres dat je kunt delen
met collega's (nadat je hun account hebt aangemaakt, zie stap 2).

## Versiebeheer

Bij elke wijziging die Claude hier doorvoert, wordt het versienummer in
`package.json` opgehoogd (patch-versie, bijv. 0.1.0 → 0.1.1, tenzij het om een
grotere/nieuwe functionaliteit gaat) en meldt Claude in de chat welk
versienummer erbij hoort. Dat versienummer (+ bouwmoment) staat linksonder in
de zijbalk van de app (`v0.1.1 · 11-09-2026 14:40`) — zo zie je in één oogopslag
of een deploy is doorgekomen en welke versie er precies live staat.

---

## Wat zit er nu in, en wat nog niet

**Gebouwd:**
- Inloggen (meerdere gebruikers, met rol beheerder/invoer)
- Artikelen: aanmaken, wijzigen, verwijderen (alleen beheerder), zoeken —
  bewerkscherm met tabbladen (Algemeen, Prijzen, Afmetingen, en — bij een
  bestaand artikel — Voorraad met de actuele stand per locatie en historie).
  Op het tabblad Prijzen ook een inkoop- en verkoopkorting (%) per artikel,
  met een netto-prijs-indicatie
- Locaties/magazijnen: aanmaken en beheren (iedereen die is ingelogd)
- Voorraad: per locatie bijgehouden (zoals in Axapta's "Voorhanden"-scherm) met
  een overzicht per artikel over alle locaties, "laag in voorraad"-signalering,
  mutaties boeken (in/uit/correctie) per locatie met volledige historie,
  atomisch bijgewerkt zodat gelijktijdige boekingen elkaar niet overschrijven
- Documenten bij een artikel: één of meerdere PDF's koppelen (tabblad
  "Documenten"), opslag in Cloud Storage (zie stap 6b), verwijderen alleen
  door een beheerder
- Stuklijsten: bij een artikel met artikeltype "Stuklijst" verschijnt een
  tabblad "Stuklijst" waar je componenten (andere artikelen) met een aantal
  aan koppelt, incl. een kostprijs-indicatie op basis van de actuele
  inkoopprijzen van de componenten
- Route: bij hetzelfde artikeltype "Stuklijst" ook een tabblad "Route" waar
  je bewerkingen (volgnummer, bewerking, bewerkingscentrum, insteltijd en
  tijd per stuk) aan koppelt, incl. een indicatie van de totale insteltijd
  en de totale bewerkingstijd per stuk
- Productieorders: een productieorder aanmaken voor een artikel en een
  aantal, met een automatisch oplopend productieordernummer (PO-000001,
  PO-000002, ...) en een overzicht van alle aangemaakte orders
- Gebruikersbeheer (alleen beheerder): rollen toewijzen

**Nog niet gebouwd** (voor een volgende stap, zoals besproken):
- Klanten- en leveranciersbeheer
- Verkooporders en inkooporders (met regels, net als in Axapta)
- Koppeling tussen orders en voorraadmutaties (automatisch af-/bijboeken),
  inclusief het af-/bijboeken van componenten en eindproduct bij een
  productieorder

## Datamodel (Firestore)

- `users/{uid}` — `email`, `naam`, `role` (`admin` | `invoer`)
- `artikelen/{id}` — `artikelnummer`, `naam`, `eenheid`, `inkoopprijs`,
  `inkoopkorting` (%), `verkoopprijs`, `verkoopkorting` (%), `minVoorraad` (totaal over alle locaties samen — de
  voorraad zelf staat niet op dit document, zie hieronder). `zoeknaam` en
  `artikelengroep` zijn er bewust weer uitgehaald (niet meer in het scherm,
  niet meer nodig gebleken); oude artikelen kunnen deze velden nog wel
  hebben staan, maar de app leest/schrijft ze niet meer. Verder een aantal
  velden overgenomen uit de Axapta-export (`inventtable` en
  `InventTableModule`) zodat een latere import daar 1-op-1 op aansluit:
  `artikeltype` (Artikel | Stuklijst | Dienst), `btwGroep` (Hoog | Laag | Nul |
  Vrijgesteld, uit `TaxItemGroupId`), `levertijd` (dagen, uit `DeliveryTime`),
  `geblokkeerd` (uit `Blocked`), en afmetingen/gewicht `hoogte`, `breedte`,
  `diepte` (mm) en `gewicht` (gram, uit `Height`/`Width`/`Depth`/`NetWeight`)
- `locaties/{id}` — `code`, `naam` (bijv. "HFD" — Hoofdmagazijn)
- `voorraadstanden/{artikelId}__{locatieId}` — `artikelId`, `artikelnummer`,
  `locatieId`, `locatieCode`, `aantal` — de voorraad van één artikel op één
  locatie; opgeteld over alle locaties geeft dit de totale voorraad van een
  artikel
- `voorraadmutaties/{id}` — `artikelId`, `artikelnummer`, `artikelnaam`,
  `locatieId`, `locatieCode`, `type` (`in` | `uit` | `correctie`), `aantal`,
  `voorraadVoor`, `voorraadNa`, `reden`, `gebruiker`, `datum`
- `artikeldocumenten/{id}` — `artikelId`, `artikelnummer`, `bestandsnaam`,
  `storagePath` (locatie in Cloud Storage, onder `artikelen/{artikelId}/...`),
  `url` (download-URL), `grootte` (bytes), `geuploadDoor`, `datum`
- `stuklijstregels/{id}` — `stuklijstArtikelId` (het artikel met artikeltype
  "Stuklijst"), `stuklijstArtikelnummer`, `componentArtikelId`,
  `componentArtikelnummer`, `componentNaam`, `componentEenheid`, `aantal`
- `routeregels/{id}` — `artikelId` (het artikel met artikeltype "Stuklijst"),
  `artikelnummer`, `volgnummer`, `bewerking`, `bewerkingscentrum`,
  `insteltijd` (minuten, eenmalig per order), `tijd` (minuten per stuk)
- `productieorders/{id}` — `ordernummer` (automatisch, bijv. `PO-000001`),
  `artikelId`, `artikelnummer`, `artikelnaam`, `eenheid`, `aantal`, `status`
  (`open` | `gereed`), `aangemaaktDoor`, `datum`
- `counters/{id}` — telt lopende ordernummers op, bijv. `counters/productieorders`
  met veld `laatsteNummer`; via een transactie opgehoogd zodat twee collega's
  nooit hetzelfde ordernummer krijgen

## Belangrijk: dit project kon hier niet volledig getest worden

De cloud-omgeving waarin dit project is gebouwd, heeft geen toegang tot de
npm-registry (bedrijfsbeleid blokkeert dat hier). Alle bestanden zijn met zorg
geschreven en gecontroleerd (geen ontbrekende haakjes o.i.d.), maar `npm install`
en een proefbuild zijn dus niet hier uitgevoerd — doe dat als eerste stap bij jou
lokaal (stap 5) voordat je verder bouwt, zodat eventuele kleine foutjes meteen
zichtbaar zijn.

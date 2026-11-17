# Backup en herstel

Hoe je een backup maakt van FMID ERP, en hoe je na een crash weer draait.

## Wat waar staat

| Onderdeel | Waar | In de backup |
| --- | --- | --- |
| Broncode | GitHub `arnoldvanandel/fmid-erp` | `fmid-erp.bundle` (alle branches) |
| Database (artikelen, orders, klanten, …) | Firestore, project `fmid-erp-fc354` | `firestore\<collectie>.ndjson` |
| Bestanden (PDF's bij artikelen, tekeningen, gereedschapsfoto's) | Firebase Storage | `storage\` (gedeeld) + `storage-objecten.json` |
| Inlogaccounts | Firebase Authentication | `gebruikers.json` |
| Web-app-configuratie | `.env.local` (niet in git) | `config\.env.local` |
| Firestore- en Storage-regels, indexen, functies | in git | in de bundle |
| Live site | Firebase Hosting | opnieuw te bouwen uit de code |

**Niet in de backup** (bewust: dit zijn wachtwoorden). Bewaar ze apart, bijvoorbeeld in een
wachtwoordkluis:

- `SMTP_PASSWORD`: wachtwoord van de mailbox voor `verstuurMail`. Staat in Google Secret Manager.
- `POSTNL_APIKEY`: API-sleutel van PostNL voor `postnlLabel`.
- `firebase-sleutel.json`: serviceaccountsleutel op de Raspberry Pi (`/home/pi/koppeling/`).
  Is hij weg, maak dan een nieuwe aan via Firebase-console > Projectinstellingen > Serviceaccounts.
- `.env` op de Pi: SQL-login voor Axapta (`AX_SQL_GEBRUIKER`, `AX_SQL_WACHTWOORD`).
- Hash-parameters van de wachtwoorden: Firebase-console > Authentication > Gebruikers > ⋮ >
  *Parameters voor wachtwoordhash*. Nodig om `gebruikers.json` met wachtwoorden terug te zetten.

## Backup maken

```bash
npm run backup
```

Standaard gaat de backup naar `Documenten\FMID-backup`. Een andere map, bijvoorbeeld een
externe schijf:

```bash
npm run backup -- E:\FMID-backup
```

- Je moet ingelogd zijn met `npx firebase login`, met een account dat beheerder is van het project.
- Elke backup krijgt een eigen map met datum en tijd (`2026-11-17_1015`). De map `storage\`
  wordt gedeeld: alleen nieuwe of gewijzigde bestanden worden gedownload.
- `overzicht.json` in de backupmap telt wat erin zit. Het script meldt ook commits die niet
  gepusht zijn en bestanden die niet gecommit zijn: die zitten niet in GitHub.
- Kosten: één Firestore-read per document (± 20.000 per keer, een paar cent). Eén keer per week
  is ruim voldoende.
- `gebruikers.json` bevat e-mailadressen en wachtwoordhashes. Houd de backupmap privé en zet
  hem niet in een gedeelde map.
- Kopieer de backupmap af en toe naar een tweede plek, zoals een externe schijf of NAS.
  Een backup op dezelfde pc helpt niet als die pc kapotgaat.

## Herstellen

### Alleen een paar documenten of een collectie kwijt

Probeer het eerst in de emulator, zodat je ziet wat er terugkomt:

```bash
npm run emulators
```

```bash
npm run herstel -- "C:\Users\...\FMID-backup\2026-11-17_1015" --emulator
```

Daarna echt, alleen de collectie(s) die je nodig hebt:

```bash
npm run herstel -- "C:\Users\...\FMID-backup\2026-11-17_1015" --productie --collectie artikelen
```

- Het script vraagt je `HERSTEL` te typen voordat het iets in productie schrijft.
- Documenten uit de backup overschrijven documenten met hetzelfde id. Documenten die na de
  backup zijn aangemaakt, blijven staan.
- De collectie `mail` wordt nooit teruggezet. Anders verstuurt `verstuurMail` alle oude mails opnieuw.
- Voorraad en open orders komen ook van de Pi (Axapta-sync). Na een herstel zet de volgende
  volledige sync (02:30) die gegevens weer gelijk.

### Bestanden kwijt (PDF's, tekeningen)

```bash
npm run herstel -- "<backupmap>" --productie --collectie geen --storage
```

De downloadtokens worden meegenomen, dus de links in Firestore (`tekeningen[].url` e.d.)
blijven werken.

### Alles kwijt: nieuw Firebase-project

Als het project zelf weg is of niet meer te gebruiken:

1. **Code terughalen.** Lukt het niet van GitHub, dan uit de bundle:
   ```bash
   git clone "<backupmap>\fmid-erp.bundle" fmid-erp
   ```
2. **Nieuw project.** Maak een project aan in de Firebase-console (Blaze-abonnement, locatie
   `eur3`). Zet daarin aan: Authentication (e-mail/wachtwoord), Firestore en Storage. Zie
   README.md stap 1–6b.
3. **Configuratie.**
   - Zet het nieuwe project-id in `.firebaserc`.
   - Vul `.env.local` met de web-app-config van het nieuwe project. `config\.env.local` uit de backup is het voorbeeld.
4. **Regels, indexen en functies deployen.** Eerst de geheimen:
   ```bash
   npx firebase functions:secrets:set SMTP_PASSWORD
   ```
   ```bash
   npx firebase functions:secrets:set POSTNL_APIKEY
   ```
   Daarna alles deployen:
   ```bash
   npm run deploy
   ```
5. **Database terugzetten:**
   ```bash
   npm run herstel -- "<backupmap>" --productie --project <nieuw-project-id> --storage
   ```
   Het script gebruikt de bucket `<nieuw-project-id>.firebasestorage.app`. De downloadlinks in
   Firestore wijzen nog naar de oude bucket. Bij een nieuw project moeten die dus worden
   omgezet; dat is een klein script.
6. **Gebruikers terugzetten.** De wachtwoorden gaan alleen mee met de hash-parameters van het
   oude project:
   ```bash
   npx firebase auth:import "<backupmap>\gebruikers.json" --hash-algo=SCRYPT --hash-key=<…> --salt-separator=<…> --rounds=8 --mem-cost=14
   ```
   Zonder die parameters: importeer zonder wachtwoorden, en laat iedereen via *Wachtwoord vergeten*
   een nieuw wachtwoord instellen. De rollen staan in de collectie `users` en komen met stap 5 terug.
7. **Raspberry Pi.**
   - Maak een nieuwe serviceaccountsleutel aan en zet die als `firebase-sleutel.json` op de Pi.
   - Pas het project-id aan in `.env`.
   - Zie `koppeling/README.md`.

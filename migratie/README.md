# Migratie naar een ander Firebase-project

## 1. Nieuw project voorbereiden (Firebase Console, nieuw account)
- Project aanmaken + web-app toevoegen (config bewaren voor `.env.local`).
- Authentication → E-mail/wachtwoord aanzetten.
- Firestore aanmaken (zelfde regio als het oude project).
- Storage aanzetten (Blaze-abonnement nodig).

## 2. Service-account-keys
In **beide** projecten: Projectinstellingen → Serviceaccounts → "Nieuwe privésleutel genereren".
Sla ze op als `migratie/oud.json` en `migratie/nieuw.json`.
Deze bestanden staan in `.gitignore`. **Verwijder ze na afloop.**

## 3. Gebruikers (Authentication)
De gebruikers zijn in het nieuwe project met de hand aangemaakt (andere UID's).
Het script koppelt de profielen in `users/{uid}` (naam + rol) via het e-mailadres
aan de nieuwe UID. Oude gebruikers zonder account in het nieuwe project worden
overgeslagen en gemeld — maak die eerst aan als ze mee moeten.

## 4. Data en bestanden kopiëren
```
cd migratie
npm install
npm run proef     # telt alleen, schrijft niets
npm run echt      # kopieert echt
```
Download-URL's in `artikeldocumenten` worden automatisch omgezet naar de nieuwe bucket.
Heeft een project nog een `*.appspot.com`-bucket, geef die dan mee:
`OUD_BUCKET=xxx.appspot.com npm run echt`.

## 5. App omzetten en deployen
- `.env.local` vullen met de nieuwe web-config.
- `.firebaserc` naar het nieuwe project-ID.
- `npm run deploy` (vanuit de hoofdmap).

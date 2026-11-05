# Axapta → Firebase koppeling (alleen lezen)

`axapta_sync.py` is het script voor de Raspberry Pi. Het leest de voorraad,
de open verkooporders en de tekeningpaden van artikelen uit Axapta
(`AXDB30SP4`) en werkt Firestore bij, op dezelfde manier als `AantalAcs.py`:
FreeTDS, `pyodbc`, cron. Het schrijft niets naar SQL Server.

`sync.js` is een oudere Node-variant die alleen open regels in een losse
collectie zet. De app leest die collectie niet. Gebruik op de Pi het
Python-script.

## Raspberry Pi

Kopieer de map `koppeling/` naar de Pi, bijvoorbeeld `/home/pi/fmid-koppeling/`.
`pyodbc` en FreeTDS staan er al, omdat `AantalAcs.py` daarmee draait.

```bash
cd /home/pi/fmid-koppeling
python3 -m pip install --user -r requirements.txt
# Lukt dat niet op een oude Pi: sudo apt-get install -y python3-requests python3-jwt python3-cryptography
cp .env.example .env
nano .env
```

In `.env` dezelfde SQL-login als `AantalAcs.py` (`AX_SQL_GEBRUIKER` en
`AX_SQL_WACHTWOORD`). Zet het wachtwoord alleen in `.env`, niet in het script.
`GOOGLE_APPLICATION_CREDENTIALS` wijst naar de Firebase-sleutel
(`firebase-sleutel.json` in deze map, niet in git).

```bash
python3 axapta_sync.py --proef
python3 axapta_sync.py
```

Cron, elke 5 minuten:

```
*/5 * * * * cd /home/pi/fmid-koppeling && /usr/bin/python3 axapta_sync.py >> /home/pi/fmid-koppeling/sync.log 2>&1
```

De voorraad komt in `voorraadstanden` (partijen op dezelfde locatie opgeteld).
Open verkooporders komen in `verkooporders` / `verkooporderregels`, met het
Axapta-ordernummer. Een wijziging in FMID op die documenten is bij de volgende
run weer gelijk aan Axapta. Orders die je alleen in FMID aanmaakt (`VO-…`)
blijven buiten de sync.

Tekeningen (Axapta-documenttype `Tekening` op het artikel) komen op het
artikelveld `tekeningen`: naam, map en volledig pad, zoals
`H:\Drawing\Axapta\A106 12-15.pdf`. De artikelpagina opent dat bestand.

Streepjescodes uit `INVENTITEMBARCODE` komen op het artikel: `barcodeDoos`
en `barcodeZak` (streepjescodesetup DOOS en ZAK), plus `barcodeCodes` zodat
de telefoon beide kan scannen. Een gevulde hoeveelheid op die barcode
(bijna altijd leeg in Axapta) wordt `stuksPerDoos` of `stuksPerZak`.

## Node-script (niet gebruiken op de Pi)

Dit programma leest open verkoopregels uit Axapta en zet een kopie in
Firestore (`axaptaOpenstaandeRegels`). Het doet **geen** schrijfacties
op SQL Server.

> **Tip:** de Axapta-server draait SQL Server 2005 op een oudere Windows.
> Zet dit programma bij voorkeur op een **andere machine in het netwerk**
> (Linux of Windows) die `192.168.5.34` kan bereiken. Linux werkt prima met
> de SQL-login hieronder. Dat is even veilig: de login blijft alleen-lezen.

## Eenmalig op de pc / server

### 1. Map aanmaken

**Linux (aanbevolen):**

```bash
sudo mkdir -p /opt/fmid-koppeling
sudo chown "$USER:$USER" /opt/fmid-koppeling
```

Kopieer de inhoud van `koppeling/` uit de git-repo naar `/opt/fmid-koppeling/`.

**Windows:** map `C:\fmid-koppeling\` en daarheen kopiëren.

### 2. Alleen-lezen SQL-login (op de Axapta-server, SSMS als beheerder)

Een SQL-login is het eenvoudigst (werkt ook vanaf een andere pc in het netwerk).
Kies een sterk wachtwoord:

```sql
USE master;
CREATE LOGIN fmid_pickkoppel WITH PASSWORD = 'KiesEenSterkWachtwoord';

USE AXDB30SP4;
CREATE USER fmid_pickkoppel FOR LOGIN fmid_pickkoppel;

GRANT SELECT ON OBJECT::dbo.SALESTABLE TO fmid_pickkoppel;
GRANT SELECT ON OBJECT::dbo.SALESLINE TO fmid_pickkoppel;
GRANT SELECT ON OBJECT::dbo.CUSTTABLE TO fmid_pickkoppel;
GRANT SELECT ON OBJECT::dbo.INVENTITEMBARCODE TO fmid_pickkoppel;

DENY INSERT, UPDATE, DELETE, ALTER ON SCHEMA::dbo TO fmid_pickkoppel;
```

Controle in SSMS: verbind als `fmid_pickkoppel` → `SELECT` op die tabellen werkt,
`UPDATE SALESTABLE SET CUSTACCOUNT = CUSTACCOUNT WHERE 1 = 0` faalt.

### 3. Firebase-sleutel

1. Firebase Console → project `fmid-erp-fc354` → Projectinstellingen → Serviceaccounts  
2. “Nieuwe privésleutel genereren”  
3. Opslaan als `/opt/fmid-koppeling/firebase-sleutel.json` (Linux) of
   `C:\fmid-koppeling\firebase-sleutel.json` (Windows)  
4. Alleen het account dat de sync draait mag dit bestand lezen
   (`chmod 600 firebase-sleutel.json` op Linux)

### 4. Node.js en configuratie

Installeer [Node.js LTS](https://nodejs.org/) (18 of nieuwer).

**Linux:**

```bash
cd /opt/fmid-koppeling
cp .env.example .env
nano .env
npm install
```

**Windows:**

```bat
cd C:\fmid-koppeling
copy .env.example .env
notepad .env
npm install
```

In `.env` minimaal:

```
AX_SQL_SERVER=192.168.5.34
AX_SQL_DATABASE=AXDB30SP4
AX_DATAAREAID=fmd
AX_SQL_GEBRUIKER=fmid_pickkoppel
AX_SQL_WACHTWOORD=...
GOOGLE_APPLICATION_CREDENTIALS=/opt/fmid-koppeling/firebase-sleutel.json
```

- Vul `AX_SQL_GEBRUIKER` en `AX_SQL_WACHTWOORD` met de login uit stap 2.  
- Proef met één klant: `AX_KLANT=5013`  
- Op Windows: pas het pad van `GOOGLE_APPLICATION_CREDENTIALS` aan.

### 5. Eerste run

```bash
npm run proef
npm run sync
```

`proef` leest alleen Axapta. `sync` schrijft naar Firestore.

### 6. Automatisch elke 5 minuten

**Linux (cron):**

```bash
crontab -e
```

Regel toevoegen:

```
*/5 * * * * cd /opt/fmid-koppeling && /usr/bin/node sync.js >> /opt/fmid-koppeling/sync.log 2>&1
```

Controleer met `which node` of het pad naar `node` klopt.

**Windows (Taakplanner):** elke 5 minuten `node.exe sync.js` starten in
`C:\fmid-koppeling`.

## Firestore

- Collectie `axaptaOpenstaandeRegels` — één document per open orderregel  
- Document `axaptaSync/openstaandeRegels` — tijdstip en aantal van de laatste sync  

Regels die niet meer open zijn, worden bij de volgende sync verwijderd.

## Beveiliging

- SQL: alleen `SELECT` op vier tabellen  
- Geen terugschrijven naar Axapta  
- `.env` en `firebase-sleutel.json` staan niet in git  
- SQL-poort blijft binnen het bedrijfsnetwerk  

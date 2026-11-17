#!/usr/bin/env python3
"""Zet één of meer leveranciers uit Axapta over naar FMID ERP.

Leest de leverancier uit VENDTABLE (alleen SELECT) en maakt hem aan in de
collectie `leveranciers`, of werkt hem bij als de leverancierscode al bestaat.
Bij bijwerken blijft staan wat alleen in FMID wordt ingevuld (mailadressen voor
inkooporders, orderformaat, KvK-nummer, sticker-afleveradres).

Gebruik op een Windows-pc in het netwerk van FMID:

    python koppeling/leverancier_overzetten.py 70123            # overzetten
    python koppeling/leverancier_overzetten.py 70123 70456      # meerdere
    python koppeling/leverancier_overzetten.py 70123 --proef    # alleen tonen

Nodig (eenmalig):
  - pip install pyodbc
  - koppeling/.env met de SQL-login (zie .env.example) en AX_SQL_DRIVER=SQL Server
  - ingelogd met `npx firebase login` (zelfde account als voor het deployen)
"""
from __future__ import annotations

import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path

import axapta_sync as ax

PROJECT = 'fmid-erp-fc354'
BASIS = f'https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents'
# Openbare client van de Firebase CLI (zelfde als scripts/backup.mjs).
CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com'
CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi'

# Landcodes uit Axapta (zie ook migratie/axapta-klanten.py).
LANDCODES = {
    'NL': 'Nederland', 'DE': 'Duitsland', 'D': 'Duitsland', 'BE': 'België', 'B': 'België',
    'E': 'Spanje', 'ES': 'Spanje', 'F': 'Frankrijk', 'FR': 'Frankrijk', 'GB': 'Verenigd Koninkrijk',
    'UK': 'Verenigd Koninkrijk', 'SE': 'Zweden', 'S': 'Zweden', 'CZ': 'Tsjechië', 'PL': 'Polen',
    'PO': 'Polen', 'A': 'Oostenrijk', 'AT': 'Oostenrijk', 'CH': 'Zwitserland', 'I': 'Italië',
    'IT': 'Italië', 'DK': 'Denemarken', 'US': 'Verenigde Staten', 'ZA': 'Zuid-Afrika',
}
TAAL = {'nl': 'nl', 'de': 'de', 'en-gb': 'en', 'en-us': 'en', 'en': 'en'}
# BTW-groepen die FMID niet kent (zie BTW_GROEPEN in src/lib/stamgegevens.js).
BTW_OMZETTEN = {'Import': 'Non-EU'}
BTW_GROEPEN = {'NL', 'DE', 'EU-IC', 'EU-belast', 'Non-EU'}

# Velden waar Axapta eigenaar van is; de rest van het document blijft staan.
AXAPTA_VELDEN = (
    'leverancierscode', 'naam', 'contactpersoon', 'email', 'taal', 'leveringsvoorwaarde',
    'telefoon', 'straat', 'postcode', 'plaats', 'land', 'btwNummer', 'btwGroep', 'valuta',
    'betalingstermijn', 'geblokkeerd',
)


# --- Firestore via de login van de Firebase CLI ---------------------------

_token = None


def toegang():
    global _token
    if _token:
        return _token
    pad = Path.home() / '.config' / 'configstore' / 'firebase-tools.json'
    if not pad.exists():
        raise SystemExit('Niet ingelogd bij Firebase. Draai eerst: npx firebase login')
    cfg = json.loads(pad.read_text(encoding='utf-8'))
    body = urllib.parse.urlencode({
        'client_id': CLIENT_ID,
        'client_secret': CLIENT_SECRET,
        'refresh_token': cfg['tokens']['refresh_token'],
        'grant_type': 'refresh_token',
    }).encode()
    with urllib.request.urlopen('https://oauth2.googleapis.com/token', body, timeout=30) as r:
        _token = json.loads(r.read())['access_token']
    return _token


def firestore(methode, url, body=None):
    data = json.dumps(body).encode() if body is not None else None
    verzoek = urllib.request.Request(url, data=data, method=methode, headers={
        'Authorization': f'Bearer {toegang()}',
        'Content-Type': 'application/json',
    })
    try:
        with urllib.request.urlopen(verzoek, timeout=60) as r:
            tekst = r.read()
            return json.loads(tekst) if tekst else {}
    except urllib.error.HTTPError as fout:
        raise SystemExit(f'Firestore-fout {fout.code}: {fout.read()[:400].decode(errors="replace")}')


def zoek_leverancier(code):
    """Bestaande leverancier(s) met deze code: lijst van (doc_id, velden)."""
    antwoord = firestore('POST', f'{BASIS}:runQuery', {
        'structuredQuery': {
            'from': [{'collectionId': 'leveranciers'}],
            'where': {'fieldFilter': {
                'field': {'fieldPath': 'leverancierscode'}, 'op': 'EQUAL', 'value': {'stringValue': code},
            }},
            'limit': 5,
        }
    })
    return [
        (item['document']['name'].rsplit('/', 1)[-1], ax.velden_van(item['document'].get('fields')))
        for item in antwoord if item.get('document')
    ]


# --- Axapta ----------------------------------------------------------------

def kolom(kolommen, alias, uitvoer, *kandidaten):
    naam = ax.eerste_kolom(kolommen, *kandidaten)
    return f'{alias}.{naam} AS {uitvoer}' if naam else f'NULL AS {uitvoer}'


def lees_leverancier(conn, bedrijf, code):
    kolommen = ax.tabelkolommen(conn, 'VENDTABLE')
    velden = ', '.join([
        kolom(kolommen, 'v', 'code', 'ACCOUNTNUM'),
        kolom(kolommen, 'v', 'naam', 'NAME'),
        kolom(kolommen, 'v', 'adres', 'ADDRESS'),
        kolom(kolommen, 'v', 'straat', 'STREET'),
        kolom(kolommen, 'v', 'postcode', 'ZIPCODE'),
        kolom(kolommen, 'v', 'plaats', 'CITY'),
        kolom(kolommen, 'v', 'land', 'COUNTRY', 'COUNTRYREGIONID'),
        kolom(kolommen, 'v', 'telefoon', 'PHONE'),
        kolom(kolommen, 'v', 'mobiel', 'CELLULARPHONE'),
        kolom(kolommen, 'v', 'email', 'EMAIL'),
        kolom(kolommen, 'v', 'btwnummer', 'VATNUM'),
        kolom(kolommen, 'v', 'groep', 'VENDGROUP'),
        kolom(kolommen, 'v', 'btwgroep', 'TAXGROUP'),
        kolom(kolommen, 'v', 'valuta', 'CURRENCY'),
        kolom(kolommen, 'v', 'termijn', 'PAYMTERMID'),
        kolom(kolommen, 'v', 'levering', 'DLVTERM'),
        kolom(kolommen, 'v', 'taal', 'LANGUAGEID'),
        kolom(kolommen, 'v', 'geblokkeerd', 'BLOCKED'),
        kolom(kolommen, 'v', 'contactid', 'CONTACTPERSONID'),
    ])
    cursor = conn.cursor()
    cursor.execute(
        f'SELECT {velden} FROM VENDTABLE v '
        'WHERE LTRIM(RTRIM(v.DATAAREAID)) = ? AND LTRIM(RTRIM(v.ACCOUNTNUM)) = ?',
        (bedrijf, code),
    )
    gevonden = ax.rijen(cursor)
    if not gevonden:
        return None
    rij = {k: ax.tekst(v) if not isinstance(v, (int, float)) else v for k, v in gevonden[0].items()}

    # Contactpersoon staat in Axapta 3.0 in een eigen tabel.
    rij['contactpersoon'] = ''
    if rij.get('contactid') and 'CONTACTPERSONID' in ax.tabelkolommen(conn, 'CONTACTPERSON'):
        cursor.execute(
            'SELECT NAME FROM CONTACTPERSON '
            'WHERE LTRIM(RTRIM(DATAAREAID)) = ? AND LTRIM(RTRIM(CONTACTPERSONID)) = ?',
            (bedrijf, rij['contactid']),
        )
        eerste = cursor.fetchone()
        rij['contactpersoon'] = ax.tekst(eerste[0]) if eerste else ''
    return rij


def splits_adresblok(adres):
    """ADDRESS in Axapta is een blok met regels: straat, dan 'postcode plaats'."""
    regels = [r.strip() for r in re.split(r'[\r\n]+', adres or '') if r.strip()]
    if len(regels) < 2:
        return (regels[0] if regels else ''), '', ''
    m = re.match(r'^((?:[A-Z]{1,2}-)?\d{4,5}(?:\s?[A-Z]{2})?)\s+(.+)$', regels[1])
    if m:
        return regels[0], m.group(1), m.group(2)
    return regels[0], '', regels[1]


def naar_fmid(rij):
    straat, postcode, plaats = rij['straat'], rij['postcode'], rij['plaats']
    if not (postcode and plaats):
        straat, postcode, plaats = splits_adresblok(rij['adres'])
    # STREET kan ook meerdere regels hebben; de eerste is de straat.
    straat = (straat.splitlines() or [''])[0].strip()

    land = LANDCODES.get(rij['land'].upper(), rij['land'])
    if not land and rij['groep'] == 'NL':
        land = 'Nederland'

    btw_nummer = rij['btwnummer']
    if '?' in btw_nummer or '*' in btw_nummer:
        btw_nummer = ''
    btw_groep = rij['btwgroep']
    if btw_groep == 'IC-lev':
        btw_groep = 'EU-IC' if btw_nummer else 'EU-belast'
    btw_groep = BTW_OMZETTEN.get(btw_groep, btw_groep)
    if btw_groep not in BTW_GROEPEN:
        btw_groep = {'NL': 'NL', 'EU': 'EU-IC' if btw_nummer else 'EU-belast'}.get(rij['groep'], 'Non-EU')

    termijn = re.match(r'\d+', rij['termijn'])
    return {
        'leverancierscode': rij['code'],
        'naam': rij['naam'],
        'contactpersoon': rij['contactpersoon'],
        'email': rij['email'],
        'taal': TAAL.get(rij['taal'].lower(), 'nl'),
        'leveringsvoorwaarde': rij['levering'],
        'telefoon': rij['telefoon'] or rij['mobiel'],
        'straat': straat,
        'postcode': postcode,
        'plaats': plaats,
        'land': land,
        'btwNummer': btw_nummer,
        'btwGroep': btw_groep,
        'valuta': rij['valuta'] or 'EUR',
        'betalingstermijn': int(termijn.group()) if termijn else (0 if rij['termijn'] == 'Kontant' else 30),
        'geblokkeerd': bool(rij['geblokkeerd']) and str(rij['geblokkeerd']) not in ('0', 'Nee'),
    }


# --- Overzetten -------------------------------------------------------------

def zet_over(conn, bedrijf, code, proef):
    rij = lees_leverancier(conn, bedrijf, code)
    if not rij:
        print(f'{code}: niet gevonden in Axapta (bedrijf {bedrijf}).')
        return False
    data = naar_fmid(rij)
    bestaand = zoek_leverancier(data['leverancierscode'])
    if len(bestaand) > 1:
        print(f'{code}: staat {len(bestaand)} keer in FMID ERP. Ruim eerst de dubbele op; niets gewijzigd.')
        return False

    print(f'\n{code} — {data["naam"]}')
    if bestaand:
        doc_id, oud = bestaand[0]
        wijzigingen = {k: v for k, v in data.items() if oud.get(k) != v}
        if not wijzigingen:
            print('  Staat al in FMID ERP en is gelijk aan Axapta.')
            return True
        print('  Bestaat al in FMID ERP; wordt bijgewerkt:')
        for k, v in wijzigingen.items():
            print(f'    {k}: {oud.get(k)!r} -> {v!r}')
        schrijf = data
        masker = list(AXAPTA_VELDEN)
    else:
        doc_id = None
        print('  Nieuw in FMID ERP:')
        for k, v in data.items():
            print(f'    {k}: {v!r}')
        schrijf = {**data, 'inkooporderEmails': [], 'orderformaat': 'pdf', 'kvkNummer': ''}
        masker = None

    if proef:
        print('  (proef: niets geschreven)')
        return True

    velden = {k: ax.naar_veld(v) for k, v in schrijf.items()}
    if doc_id:
        firestore('POST', f'{BASIS}:commit', {'writes': [{
            'update': {'name': f'projects/{PROJECT}/databases/(default)/documents/leveranciers/{doc_id}',
                       'fields': velden},
            'updateMask': {'fieldPaths': masker},
        }]})
        print('  Bijgewerkt.')
    else:
        velden['createdAt'] = {'timestampValue': datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')}
        nieuw = firestore('POST', f'{BASIS}/leveranciers', {'fields': velden})
        print(f'  Aangemaakt ({nieuw["name"].rsplit("/", 1)[-1]}).')
    return True


def main():
    argumenten = sys.argv[1:]
    proef = '--proef' in argumenten
    codes = [a.strip() for a in argumenten if not a.startswith('--') and a.strip()]
    if not codes:
        codes = [c.strip() for c in input('Leveranciersnummer(s) in Axapta: ').replace(',', ' ').split() if c.strip()]
    if not codes:
        raise SystemExit('Geen leveranciersnummer opgegeven.')

    ax.laad_env()
    bedrijf = ax.vereist('AX_DATAAREAID')
    conn = ax.verbind()
    try:
        gelukt = [zet_over(conn, bedrijf, code, proef) for code in codes]
    finally:
        conn.close()
    if not all(gelukt):
        raise SystemExit(1)


if __name__ == '__main__':
    main()

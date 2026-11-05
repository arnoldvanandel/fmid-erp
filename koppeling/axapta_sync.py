#!/usr/bin/env python3
"""Axapta → FMID ERP. Alleen SELECT op SQL Server, schrijven alleen naar Firestore.

Axapta blijft leidend. Het script zet:
  - de fysieke voorraad per artikel en locatie in `voorraadstanden`
  - open verkooporders (nog te leveren) in `verkooporders` en `verkooporderregels`
  - tekeningpaden op het artikel (`artikelen.tekeningen`)
  - streepjescodes van doos en zak op het artikel (`barcodeDoos`, `barcodeZak`)

Orders die alleen in FMID bestaan (VO-…) worden niet aangeraakt.
Een order of stand die uit Axapta komt krijgt bron 'axapta' en wordt bij
de volgende run overschreven. Verdwijnt de voorraad of is de order niet
meer open, dan verdwijnt de Axapta-kopie weer uit FMID.

Draaien op de Raspberry Pi (elke 5 minuten), vanuit de map met dit bestand
en een ingevuld .env:

    */5 * * * * cd /home/pi/fmid-koppeling && /usr/bin/python3 axapta_sync.py >> sync.log 2>&1

Proef (leest Axapta, schrijft niets):

    python3 axapta_sync.py --proef
"""
from __future__ import annotations

import os
import sys
from datetime import datetime
from pathlib import Path

import pyodbc

MAP = Path(__file__).resolve().parent
EENHEID = {
    'stuks': 'Stuks',
    'stk': 'Stuks',
    'pcs': 'Stuks',
    'kg': 'Kg',
    'm': 'Meter',
    'l': 'Liter',
    'm2': 'm²',
    'doos': 'Doos',
}

# Kopvelden die we vergelijken. `datum` blijft staan na het aanmaken,
# anders verspringt de sortering in het orderoverzicht bij elke run.
ORDER_VELDEN = (
    'ordernummer', 'klantId', 'klantcode', 'klantNaam', 'status', 'orderdatum',
    'gewensteLeverdatum', 'referentie', 'leveringsvoorwaarde', 'leveringswijze',
    'leveradres', 'factuuradres', 'btwGroep', 'btwNummer', 'valuta',
    'betalingstermijn', 'taal', 'bron', 'axaptaSalesId', 'axaptaGesloten',
)
REGEL_VELDEN = (
    'verkooporderId', 'regelnummer', 'artikelId', 'artikelnummer', 'artikelnaam',
    'eenheid', 'btwGroep', 'aantal', 'prijs', 'leverdatum', 'geleverd',
    'gefactureerd', 'bron',
)


def laad_env():
    pad = MAP / '.env'
    if not pad.exists():
        return
    for regel in pad.read_text(encoding='utf-8').splitlines():
        regel = regel.strip()
        if not regel or regel.startswith('#') or '=' not in regel:
            continue
        sleutel, waarde = regel.split('=', 1)
        os.environ.setdefault(sleutel.strip(), waarde.strip().strip('"').strip("'"))


def vereist(naam):
    waarde = (os.environ.get(naam) or '').strip()
    if not waarde:
        raise SystemExit(f'Omgevingsvariabele {naam} ontbreekt. Vul koppeling/.env in.')
    return waarde


def cs_waarde(waarde):
    return '{' + str(waarde).replace('}', '}}') + '}'


def verbind():
    # Zelfde stuurprogramma als AantalAcs.py op de Pi. FreeTDS staat daar al
    # goed voor SQL Server 2005; de versie zit in freetds.conf, niet hier.
    cs = (
        'DRIVER={FreeTDS};'
        f'SERVER={vereist("AX_SQL_SERVER")};PORT=1433;'
        f'DATABASE={vereist("AX_SQL_DATABASE")};'
        f'UID={cs_waarde(vereist("AX_SQL_GEBRUIKER"))};'
        f'PWD={cs_waarde(os.environ.get("AX_SQL_WACHTWOORD", ""))};'
    )
    return pyodbc.connect(cs, timeout=20)


def neem_slot():
    try:
        import fcntl
    except ImportError:
        return None
    slot = open(MAP / 'axapta_sync.lock', 'w', encoding='utf-8')
    try:
        fcntl.flock(slot, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        print('Vorige sync loopt nog. Deze run slaat over.')
        raise SystemExit(0)
    return slot


def tekst(waarde):
    if waarde is None:
        return ''
    return str(waarde).strip()


def geheel(waarde, standaard):
    try:
        return int(waarde)
    except (TypeError, ValueError):
        return standaard


def getal(waarde):
    if waarde is None or waarde == '':
        return 0.0
    return round(float(waarde), 4)


def datumtekst(waarde):
    if isinstance(waarde, datetime):
        if waarde.year < 1950:
            return ''
        return waarde.strftime('%Y-%m-%d')
    return ''


def rijen(cursor):
    kolommen = [c[0] for c in cursor.description]
    return [{kolommen[i]: row[i] for i in range(len(kolommen))} for row in cursor]


def eenheid_van(code, artikel):
    if artikel and artikel.get('eenheid'):
        return artikel['eenheid']
    ruw = tekst(code)
    return EENHEID.get(ruw.lower(), ruw or 'Stuks')


def taal_van(code, klant):
    if klant and klant.get('taal'):
        return klant['taal']
    laag = tekst(code).lower()
    if laag.startswith('de'):
        return 'de'
    if laag.startswith('en'):
        return 'en'
    return 'nl'


def adres_van(naam, straat, postcode, plaats, land, terugval=None):
    adres = {
        'naam': tekst(naam),
        'straat': tekst(straat),
        'postcode': tekst(postcode),
        'plaats': tekst(plaats),
        'land': tekst(land),
    }
    if any(adres.values()):
        return adres
    return terugval or {'naam': '', 'straat': '', 'postcode': '', 'plaats': '', 'land': ''}


def hoofdadres(klant):
    if not klant:
        return None
    return {
        'naam': klant.get('naam') or '',
        'straat': klant.get('straat') or '',
        'postcode': klant.get('postcode') or '',
        'plaats': klant.get('plaats') or '',
        'land': klant.get('land') or '',
    }


def regel_doc_id(ordernummer, regelnummer):
    return f'ax__{ordernummer}__{regel_sleutel(regelnummer)}'


def regel_sleutel(regelnummer):
    n = float(regelnummer)
    if abs(n - round(n)) < 1e-6:
        return str(int(round(n)))
    return f'{n:.4f}'.rstrip('0').rstrip('.')


def met_scheiding(map_pad):
    map_pad = tekst(map_pad).replace('/', '\\')
    if map_pad and map_pad[-1] != '\\':
        map_pad += '\\'
    return map_pad


def tekeningpad(map_pad, bestand, extensie):
    """DOCUVALUE bewaart map, bestandsnaam en type apart.

    De bestandsnaam mag punten bevatten (CSI-E133.363); de extensie komt
    uit FILETYPE en hoort er alleen achter als die er nog niet staat.
    """
    map_pad = met_scheiding(map_pad)
    bestand = tekst(bestand)
    ext = tekst(extensie).lstrip('.')
    if not map_pad or not bestand:
        return '', ''
    if ext and not bestand.lower().endswith('.' + ext.lower()):
        bestand = f'{bestand}.{ext}'
    return map_pad + bestand, bestand


def lees_tekeningen(conn, bedrijf):
    """Tekeningen per artikelnummer (hoofdletters).

    In Axapta hangt een tekening aan het artikel via DOCUREF
    (TYPEID Tekening, REFTABLEID 175 = InventTable). Het bestandspad
    staat in DOCUVALUE: PATH + FILENAME + FILETYPE, bijvoorbeeld
    H:\\Drawing\\Axapta\\ + A106 12-15 + pdf.
    """
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT
          LTRIM(RTRIM(i.ITEMID)) AS artikelnummer,
          LTRIM(RTRIM(r.NAME)) AS naam,
          LTRIM(RTRIM(v.PATH)) AS map,
          LTRIM(RTRIM(v.FILENAME)) AS bestand,
          LTRIM(RTRIM(v.FILETYPE)) AS type
        FROM DOCUREF r
        JOIN INVENTTABLE i
          ON i.RECID = r.REFRECID
         AND i.DATAAREAID = r.REFCOMPANYID
        JOIN DOCUVALUE v
          ON v.RECID = r.VALUERECID
        WHERE r.TYPEID = 'Tekening'
          AND r.REFTABLEID = 175
          AND LTRIM(RTRIM(r.REFCOMPANYID)) = ?
          AND v.FILENAME IS NOT NULL
          AND LTRIM(RTRIM(v.FILENAME)) <> ''
          AND v.PATH IS NOT NULL
          AND LTRIM(RTRIM(v.PATH)) <> ''
        """,
        (bedrijf,),
    )
    per_artikel = {}
    for rij in rijen(cursor):
        nummer = tekst(rij['artikelnummer']).upper()
        pad, bestand = tekeningpad(rij['map'], rij['bestand'], rij['type'])
        if not nummer or not pad:
            continue
        lijst = per_artikel.setdefault(nummer, [])
        if any(t['pad'].upper() == pad.upper() for t in lijst):
            continue
        lijst.append({
            'naam': tekst(rij['naam']) or bestand,
            'pad': pad,
            'map': met_scheiding(rij['map']),
            'bestand': bestand,
            'type': tekst(rij['type']).lstrip('.').lower(),
        })
    for lijst in per_artikel.values():
        lijst.sort(key=lambda t: t['pad'].upper())
    return per_artikel


def lees_barcodes(conn, bedrijf):
    """Streepjescodes per artikelnummer (hoofdletters).

    In Axapta hangen die aan INVENTITEMBARCODE. BARCODESETUPID is DOOS of
    ZAK; dezelfde code staat soms dubbel. QTY is het aantal stuks in die
    verpakking, maar is bijna overal 0 en alleen gevuld als het > 0 is.
    """
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT
          LTRIM(RTRIM(ITEMID)) AS artikelnummer,
          LTRIM(RTRIM(BARCODESETUPID)) AS soort,
          LTRIM(RTRIM(ITEMBARCODE)) AS code,
          QTY AS aantal
        FROM INVENTITEMBARCODE
        WHERE LTRIM(RTRIM(DATAAREAID)) = ?
          AND ITEMBARCODE IS NOT NULL
          AND LTRIM(RTRIM(ITEMBARCODE)) <> ''
        """,
        (bedrijf,),
    )
    per_artikel = {}
    for rij in rijen(cursor):
        nummer = tekst(rij['artikelnummer']).upper()
        soort = tekst(rij['soort']).upper()
        code = tekst(rij['code'])
        if not nummer or not code or soort not in ('DOOS', 'ZAK'):
            continue
        gegevens = per_artikel.setdefault(nummer, {'doos': '', 'zak': '', 'stuksPerDoos': None, 'stuksPerZak': None})
        veld = 'doos' if soort == 'DOOS' else 'zak'
        if not gegevens[veld]:
            gegevens[veld] = code
        aantal = getal(rij['aantal'])
        if aantal > 0:
            sleutel = 'stuksPerDoos' if soort == 'DOOS' else 'stuksPerZak'
            if gegevens[sleutel] is None:
                gegevens[sleutel] = int(aantal) if aantal == int(aantal) else aantal
    return per_artikel


def barcode_payload(gegevens):
    doos = gegevens.get('doos') or ''
    zak = gegevens.get('zak') or ''
    codes = []
    for code in (doos, zak):
        if code and code not in codes:
            codes.append(code)
    payload = {
        'barcodeDoos': doos,
        'barcodeZak': zak,
        'barcode': doos or zak,
        'barcodeCodes': codes,
    }
    if gegevens.get('stuksPerDoos'):
        payload['stuksPerDoos'] = gegevens['stuksPerDoos']
    if gegevens.get('stuksPerZak'):
        payload['stuksPerZak'] = gegevens['stuksPerZak']
    return payload


def zoek_met_barcodes(artikel, codes):
    zoek = list(artikel.get('zoek') or [])
    aanwezig = {str(term).lower() for term in zoek}
    for code in codes:
        laag = code.lower()
        if laag and laag not in aanwezig:
            zoek.append(laag)
            aanwezig.add(laag)
    return zoek


def zelfde_getal(a, b):
    try:
        return float(a) == float(b)
    except (TypeError, ValueError):
        return False


def barcodes_gelijk(payload, artikel):
    if tekst(artikel.get('barcodeDoos')) != payload['barcodeDoos']:
        return False
    if tekst(artikel.get('barcodeZak')) != payload['barcodeZak']:
        return False
    if tekst(artikel.get('barcode')) != payload['barcode']:
        return False
    if list(artikel.get('barcodeCodes') or []) != payload['barcodeCodes']:
        return False
    if 'stuksPerDoos' in payload and not zelfde_getal(artikel.get('stuksPerDoos'), payload['stuksPerDoos']):
        return False
    if 'stuksPerZak' in payload and not zelfde_getal(artikel.get('stuksPerZak'), payload['stuksPerZak']):
        return False
    if payload['barcodeCodes'] and list(artikel.get('zoek') or []) != zoek_met_barcodes(artikel, payload['barcodeCodes']):
        return False
    return True


def schrijf_barcodes(db, barcodes, artikelen):
    """Zet doos- en zakbarcode op het artikel. Leegmaken als Axapta ze kwijt is."""
    batches = Batches(db)
    bijgewerkt = 0
    gewist = 0
    overgeslagen = 0
    for nummer, gegevens in barcodes.items():
        artikel = artikelen.get(nummer)
        if not artikel:
            overgeslagen += 1
            continue
        payload = barcode_payload(gegevens)
        if payload['barcodeCodes']:
            payload['zoek'] = zoek_met_barcodes(artikel, payload['barcodeCodes'])
        if barcodes_gelijk(payload, artikel):
            continue
        batches.set('artikelen', artikel['id'], payload)
        bijgewerkt += 1
    leeg = {'barcodeDoos': '', 'barcodeZak': '', 'barcode': '', 'barcodeCodes': []}
    for nummer, artikel in artikelen.items():
        if nummer in barcodes:
            continue
        if not (artikel.get('barcodeDoos') or artikel.get('barcodeZak') or artikel.get('barcodeCodes')):
            continue
        batches.set('artikelen', artikel['id'], leeg)
        gewist += 1
    batches.klaar()
    return {
        'artikelen': len(barcodes),
        'bijgewerkt': bijgewerkt,
        'gewist': gewist,
        'overgeslagen': overgeslagen,
    }


def tekeningen_gelijk(nieuw, oud):
    if not isinstance(oud, list) or len(nieuw) != len(oud):
        return False
    velden = ('naam', 'pad', 'map', 'bestand', 'type')
    return all(all(a.get(veld) == b.get(veld) for veld in velden) for a, b in zip(nieuw, oud))


def schrijf_tekeningen(db, tekeningen, artikelen):
    """Zet `tekeningen` op het artikel. Leegmaken als Axapta de tekening kwijt is."""
    batches = Batches(db)
    bijgewerkt = 0
    gewist = 0
    overgeslagen = 0
    for nummer, lijst in tekeningen.items():
        artikel = artikelen.get(nummer)
        if not artikel:
            overgeslagen += 1
            continue
        if tekeningen_gelijk(lijst, artikel.get('tekeningen')):
            continue
        batches.set('artikelen', artikel['id'], {'tekeningen': lijst})
        bijgewerkt += 1
    for nummer, artikel in artikelen.items():
        if nummer in tekeningen or not artikel.get('tekeningen'):
            continue
        batches.wisveld('artikelen', artikel['id'], 'tekeningen')
        gewist += 1
    batches.klaar()
    return {
        'artikelen': len(tekeningen),
        'bijgewerkt': bijgewerkt,
        'gewist': gewist,
        'overgeslagen': overgeslagen,
    }


def lees_voorraad(conn, bedrijf):
    """Fysieke voorraad per artikel en locatie.

    Zelfde optelling als het Axapta-scherm Voorhanden:
    geboekt + ontvangen − afgeboekt − gepickt. Partijen op dezelfde
    locatie worden opgeteld. Een lege locatie valt terug op het magazijn.
    """
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT
          LTRIM(RTRIM(s.ITEMID)) AS artikelnummer,
          LTRIM(RTRIM(d.WMSLOCATIONID)) AS locatie,
          LTRIM(RTRIM(d.INVENTLOCATIONID)) AS magazijn,
          SUM(s.POSTEDQTY + s.RECEIVED - s.DEDUCTED - s.PICKED) AS aantal
        FROM INVENTSUM s
        JOIN INVENTDIM d
          ON d.INVENTDIMID = s.INVENTDIMID
         AND d.DATAAREAID = s.DATAAREAID
        WHERE LTRIM(RTRIM(s.DATAAREAID)) = ?
        GROUP BY
          LTRIM(RTRIM(s.ITEMID)),
          LTRIM(RTRIM(d.WMSLOCATIONID)),
          LTRIM(RTRIM(d.INVENTLOCATIONID))
        HAVING SUM(s.POSTEDQTY + s.RECEIVED - s.DEDUCTED - s.PICKED) <> 0
        """,
        (bedrijf,),
    )
    per_plek = {}
    for rij in rijen(cursor):
        artikel = tekst(rij['artikelnummer']).upper()
        locatie = tekst(rij['locatie']).upper() or tekst(rij['magazijn']).upper()
        if not artikel or not locatie:
            continue
        sleutel = (artikel, locatie)
        per_plek[sleutel] = round(per_plek.get(sleutel, 0.0) + getal(rij['aantal']), 4)
    return {sleutel: aantal for sleutel, aantal in per_plek.items() if aantal != 0}


def tabelkolommen(conn, tabel):
    cursor = conn.cursor()
    cursor.execute(
        'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE UPPER(TABLE_NAME) = ?',
        (tabel.upper(),),
    )
    return {tekst(rij[0]).upper() for rij in cursor}


def eerste_kolom(kolommen, *kandidaten):
    for naam in kandidaten:
        if naam.upper() in kolommen:
            return naam.upper()
    return None


def sql_tekst(alias, kolommen, kandidaten, uitvoer):
    kolom = eerste_kolom(kolommen, *kandidaten)
    if not kolom:
        return f"CAST('' AS varchar(10)) AS {uitvoer}"
    return f'LTRIM(RTRIM({alias}.{kolom})) AS {uitvoer}'


def sql_waarde(alias, kolommen, kandidaten, uitvoer):
    kolom = eerste_kolom(kolommen, *kandidaten)
    if not kolom:
        return f'CAST(NULL AS datetime) AS {uitvoer}'
    return f'{alias}.{kolom} AS {uitvoer}'


def lees_open_orders(conn, bedrijf):
    """Alle regels van verkooporders die nog een te leveren restant hebben.

    SALESTYPE 3 is een verkooporder (geen offerte, journaal of retour).
    Axapta 3.0 heeft geen CREATEDDATETIME; de datumkolom wordt gekozen
    uit de kolommen die in deze database echt bestaan.
    """
    kop = tabelkolommen(conn, 'SALESTABLE')
    regel = tabelkolommen(conn, 'SALESLINE')
    if 'SALESID' not in kop or 'SALESID' not in regel:
        raise SystemExit('SALESTABLE of SALESLINE niet gevonden in Axapta.')
    print(
        'Orderdatum-kolom:',
        eerste_kolom(kop, 'CREATEDDATETIME', 'CREATEDDATE') or '(geen)',
    )
    cursor = conn.cursor()
    cursor.execute(
        f"""
        SELECT
          {sql_tekst('s', kop, ('SALESID',), 'ordernummer')},
          {sql_tekst('s', kop, ('CUSTACCOUNT',), 'klantcode')},
          {sql_tekst('s', kop, ('SALESNAME',), 'klantnaam')},
          {sql_waarde('s', kop, ('SALESSTATUS',), 'axaptaStatus')},
          {sql_waarde('s', kop, ('CREATEDDATETIME', 'CREATEDDATE'), 'orderdatum')},
          {sql_waarde('s', kop, ('SHIPPINGDATEREQUESTED', 'RECEIPTDATEREQUESTED', 'DELIVERYDATE'), 'leverdatum')},
          {sql_tekst('s', kop, ('CUSTOMERREF',), 'referentie')},
          {sql_tekst('s', kop, ('PURCHORDERFORMNUM',), 'klantorder')},
          {sql_tekst('s', kop, ('DLVTERM',), 'leveringsvoorwaarde')},
          {sql_tekst('s', kop, ('DLVMODE',), 'leveringswijze')},
          {sql_tekst('s', kop, ('CURRENCYCODE',), 'valuta')},
          {sql_tekst('s', kop, ('LANGUAGEID',), 'taal')},
          {sql_tekst('s', kop, ('DELIVERYNAME',), 'levernaam')},
          {sql_tekst('s', kop, ('DELIVERYADDRESS',), 'leverstraat')},
          {sql_tekst('s', kop, ('DELIVERYZIPCODE',), 'leverpostcode')},
          {sql_tekst('s', kop, ('DELIVERYCOUNTY', 'DELIVERYCITY'), 'leverplaats')},
          {sql_tekst('s', kop, ('DELIVERYCOUNTRYREGIONID',), 'leverland')},
          {sql_waarde('l', regel, ('LINENUM',), 'regelnummer')},
          {sql_tekst('l', regel, ('ITEMID',), 'artikelnummer')},
          {sql_tekst('l', regel, ('NAME',), 'artikelnaam')},
          {sql_waarde('l', regel, ('SALESQTY',), 'besteld')},
          {sql_waarde('l', regel, ('REMAINSALESPHYSICAL',), 'teLeveren')},
          {sql_waarde('l', regel, ('REMAINSALESFINANCIAL',), 'teFactureren')},
          {sql_waarde('l', regel, ('SALESPRICE',), 'prijs')},
          {sql_waarde('l', regel, ('PRICEUNIT',), 'prijsPer')},
          {sql_tekst('l', regel, ('SALESUNIT',), 'eenheid')},
          {sql_waarde('l', regel, ('SHIPPINGDATEREQUESTED', 'RECEIPTDATEREQUESTED', 'CONFIRMEDDLV'), 'regelleverdatum')}
        FROM SALESLINE l
        JOIN SALESTABLE s
          ON s.SALESID = l.SALESID
         AND s.DATAAREAID = l.DATAAREAID
        WHERE LTRIM(RTRIM(s.DATAAREAID)) = ?
          AND s.SALESTYPE = 3
          AND s.SALESSTATUS < 4
          AND EXISTS (
            SELECT 1
            FROM SALESLINE openregel
            WHERE openregel.SALESID = s.SALESID
              AND openregel.DATAAREAID = s.DATAAREAID
              AND openregel.REMAINSALESPHYSICAL > 0
          )
        ORDER BY s.SALESID, l.LINENUM
        """,
        (bedrijf,),
    )
    orders = {}
    for rij in rijen(cursor):
        nummer = tekst(rij['ordernummer'])
        if not nummer:
            continue
        orders.setdefault(nummer, {'kop': rij, 'regels': []})['regels'].append(rij)
    return orders


def naar_veld(waarde):
    if waarde is None:
        return {'nullValue': None}
    if isinstance(waarde, bool):
        return {'booleanValue': waarde}
    if isinstance(waarde, datetime):
        return {'timestampValue': waarde.strftime('%Y-%m-%dT%H:%M:%SZ')}
    if isinstance(waarde, int):
        return {'integerValue': str(waarde)}
    if isinstance(waarde, float):
        return {'doubleValue': waarde}
    if isinstance(waarde, dict):
        return {'mapValue': {'fields': {k: naar_veld(v) for k, v in waarde.items()}}}
    if isinstance(waarde, list):
        return {'arrayValue': {'values': [naar_veld(v) for v in waarde]}}
    return {'stringValue': str(waarde)}


def van_veld(waarde):
    if not waarde:
        return None
    if 'stringValue' in waarde:
        return waarde['stringValue']
    if 'integerValue' in waarde:
        return int(waarde['integerValue'])
    if 'doubleValue' in waarde:
        return float(waarde['doubleValue'])
    if 'booleanValue' in waarde:
        return waarde['booleanValue']
    if 'nullValue' in waarde:
        return None
    if 'timestampValue' in waarde:
        return waarde['timestampValue']
    if 'mapValue' in waarde:
        return {k: van_veld(v) for k, v in waarde['mapValue'].get('fields', {}).items()}
    if 'arrayValue' in waarde:
        return [van_veld(v) for v in waarde['arrayValue'].get('values', [])]
    return None


def velden_van(fields):
    return {sleutel: van_veld(waarde) for sleutel, waarde in (fields or {}).items()}


class Firestore:
    """Firestore via de REST-API. Geen firebase-admin: die past niet op de Python van de Pi."""

    def __init__(self, sleutelpad):
        import json
        self.sleutel = json.loads(Path(sleutelpad).read_text(encoding='utf-8'))
        self.project = self.sleutel['project_id']
        self.basis = (
            f'https://firestore.googleapis.com/v1/projects/{self.project}'
            '/databases/(default)/documents'
        )
        self._token = None
        self._token_tot = 0

    def _toegang(self):
        import time
        import jwt
        import requests
        nu = int(time.time())
        if self._token and nu < self._token_tot - 60:
            return self._token
        claim = {
            'iss': self.sleutel['client_email'],
            'scope': 'https://www.googleapis.com/auth/datastore',
            'aud': 'https://oauth2.googleapis.com/token',
            'iat': nu,
            'exp': nu + 3600,
        }
        assertion = jwt.encode(claim, self.sleutel['private_key'], algorithm='RS256')
        if isinstance(assertion, bytes):
            assertion = assertion.decode('ascii')
        antwoord = requests.post(
            'https://oauth2.googleapis.com/token',
            data={'grant_type': 'urn:ietf:params:oauth:grant-type:jwt-bearer', 'assertion': assertion},
            timeout=30,
        )
        if antwoord.status_code >= 400:
            raise SystemExit(f'Firebase-login mislukt: {antwoord.status_code} {antwoord.text[:300]}')
        self._token = antwoord.json()['access_token']
        self._token_tot = nu + 3600
        return self._token

    def _vraag(self, methode, url, body=None, params=None):
        import requests
        antwoord = requests.request(
            methode,
            url,
            headers={'Authorization': f'Bearer {self._toegang()}'},
            json=body,
            params=params,
            timeout=120,
        )
        if antwoord.status_code >= 400:
            raise SystemExit(f'Firestore-fout: {antwoord.status_code} {antwoord.text[:500]}')
        if not antwoord.text:
            return {}
        return antwoord.json()

    def documentnaam(self, collectie, doc_id):
        return f'projects/{self.project}/databases/(default)/documents/{collectie}/{doc_id}'

    def alle(self, collectie):
        from urllib.parse import unquote
        docs = {}
        token = None
        while True:
            params = {'pageSize': 300}
            if token:
                params['pageToken'] = token
            data = self._vraag('GET', f'{self.basis}/{collectie}', params=params)
            for doc in data.get('documents') or []:
                doc_id = unquote(doc['name'].rsplit('/', 1)[-1])
                docs[doc_id] = velden_van(doc.get('fields'))
            token = data.get('nextPageToken')
            if not token:
                return docs

    def waar(self, collectie, veld, waarde):
        from urllib.parse import unquote
        body = {
            'structuredQuery': {
                'from': [{'collectionId': collectie}],
                'where': {
                    'fieldFilter': {
                        'field': {'fieldPath': veld},
                        'op': 'EQUAL',
                        'value': naar_veld(waarde),
                    }
                },
            }
        }
        docs = {}
        for item in self._vraag('POST', f'{self.basis}:runQuery', body):
            doc = item.get('document')
            if not doc:
                continue
            docs[unquote(doc['name'].rsplit('/', 1)[-1])] = velden_van(doc.get('fields'))
        return docs

    def bestaat(self, collectie, veld, waarde):
        return bool(self.waar(collectie, veld, waarde))

    def commit(self, writes):
        for i in range(0, len(writes), 400):
            self._vraag('POST', f'{self.basis}:commit', {'writes': writes[i:i + 400]})

    def schrijfopdracht(self, collectie, doc_id, data):
        return {
            'update': {
                'name': self.documentnaam(collectie, doc_id),
                'fields': {sleutel: naar_veld(waarde) for sleutel, waarde in data.items()},
            },
            'updateMask': {'fieldPaths': list(data.keys())},
        }

    def wisopdracht(self, collectie, doc_id):
        return {'delete': self.documentnaam(collectie, doc_id)}

    def wisveldopdracht(self, collectie, doc_id, veld):
        # Veld in het masker, maar niet in het document: Firestore wist het veld.
        return {
            'update': {'name': self.documentnaam(collectie, doc_id), 'fields': {}},
            'updateMask': {'fieldPaths': [veld]},
        }


def index_op(db, collectie, veld):
    index = {}
    for doc_id, data in db.alle(collectie).items():
        sleutel = tekst(data.get(veld)).upper()
        if sleutel and sleutel not in index:
            index[sleutel] = {'id': doc_id, **data}
    return index


def zelfde(nieuw, oud, velden):
    return all(nieuw.get(veld) == oud.get(veld) for veld in velden)


class Batches:
    def __init__(self, db):
        self.db = db
        self.writes = []

    def set(self, collectie, doc_id, data):
        self.writes.append(self.db.schrijfopdracht(collectie, doc_id, data))
        self._tel()

    def delete(self, collectie, doc_id):
        self.writes.append(self.db.wisopdracht(collectie, doc_id))
        self._tel()

    def wisveld(self, collectie, doc_id, veld):
        self.writes.append(self.db.wisveldopdracht(collectie, doc_id, veld))
        self._tel()

    def _tel(self):
        if len(self.writes) >= 400:
            self.db.commit(self.writes)
            self.writes = []

    def klaar(self):
        if self.writes:
            self.db.commit(self.writes)
            self.writes = []


def schrijf_voorraad(db, standen, artikelen, locaties):
    import uuid

    bestaand = db.alle('voorraadstanden')

    batches = Batches(db)
    gezien = set()
    overgeslagen = []
    overgeslagen_aantal = 0
    bijgewerkt = 0
    verwijderd = 0

    for (artikelnummer, locatiecode), aantal in standen.items():
        artikel = artikelen.get(artikelnummer)
        locatie = locaties.get(locatiecode)
        if not artikel or not locatie:
            overgeslagen_aantal += 1
            if len(overgeslagen) < 20:
                ontbreekt = 'artikel' if not artikel else 'locatie'
                overgeslagen.append(f'{artikelnummer} @ {locatiecode} ({ontbreekt} niet in FMID)')
            continue
        doc_id = f'{artikel["id"]}__{locatie["id"]}'
        gezien.add(doc_id)
        payload = {
            'artikelId': artikel['id'],
            'artikelnummer': artikel.get('artikelnummer') or artikelnummer,
            'locatieId': locatie['id'],
            'locatieCode': locatie.get('code') or locatiecode,
            'aantal': aantal,
            'bron': 'axapta',
        }
        oud = bestaand.get(doc_id)
        if oud and zelfde(payload, oud, ('artikelId', 'artikelnummer', 'locatieId', 'locatieCode', 'aantal', 'bron')):
            continue
        batches.set('voorraadstanden', doc_id, payload)
        voor = getal(oud.get('aantal')) if oud else 0.0
        if voor != aantal:
            batches.set('voorraadmutaties', uuid.uuid4().hex, {
                'artikelId': artikel['id'],
                'artikelnummer': payload['artikelnummer'],
                'artikelnaam': artikel.get('naam') or '',
                'locatieId': locatie['id'],
                'locatieCode': payload['locatieCode'],
                'type': 'correctie',
                'aantal': aantal,
                'voorraadVoor': voor,
                'voorraadNa': aantal,
                'reden': 'Stand uit Axapta',
                'bron': 'import',
                'gebruiker': 'Axapta',
                'datum': datetime.utcnow(),
            })
        bijgewerkt += 1

    for doc_id, oud in bestaand.items():
        if doc_id in gezien or oud.get('bron') != 'axapta':
            continue
        voor = getal(oud.get('aantal'))
        if voor != 0 and oud.get('artikelId'):
            batches.set('voorraadmutaties', uuid.uuid4().hex, {
                'artikelId': oud.get('artikelId') or '',
                'artikelnummer': oud.get('artikelnummer') or '',
                'artikelnaam': '',
                'locatieId': oud.get('locatieId') or '',
                'locatieCode': oud.get('locatieCode') or '',
                'type': 'correctie',
                'aantal': 0,
                'voorraadVoor': voor,
                'voorraadNa': 0,
                'reden': 'Geen voorraad meer in Axapta',
                'bron': 'import',
                'gebruiker': 'Axapta',
                'datum': datetime.utcnow(),
            })
        batches.delete('voorraadstanden', doc_id)
        verwijderd += 1

    batches.klaar()
    return {
        'axapta': len(standen),
        'bijgewerkt': bijgewerkt,
        'verwijderd': verwijderd,
        'overgeslagenAantal': overgeslagen_aantal,
        'overgeslagen': overgeslagen,
    }


def order_payload(kop, regels, klant):
    besteld_geleverd = any(getal(r['besteld']) - getal(r['teLeveren']) > 0 for r in regels)
    nog_open = any(getal(r['teLeveren']) > 0 for r in regels)
    if int(kop['axaptaStatus'] or 0) == 4:
        status = 'geannuleerd'
    elif besteld_geleverd and nog_open:
        status = 'deels geleverd'
    elif not nog_open:
        status = 'geleverd'
    else:
        status = 'bevestigd'

    factuur = hoofdadres(klant)
    lever = adres_van(
        kop['levernaam'], kop['leverstraat'], kop['leverpostcode'], kop['leverplaats'], kop['leverland'],
        factuur,
    )
    referentie = tekst(kop['referentie']) or tekst(kop['klantorder'])
    return {
        'ordernummer': tekst(kop['ordernummer']),
        'klantId': klant['id'] if klant else '',
        'klantcode': tekst(kop['klantcode']),
        'klantNaam': (klant.get('naam') if klant else '') or tekst(kop['klantnaam']),
        'status': status,
        'orderdatum': datumtekst(kop['orderdatum']),
        'gewensteLeverdatum': datumtekst(kop['leverdatum']),
        'referentie': referentie,
        'contactpersoon': (klant.get('contactpersoon') if klant else '') or '',
        'verkoper': '',
        'leveringsvoorwaarde': tekst(kop['leveringsvoorwaarde']),
        'leveringswijze': tekst(kop['leveringswijze']),
        'leveradresKeuze': 'hoofdadres',
        'leveradres': lever,
        'factuuradresKeuze': 'hoofdadres',
        'factuuradres': factuur or lever,
        'btwGroep': (klant.get('btwGroep') if klant else '') or 'NL',
        'btwNummer': (klant.get('btwNummer') if klant else '') or '',
        'valuta': tekst(kop['valuta']) or 'EUR',
        'betalingstermijn': geheel(klant.get('betalingstermijn') if klant else None, 30),
        'taal': taal_van(kop['taal'], klant),
        'opmerkingen': '',
        'aangemaaktDoor': 'Axapta',
        'bron': 'axapta',
        'axaptaSalesId': tekst(kop['ordernummer']),
        'axaptaGesloten': False,
        'datum': kop['orderdatum'] if isinstance(kop['orderdatum'], datetime) and kop['orderdatum'].year >= 1950 else datetime.utcnow(),
    }


def regel_payload(order_id, rij, artikel):
    per = getal(rij['prijsPer']) or 1.0
    besteld = getal(rij['besteld'])
    return {
        'verkooporderId': order_id,
        'regelnummer': getal(rij['regelnummer']),
        'artikelId': artikel['id'] if artikel else '',
        'artikelnummer': tekst(rij['artikelnummer']),
        'artikelnaam': (artikel.get('naam') if artikel else '') or tekst(rij['artikelnaam']),
        'eenheid': eenheid_van(rij['eenheid'], artikel),
        'btwGroep': (artikel.get('btwGroep') if artikel else '') or 'Hoog',
        'aantal': besteld,
        'prijs': round(getal(rij['prijs']) / per, 4),
        'leverdatum': datumtekst(rij['regelleverdatum']) or datumtekst(rij['leverdatum']),
        'klantArtikelnummer': '',
        'geleverd': round(max(0.0, besteld - getal(rij['teLeveren'])), 4),
        'gefactureerd': round(max(0.0, besteld - getal(rij['teFactureren'])), 4),
        'bron': 'axapta',
    }


def heeft_documenten(db, order_id):
    for collectie in ('pakbonnen', 'facturen'):
        if db.bestaat(collectie, 'verkooporderId', order_id):
            return True
    return False


def schrijf_orders(db, orders, artikelen, klanten):
    bestaand = db.waar('verkooporders', 'bron', 'axapta')
    regels_nu = {}
    for doc_id, data in db.waar('verkooporderregels', 'bron', 'axapta').items():
        regels_nu.setdefault(data.get('verkooporderId'), {})[doc_id] = data

    batches = Batches(db)
    open_ids = set()
    bijgewerkt = 0
    zonder_klant = []

    for nummer, order in orders.items():
        kop = order['kop']
        klant = klanten.get(tekst(kop['klantcode']).upper())
        if not klant and len(zonder_klant) < 20:
            zonder_klant.append(f'{nummer} klant {tekst(kop["klantcode"])}')
        order_id = 'ax__' + nummer.replace('/', '_').replace('\\', '_')
        open_ids.add(order_id)
        payload = order_payload(kop, order['regels'], klant)
        oud = bestaand.get(order_id)
        if not (oud and zelfde(payload, oud, ORDER_VELDEN)):
            # datum alleen bij de eerste keer, zodat een update de sortering niet verplaatst
            schrijven = dict(payload)
            if oud:
                schrijven.pop('datum', None)
            batches.set('verkooporders', order_id, schrijven)
            bijgewerkt += 1

        gezien = set()
        for rij in order['regels']:
            artikel = artikelen.get(tekst(rij['artikelnummer']).upper())
            regel_id = regel_doc_id(nummer, rij['regelnummer'])
            gezien.add(regel_id)
            regel = regel_payload(order_id, rij, artikel)
            oud_regel = regels_nu.get(order_id, {}).get(regel_id)
            if not (oud_regel and zelfde(regel, oud_regel, REGEL_VELDEN)):
                batches.set('verkooporderregels', regel_id, regel)
                bijgewerkt += 1
        for regel_id in regels_nu.get(order_id, {}):
            if regel_id not in gezien:
                batches.delete('verkooporderregels', regel_id)

    gesloten = 0
    for order_id, oud in bestaand.items():
        if order_id in open_ids or oud.get('axaptaGesloten'):
            continue
        if heeft_documenten(db, order_id):
            batches.set('verkooporders', order_id, {
                'status': 'geleverd',
                'axaptaGesloten': True,
                'bron': 'axapta',
            })
            gesloten += 1
            continue
        for regel_id in regels_nu.get(order_id, {}):
            batches.delete('verkooporderregels', regel_id)
        batches.delete('verkooporders', order_id)
        gesloten += 1

    batches.klaar()
    return {
        'orders': len(orders),
        'regels': sum(len(o['regels']) for o in orders.values()),
        'bijgewerkt': bijgewerkt,
        'gesloten': gesloten,
        'zonderKlant': zonder_klant,
    }


def init_firestore():
    return Firestore(vereist('GOOGLE_APPLICATION_CREDENTIALS'))


def main():
    proef = '--proef' in sys.argv
    laad_env()
    slot = None if proef else neem_slot()
    bedrijf = vereist('AX_DATAAREAID')
    print('Proefrun (schrijft niets)…' if proef else 'Sync Axapta → FMID ERP…')

    conn = verbind()
    try:
        standen = lees_voorraad(conn, bedrijf)
        orders = lees_open_orders(conn, bedrijf)
        tekeningen = lees_tekeningen(conn, bedrijf)
        barcodes = lees_barcodes(conn, bedrijf)
    finally:
        conn.close()

    regels = sum(len(o['regels']) for o in orders.values())
    print(f'Axapta: {len(standen)} voorraadregels, {len(orders)} open orders, {regels} orderregels')
    tekening_aantal = sum(len(v) for v in tekeningen.values())
    print(f'Tekeningen: {tekening_aantal} bij {len(tekeningen)} artikelen')
    if standen:
        (artikel, locatie), aantal = next(iter(standen.items()))
        print(f'Voorbeeld voorraad: {artikel} op {locatie} = {aantal}')
    if orders:
        nummer = next(iter(orders))
        print(f'Voorbeeld order: {nummer}, klant {tekst(orders[nummer]["kop"]["klantcode"])}')
    voorbeeld_tekening = tekeningen.get('A106 1/2-15'.upper())
    if voorbeeld_tekening:
        print(f'Voorbeeld tekening: {voorbeeld_tekening[0]["pad"]}')
    print(f'Barcodes: {len(barcodes)} artikelen')
    voorbeeld_barcode = barcodes.get('A105 15-15'.upper())
    if voorbeeld_barcode:
        print(
            f'Voorbeeld barcode A105 15-15: doos {voorbeeld_barcode["doos"] or "—"}, '
            f'zak {voorbeeld_barcode["zak"] or "—"}'
        )
    if proef:
        print('Proef klaar. Niets geschreven naar Firestore.')
        return

    db = init_firestore()
    artikelen = index_op(db, 'artikelen', 'artikelnummer')
    voorraad = schrijf_voorraad(db, standen, artikelen, index_op(db, 'locaties', 'code'))
    verkoop = schrijf_orders(db, orders, artikelen, index_op(db, 'klanten', 'klantcode'))
    tekening_sync = schrijf_tekeningen(db, tekeningen, artikelen)
    barcode_sync = schrijf_barcodes(db, barcodes, artikelen)

    db.commit([db.schrijfopdracht('axaptaSync', 'fmid', {
        'laatsteSync': datetime.utcnow(),
        'dataAreaId': bedrijf,
        'voorraadRegels': voorraad['axapta'],
        'voorraadBijgewerkt': voorraad['bijgewerkt'],
        'voorraadVerwijderd': voorraad['verwijderd'],
        'voorraadOvergeslagen': voorraad['overgeslagenAantal'],
        'voorraadOvergeslagenVoorbeelden': voorraad['overgeslagen'],
        'openOrders': verkoop['orders'],
        'orderregels': verkoop['regels'],
        'ordersBijgewerkt': verkoop['bijgewerkt'],
        'ordersGesloten': verkoop['gesloten'],
        'ordersZonderKlant': verkoop['zonderKlant'],
        'tekeningArtikelen': tekening_sync['artikelen'],
        'tekeningenBijgewerkt': tekening_sync['bijgewerkt'],
        'tekeningenGewist': tekening_sync['gewist'],
        'tekeningenOvergeslagen': tekening_sync['overgeslagen'],
        'barcodeArtikelen': barcode_sync['artikelen'],
        'barcodesBijgewerkt': barcode_sync['bijgewerkt'],
        'barcodesGewist': barcode_sync['gewist'],
        'barcodesOvergeslagen': barcode_sync['overgeslagen'],
        'bron': 'axapta',
    })])

    print(
        f"Voorraad bijgewerkt: {voorraad['bijgewerkt']}, verwijderd: {voorraad['verwijderd']}, "
        f"overgeslagen: {voorraad['overgeslagenAantal']}"
    )
    if voorraad['overgeslagen']:
        print('Niet gekoppeld:', '; '.join(voorraad['overgeslagen']))
    print(
        f"Orders en regels geschreven: {verkoop['bijgewerkt']}, gesloten of verwijderd: {verkoop['gesloten']}"
    )
    if verkoop['zonderKlant']:
        print('Order zonder klant in FMID:', '; '.join(verkoop['zonderKlant']))
    print(
        f"Tekeningen bijgewerkt: {tekening_sync['bijgewerkt']}, "
        f"gewist: {tekening_sync['gewist']}, zonder artikel in FMID: {tekening_sync['overgeslagen']}"
    )
    print(
        f"Barcodes bijgewerkt: {barcode_sync['bijgewerkt']}, "
        f"gewist: {barcode_sync['gewist']}, zonder artikel in FMID: {barcode_sync['overgeslagen']}"
    )
    print('Sync klaar.')
    if slot:
        slot.close()


if __name__ == '__main__':
    try:
        main()
    except pyodbc.Error as fout:
        print('SQL-fout:', fout)
        raise SystemExit(1)

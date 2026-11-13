#!/usr/bin/env python3
"""Controlsys → FMID ERP. Alleen SELECT op SQL Server, schrijven alleen naar Firestore.

Leest houders, plaatjes en koppelingen uit de Controlsys-database en zet ze in
de collectie `gereedschappen`. De ERP toont die kopie; de database op
192.168.5.34 blijft leidend. Eenmaal per nacht op de Pi is genoeg.

Proef (leest Controlsys, schrijft niets):

    python3 gereedschap_sync.py --proef
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path

import pyodbc

MAP = Path(__file__).resolve().parent
STAAT_PAD = MAP / 'gereedschap-staat.json'
COLLECTIE = 'gereedschappen'

DIKTE = {
    'T0': 1.02, '01': 1.59, 'T1': 1.98, '02': 2.38, '03': 3.17,
    'T3': 3.97, '04': 4.76, '05': 5.56, '06': 6.35, '07': 7.94,
    '08': 8.69, '09': 9.52, '11': 11.11, '12': 12.70,
}
VORM_PATROON = re.compile(r'([A-Z]{4})\s*(\d{2})(\d{2})(\d{2})')


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


def instelling(*namen):
    for naam in namen:
        waarde = (os.environ.get(naam) or '').strip()
        if waarde:
            return waarde
    return ''


def vereist(*namen):
    waarde = instelling(*namen)
    if not waarde:
        raise SystemExit(f'Omgevingsvariabele {" of ".join(namen)} ontbreekt. Vul koppeling/.env in.')
    return waarde


def cs_waarde(waarde):
    return '{' + str(waarde).replace('}', '}}') + '}'


def verbind():
    # Zelfde stuurprogramma als axapta_sync.py. De Pi gebruikt FreeTDS.
    cs = (
        f'DRIVER={{{os.environ.get("AX_SQL_DRIVER", "FreeTDS")}}};'
        f'SERVER={vereist("CS_SQL_SERVER", "AX_SQL_SERVER")};PORT=1433;'
        f'DATABASE={instelling("CS_SQL_DATABASE") or "Controlsys"};'
        f'UID={cs_waarde(vereist("CS_SQL_GEBRUIKER", "AX_SQL_GEBRUIKER"))};'
        f'PWD={cs_waarde(instelling("CS_SQL_WACHTWOORD", "AX_SQL_WACHTWOORD"))};'
    )
    return pyodbc.connect(cs, timeout=20)


def tekst(waarde):
    if waarde is None:
        return ''
    return str(waarde).strip()


def geheel(waarde):
    if waarde is None or waarde == '':
        return None
    return int(waarde)


def rijen(cursor):
    kolommen = [c[0] for c in cursor.description]
    return [{kolommen[i]: row[i] for i in range(len(kolommen))} for row in cursor]


def afmetingen(plaat):
    """Vorm, hoekradius en dikte uit een ISO-plaatnaam, zoals WNMG080408."""
    naam = tekst(plaat).upper()
    vorm = naam[0] if naam[:1].isalpha() else ''
    match = VORM_PATROON.search(naam)
    if not match:
        return vorm, None, None
    dikte = DIKTE.get(match.group(3))
    try:
        radius = round(int(match.group(4)) / 10.0, 1)
    except ValueError:
        radius = None
    return vorm, radius, dikte


def document(soort, combinatie_id, houder, plaat):
    houder_naam = tekst(houder.get('SoortHouder')) or tekst(houder.get('GereedschapOmschrijving'))
    plaat_naam = tekst(plaat.get('Plaat'))
    vorm, radius, dikte = afmetingen(plaat_naam)
    omschrijving = tekst(houder.get('GereedschapOmschrijving'))
    fabrikant = tekst(plaat.get('Fabrikant'))
    houder_locatie = tekst(houder.get('LocatieHouder'))
    plaat_locatie = tekst(plaat.get('Locatie'))
    payload = {
        'bron': 'controlsys',
        'soort': soort,
        'combinatieId': combinatie_id,
        'houderId': geheel(houder.get('Index')),
        'plaatId': geheel(plaat.get('Index')),
        'houder': houder_naam,
        'omschrijving': omschrijving,
        'houderLocatie': houder_locatie,
        'houderArtikel': tekst(houder.get('Artikelnummer')),
        'typeBewerking': tekst(houder.get('TypeBewerking')),
        'soortPlaat': tekst(houder.get('SoortPlaat')),
        'houderOpmerking': tekst(houder.get('Opmerkingen')),
        'plaat': plaat_naam,
        'fabrikant': fabrikant,
        'plaatLocatie': plaat_locatie,
        'plaatArtikel': tekst(plaat.get('ArtikelAxapta')),
        'plaatOpmerking': tekst(plaat.get('Opmerkingen')),
        'vorm': vorm,
        'hoekradius': radius,
        'dikte': dikte,
    }
    delen = [
        houder_naam, omschrijving, houder_locatie, plaat_naam, fabrikant, plaat_locatie,
        payload['houderArtikel'], payload['plaatArtikel'], payload['typeBewerking'],
    ]
    payload['zoek'] = ' '.join(deel for deel in delen if deel).lower()
    return payload


def lees_gereedschap(conn):
    cursor = conn.cursor()
    cursor.execute("""
        SELECT
            v.[Index] AS combinatieId,
            h.[Index] AS houderIndex,
            h.GereedschapOmschrijving,
            h.SoortHouder,
            h.LocatieHouder,
            h.Artikelnummer,
            h.TypeBewerking,
            h.SoortPlaat,
            h.Opmerkingen AS houderOpmerkingen,
            p.[Index] AS plaatIndex,
            p.Plaat,
            p.Locatie,
            p.Fabrikant,
            p.ArtikelAxapta,
            p.Opmerkingen AS plaatOpmerkingen
        FROM dbo.GereedschappenVerbindingsTabel v
        INNER JOIN dbo.Gereedschappen h ON h.[Index] = v.IndexHouder
        INNER JOIN dbo.GereedschappenPlaat p ON p.[Index] = v.IndexPlaat
    """)
    docs = {}
    for rij in rijen(cursor):
        combinatie_id = geheel(rij['combinatieId'])
        if combinatie_id is None:
            continue
        houder = {
            'Index': rij['houderIndex'],
            'GereedschapOmschrijving': rij['GereedschapOmschrijving'],
            'SoortHouder': rij['SoortHouder'],
            'LocatieHouder': rij['LocatieHouder'],
            'Artikelnummer': rij['Artikelnummer'],
            'TypeBewerking': rij['TypeBewerking'],
            'SoortPlaat': rij['SoortPlaat'],
            'Opmerkingen': rij['houderOpmerkingen'],
        }
        plaat = {
            'Index': rij['plaatIndex'],
            'Plaat': rij['Plaat'],
            'Locatie': rij['Locatie'],
            'Fabrikant': rij['Fabrikant'],
            'ArtikelAxapta': rij['ArtikelAxapta'],
            'Opmerkingen': rij['plaatOpmerkingen'],
        }
        docs[f'c-{combinatie_id}'] = document('combinatie', combinatie_id, houder, plaat)

    cursor.execute("""
        SELECT
            h.[Index], h.GereedschapOmschrijving, h.SoortHouder, h.LocatieHouder,
            h.Artikelnummer, h.TypeBewerking, h.SoortPlaat, h.Opmerkingen
        FROM dbo.Gereedschappen h
        WHERE NOT EXISTS (
            SELECT 1 FROM dbo.GereedschappenVerbindingsTabel v
            WHERE v.IndexHouder = h.[Index]
        )
    """)
    for rij in rijen(cursor):
        houder_id = geheel(rij['Index'])
        if houder_id is None:
            continue
        docs[f'h-{houder_id}'] = document('houder', None, rij, {})

    cursor.execute("""
        SELECT p.[Index], p.Plaat, p.Locatie, p.Fabrikant, p.ArtikelAxapta, p.Opmerkingen
        FROM dbo.GereedschappenPlaat p
        WHERE NOT EXISTS (
            SELECT 1 FROM dbo.GereedschappenVerbindingsTabel v
            WHERE v.IndexPlaat = p.[Index]
        )
    """)
    for rij in rijen(cursor):
        plaat_id = geheel(rij['Index'])
        if plaat_id is None:
            continue
        docs[f'p-{plaat_id}'] = document('plaat', None, {}, rij)

    cursor.execute("""
        SELECT COUNT(*)
        FROM dbo.GereedschappenVerbindingsTabel v
        WHERE NOT EXISTS (SELECT 1 FROM dbo.Gereedschappen h WHERE h.[Index] = v.IndexHouder)
           OR NOT EXISTS (SELECT 1 FROM dbo.GereedschappenPlaat p WHERE p.[Index] = v.IndexPlaat)
    """)
    overgeslagen = int(cursor.fetchone()[0])
    return docs, overgeslagen


def vingerafdruk(data):
    ruw = json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
    return hashlib.sha1(ruw.encode('utf-8')).hexdigest()[:16]


def laad_staat():
    if not STAAT_PAD.exists():
        return None
    try:
        return json.loads(STAAT_PAD.read_text(encoding='utf-8'))
    except (OSError, json.JSONDecodeError):
        return None


def bewaar_staat(staat):
    tijdelijk = STAAT_PAD.with_suffix('.json.tmp')
    tijdelijk.write_text(json.dumps(staat, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    os.replace(tijdelijk, STAAT_PAD)


def tel(docs, soort):
    return sum(1 for doc in docs.values() if doc['soort'] == soort)


def schrijf(docs, overgeslagen):
    from axapta_sync import Firestore

    sleutel = vereist('GOOGLE_APPLICATION_CREDENTIALS')
    db = Firestore(sleutel)
    staat = laad_staat()
    if staat is None:
        aanwezig = set(db.alle(COLLECTIE, ['soort']))
        oud = {}
    else:
        oud = staat.get('hashes') or {}
        aanwezig = set(oud)

    nieuw = {doc_id: vingerafdruk(data) for doc_id, data in docs.items()}
    writes = []
    geschreven = 0
    for doc_id, data in docs.items():
        if oud.get(doc_id) == nieuw[doc_id]:
            continue
        writes.append(db.schrijfopdracht(COLLECTIE, doc_id, data))
        geschreven += 1
    verwijderd = 0
    for doc_id in sorted(aanwezig - set(docs)):
        writes.append(db.wisopdracht(COLLECTIE, doc_id))
        verwijderd += 1
    writes.append(db.schrijfopdracht('gereedschapSync', 'controlsys', {
        'laatsteSync': datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'),
        'combinaties': tel(docs, 'combinatie'),
        'houdersZonderPlaat': tel(docs, 'houder'),
        'plaatjesZonderHouder': tel(docs, 'plaat'),
        'overgeslagen': overgeslagen,
        'geschreven': geschreven,
        'verwijderd': verwijderd,
        'gelezen': db.gelezen,
    }))
    db.commit(writes)
    bewaar_staat({'hashes': nieuw})
    return geschreven, verwijderd, db.gelezen


def main():
    laad_env()
    proef = '--proef' in sys.argv
    conn = verbind()
    try:
        docs, overgeslagen = lees_gereedschap(conn)
    finally:
        conn.close()

    print(f'Combinaties: {tel(docs, "combinatie")}')
    print(f'Houders zonder plaatje: {tel(docs, "houder")}')
    print(f'Plaatjes zonder houder: {tel(docs, "plaat")}')
    print(f'Koppelingen zonder houder of plaat: {overgeslagen}')
    if proef:
        print('Niets geschreven (--proef).')
        return
    geschreven, verwijderd, gelezen = schrijf(docs, overgeslagen)
    print(f'Firestore: {geschreven} geschreven, {verwijderd} verwijderd, {gelezen} gelezen.')


if __name__ == '__main__':
    main()

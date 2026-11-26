#!/usr/bin/env python3
"""Verpakkingsinstructies → FMID ERP, voor Verpakken doos.

Alleen SELECT op SQL Server (Controlsys `VerpakingTabel`), schrijven alleen
naar Firestore (`verpakkingen`).

Proef (leest SQL Server, schrijft niets):

    python3 verpakking_sync.py --proef
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import axapta_sync
from gereedschap_sync import laad_env, rijen, tekst, verbind, vereist, vingerafdruk

STAAT_PAD = Path(__file__).resolve().parent / 'verpakking-staat.json'


def getal(waarde):
    if waarde is None or waarde == '':
        return None
    n = float(waarde)
    return int(n) if n.is_integer() else n


def ja(waarde):
    """bit uit SQL Server, of 'True'/'False' uit een Excel-export."""
    if isinstance(waarde, str):
        return waarde.strip().lower() in ('true', '1', 'ja', 'waar')
    return bool(waarde)


def naar_docs(rijen_):
    """Rijen met de kolommen van `VerpakingTabel` -> {doc_id: data}."""
    docs = {}
    gezien = set()
    for r in rijen_:
        nummer = tekst(r['Artikelnummer'])
        # Controlsys gebruikt de eerste regel van een artikel.
        if not nummer or r['Index'] is None or nummer.lower() in gezien:
            continue
        gezien.add(nummer.lower())
        docs[f"v-{int(r['Index'])}"] = {
            'bron': 'controlsys',
            'artikelnummer': nummer,
            'artikelnummerKlant': tekst(r['ArtikelnummerKlant']),
            'soortDoos': tekst(r['SoortDoos']),
            'soortZak': tekst(r['SoortZak']),
            'aantalPerZak': getal(r['AantalPerZak']),
            'zakkenPerDoos': getal(r['ZakkenPerDoos']),
            'storten': ja(r['Storten']),
            'karton': ja(r['Karton']),
            'kartonPerLaag': ja(r['KartonPerLaag']),
            'soortTape': tekst(r['SoortTape']),
            'etiketOpZak': ja(r['EtiketOpZak']),
            'etiketOpDoos': ja(r['EtiketOpDoos']),
            'noppenfolie': ja(r['Noppenfolie']),
            'gewichtPerProduct': getal(r['GewichtPerProdukt']),
            'aantalPerDoos': getal(r['AantalPerDoos']),
            'tarraDoos': getal(r['TareerGewichtDoos']),
            'opmerkingen': tekst(r['Opmerkingen']),
        }
    return docs


def lees_verpakkingen(conn):
    cursor = conn.cursor()
    cursor.execute("""
        SELECT [Index], Artikelnummer, SoortDoos, SoortZak, AantalPerZak, ZakkenPerDoos,
               Storten, Karton, KartonPerLaag, SoortTape, EtiketOpZak, EtiketOpDoos,
               Noppenfolie, GewichtPerProdukt, AantalPerDoos, TareerGewichtDoos,
               ArtikelnummerKlant, Opmerkingen
        FROM dbo.VerpakingTabel
        ORDER BY [Index]
    """)
    return naar_docs(rijen(cursor))


def laad_staat():
    try:
        return json.loads(STAAT_PAD.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return {}


def bewaar_staat(staat):
    tijdelijk = STAAT_PAD.with_suffix('.json.tmp')
    tijdelijk.write_text(json.dumps(staat, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    os.replace(tijdelijk, STAAT_PAD)


def schrijf(collecties):
    db = axapta_sync.Firestore(vereist('GOOGLE_APPLICATION_CREDENTIALS'))
    staat = laad_staat()
    for collectie, docs in collecties.items():
        oud = staat.get(collectie)
        if oud is None:
            oud = {doc_id: '' for doc_id in db.alle(collectie, ['bron'])}
        nieuw = {doc_id: vingerafdruk(data) for doc_id, data in docs.items()}
        anders = [d for d in docs if oud.get(d) != nieuw[d]]
        weg = sorted(set(oud) - set(docs))
        writes = [db.schrijfopdracht(collectie, d, docs[d]) for d in anders]
        writes += [db.wisopdracht(collectie, d) for d in weg]
        db.commit(writes)
        staat[collectie] = nieuw
        bewaar_staat(staat)
        print(f'{collectie}: {len(anders)} geschreven, {len(weg)} verwijderd.')


def main():
    laad_env()
    conn = verbind()
    try:
        verpakkingen = lees_verpakkingen(conn)
    finally:
        conn.close()

    print(f'Verpakkingen: {len(verpakkingen)}')
    if '--proef' in sys.argv:
        print('Niets geschreven (--proef).')
        return
    # Een lege tabel is een storing; dan niet alles in Firestore wissen.
    if not verpakkingen:
        raise SystemExit('Geen verpakkingen gelezen. Niets geschreven.')
    schrijf({'verpakkingen': verpakkingen})


if __name__ == '__main__':
    main()

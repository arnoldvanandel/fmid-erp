#!/usr/bin/env python3
"""Eenmalig: verpakkingsvoorschriften uit een Excel-export van Controlsys
(`VerpakingTabel`) in Firestore zetten, voor Verpakken doos.

Zelfde documenten (`v-{Index}`) als verpakking_sync.py, zodat de sync het
later gewoon overneemt. Let op: wat niet in het bestand staat, verdwijnt uit
`verpakkingen` (net als bij de sync).

Proef (leest alleen het bestand):

    python verpakking_import.py Verpakkingsvoorschrift.xlsx --proef

Nodig: pip install openpyxl, en GOOGLE_APPLICATION_CREDENTIALS in koppeling/.env.
"""
from __future__ import annotations

import sys

from gereedschap_sync import laad_env
from verpakking_sync import naar_docs, schrijf

# Kolomvolgorde van VerpakingTabel in Controlsys (ControlsysDataSet).
KOLOMMEN = [
    'Index', 'Artikelnummer', 'SoortDoos', 'SoortZak', 'AantalPerZak', 'ZakkenPerDoos',
    'Storten', 'Karton', 'KartonPerLaag', 'SoortTape', 'EtiketOpZak', 'EtiketOpDoos',
    'Noppenfolie', 'GewichtPerProdukt', 'AantalPerDoos', 'TareerGewichtDoos',
    'ArtikelnummerKlant', 'Foto', 'Opmerkingen',
]


def lees_excel(pad):
    import openpyxl

    blad = openpyxl.load_workbook(pad, data_only=True, read_only=True).active
    rijen = []
    for waarden in blad.iter_rows(values_only=True):
        waarden = list(waarden)
        # De export begint met een lege kolom; de kolommen beginnen bij Index.
        while waarden and waarden[0] is None and len(waarden) > len(KOLOMMEN):
            waarden.pop(0)
        if isinstance(waarden[0], str):  # kopregel
            continue
        rijen.append(dict(zip(KOLOMMEN, waarden + [None] * len(KOLOMMEN))))
    return rijen


def main():
    bestanden = [a for a in sys.argv[1:] if not a.startswith('--')]
    if len(bestanden) != 1:
        raise SystemExit('Gebruik: python verpakking_import.py <bestand.xlsx> [--proef]')
    docs = naar_docs(lees_excel(bestanden[0]))
    print(f'Verpakkingen: {len(docs)}')
    if '--proef' in sys.argv:
        for doc_id, data in list(docs.items())[:3]:
            print(doc_id, data)
        print('Niets geschreven (--proef).')
        return
    if not docs:
        raise SystemExit('Geen verpakkingen gelezen. Niets geschreven.')
    laad_env()
    schrijf({'verpakkingen': docs})


if __name__ == '__main__':
    main()

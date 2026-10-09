"""Zet de Axapta-export WMSLocation (magazijnlocaties) om naar migratie/locaties-import.json.

Alle locaties liggen in magazijn STD. Gang/Rek/Plank/Bak zijn in de export overal 0;
de plek zit in de locatiecode zelf ("1343-1", "F8-3", "BUF22"). We nemen over:
code (in hoofdletters, zodat zoeken op begin van de code werkt), magazijn, type
(Opnamelocatie / Buffer) en de sorteercode.

Gebruik:  python migratie/axapta-locaties.py "<Locatie tabel.xlsx>"
"""
import json
import sys
from collections import Counter

import openpyxl


def tekst(v):
    if v is None:
        return ''
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return str(v).strip()


def main(pad):
    ws = openpyxl.load_workbook(pad, read_only=True, data_only=True).active
    rijen = ws.iter_rows(values_only=True)
    ix = {}
    for i, k in enumerate(next(rijen)):
        if k and k not in ix:
            ix[k] = i

    uit = []
    for r in rijen:
        origineel = tekst(r[ix['Locatie']])
        code = origineel.upper()
        if not code:
            continue
        # Benoemde plekken ("Inpakhoek", "vertrekhal"): de schrijfwijze uit Axapta als naam.
        sortering = r[ix['Sorteercode.']]
        uit.append({
            'code': code,
            'naam': origineel[:1].upper() + origineel[1:] if origineel != code else '',
            'magazijn': tekst(r[ix['Magazijn']]),
            'type': tekst(r[ix['Locatietype']]),
            'sorteercode': int(sortering) if isinstance(sortering, (int, float)) else 0,
        })

    dubbel = [c for c, n in Counter(l['code'] for l in uit).items() if n > 1]
    with open('migratie/locaties-import.json', 'w', encoding='utf-8') as f:
        json.dump(uit, f, ensure_ascii=False, indent=1)

    print('locaties:', len(uit))
    print('magazijnen:', Counter(l['magazijn'] for l in uit))
    print('types:', Counter(l['type'] for l in uit))
    print('dubbele codes:', dubbel or 'geen')


if __name__ == '__main__':
    main(sys.argv[1])

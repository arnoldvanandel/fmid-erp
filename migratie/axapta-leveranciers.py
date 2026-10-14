"""Zet de Axapta-export van de leveranciers om naar migratie/leveranciers-import.json.

Alleen de velden die fmid-erp bij een leverancier kent (zie LeverancierForm.jsx).
Adressen splitsen we zoals bij de klanten (axapta-klanten.py); lukt dat niet, dan
blijft het hele adres in `straat` staan en wordt de leverancier gemeld.

Gebruik:  python migratie/axapta-leveranciers.py "<leveranciers axapta.xlsx>"
"""
import importlib.util
import json
import os
import re
import sys
from collections import Counter

import openpyxl

# Hulpfuncties (landnamen, adres splitsen) uit het klantenscript hergebruiken.
_spec = importlib.util.spec_from_file_location(
    'axapta_klanten', os.path.join(os.path.dirname(__file__), 'axapta-klanten.py'))
klanten = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(klanten)
tekst, splits_adres = klanten.tekst, klanten.splits_adres
LANDCODES = {**klanten.LANDCODES, 'US': 'Verenigde Staten', 'ZA': 'Zuid-Afrika', 'NL': 'Nederland'}

# BTW-groepen uit Axapta die fmid-erp niet kent (zie BTW_GROEPEN in src/lib/stamgegevens.js).
BTW_OMZETTEN = {'Import': 'Non-EU'}


def main(pad):
    wb = openpyxl.load_workbook(pad, read_only=True, data_only=True)
    rijen = wb.active.iter_rows(values_only=True)
    ix = {}
    for i, k in enumerate(next(rijen)):
        if k and k not in ix:
            ix[k] = i

    def v(r, veld):
        return tekst(r[ix[veld]]) if veld in ix else ''

    uit, nakijken = [], []
    for r in rijen:
        code = v(r, 'Leverancier')
        if not code:
            continue  # "Onbekende crediteur" zonder nummer

        adres = v(r, 'Adres') or v(r, 'Straatnaam')
        if v(r, 'Postcode') and v(r, 'Plaats'):
            straat, postcode, plaats = v(r, 'Straatnaam'), v(r, 'Postcode'), v(r, 'Plaats')
            land, gelukt = LANDCODES.get(v(r, 'Land').upper(), ''), True
        else:
            straat, postcode, plaats, land, gelukt = splits_adres(adres) if adres else ('', '', '', '', True)
        land = land or LANDCODES.get(v(r, 'Land').upper(), '') or ('Nederland' if v(r, 'Groep') == 'NL' else '')
        if not gelukt:
            nakijken.append(f'{code} {v(r, "Naam")} | {adres}')

        btw_nummer = v(r, 'BTW-nummer')
        if '?' in btw_nummer or '*' in btw_nummer:
            btw_nummer = ''
        btw_groep = v(r, 'BTW-groep')
        if btw_groep == 'IC-lev':
            btw_groep = 'EU-IC' if btw_nummer else 'EU-belast'
        btw_groep = BTW_OMZETTEN.get(btw_groep, btw_groep) or {
            'NL': 'NL', 'EU': 'EU-IC' if btw_nummer else 'EU-belast'}.get(v(r, 'Groep'), 'Non-EU')

        termijn = re.match(r'\d+', v(r, 'Betalingstermijn'))
        telefoon = v(r, 'Telefoon') or v(r, 'Mobiele telefoon')

        uit.append({
            'leverancierscode': code,
            'naam': v(r, 'Naam'),
            'contactpersoon': v(r, 'Contactpersoon'),
            'email': v(r, 'E-mail'),
            'inkooporderEmails': [],
            'taal': klanten.TAAL.get(v(r, 'Taal').lower(), 'nl'),
            'leveringsvoorwaarde': v(r, 'Leveringsvoorwaarden'),
            'telefoon': telefoon,
            'straat': straat,
            'postcode': postcode,
            'plaats': plaats,
            'land': land,
            'btwNummer': btw_nummer,
            'btwGroep': btw_groep,
            'valuta': v(r, 'Valuta') or 'EUR',
            'kvkNummer': '',
            'betalingstermijn': int(termijn.group()) if termijn else (0 if v(r, 'Betalingstermijn') == 'Kontant' else 30),
            'geblokkeerd': v(r, 'Gestopt') not in ('', 'Nee'),
        })

    with open('migratie/leveranciers-import.json', 'w', encoding='utf-8') as f:
        json.dump(uit, f, ensure_ascii=False, indent=1)

    print('leveranciers:', len(uit), '· geblokkeerd:', sum(l['geblokkeerd'] for l in uit))
    print('landen:', Counter(l['land'] for l in uit))
    print('btw-groepen:', Counter(l['btwGroep'] for l in uit))
    print('levering:', Counter(l['leveringsvoorwaarde'] for l in uit))
    print('adres na te kijken:', len(nakijken))
    for n in nakijken:
        print('  NAKIJKEN', n)


if __name__ == '__main__':
    main(sys.argv[1])

"""Zet de Axapta-exports InventTable + InventTableModule om naar
migratie/artikelen-import.json voor de import in de app.

Gebruik:  python migratie/axapta-artikelen.py "<Artikel tabel.xlsx>" "<Invent table module.xlsx>"
"""
import datetime
import json
import sys
from collections import Counter

import openpyxl

ARTIKELTYPE = {'Artikel': 'Artikel', 'Stuklijst': 'Stuklijst', 'Service': 'Dienst'}
EENHEID = {'stuks': 'Stuks', 'kg': 'Kg', 'm': 'Meter', 'l': 'Liter', 'm2': 'm²', 'doos': 'Doos'}
BTW = {'hoog': 'Hoog', 'laag': 'Laag'}


def lees(pad):
    ws = openpyxl.load_workbook(pad, read_only=True, data_only=True).active
    rijen = ws.iter_rows(values_only=True)
    kop = list(next(rijen))
    # Bij dubbele kolomnamen (Dimension) telt de eerste.
    ix = {}
    for i, k in enumerate(kop):
        if k and k not in ix:
            ix[k] = i
    return ix, [r for r in rijen if r and r[ix['ItemId']] not in (None, '')]


def tekst(v):
    if v is None:
        return ''
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return str(v).strip()


def getal(v, standaard=0):
    try:
        return float(v) if v not in (None, '') else standaard
    except (TypeError, ValueError):
        return standaard


def datum(v):
    if isinstance(v, datetime.datetime):
        return '' if v.year < 1950 else v.strftime('%Y-%m-%d')
    return ''


def main(artikel_pad, module_pad):
    aix, artikelen = lees(artikel_pad)
    mix, modules = lees(module_pad)

    per_artikel = {}
    for r in modules:
        per_artikel.setdefault(tekst(r[mix['ItemId']]), {})[r[mix['ModuleType']]] = r

    uit, onbekende_eenheden, zonder_module = [], Counter(), 0
    for r in artikelen:
        nr = tekst(r[aix['ItemId']])
        mod = per_artikel.get(nr, {})
        if not mod:
            zonder_module += 1
        voorraad, inkoop, verkoop = mod.get('Voorraad'), mod.get('Inkooporder'), mod.get('Verkooporder')

        def m(rij, veld, standaard=None):
            return rij[mix[veld]] if rij is not None else standaard

        eenheid_axapta = tekst(m(voorraad, 'UnitId') or m(inkoop, 'UnitId') or 'Stuks')
        eenheid = EENHEID.get(eenheid_axapta.lower())
        if not eenheid:
            onbekende_eenheden[eenheid_axapta] += 1
            eenheid = eenheid_axapta or 'Stuks'

        uit.append({
            'artikelnummer': nr,
            'naam': tekst(r[aix['ItemName']]) or nr,
            'zoeknaam': tekst(r[aix['NameAlias']]),
            'artikeltype': ARTIKELTYPE.get(tekst(r[aix['ItemType']]), 'Artikel'),
            'artikelgroep': tekst(r[aix['ItemGroupId']]),
            'hoofdleverancier': tekst(r[aix['PrimaryVendorId']]),
            'eenheid': eenheid,
            'inkoopprijs': getal(m(inkoop, 'Price')),
            'inkoopprijsHoeveelheid': getal(m(inkoop, 'PriceUnit'), 1) or 1,
            'inkoopprijsDatum': datum(m(inkoop, 'PriceDate')),
            'inkoopkorting': 0,
            'verkoopprijs': getal(m(verkoop, 'Price')),
            'verkoopprijsHoeveelheid': getal(m(verkoop, 'PriceUnit'), 1) or 1,
            'verkoopprijsDatum': datum(m(verkoop, 'PriceDate')),
            'verkoopkorting': 0,
            'kostprijs': getal(m(voorraad, 'Price')),
            'kostprijsHoeveelheid': getal(m(voorraad, 'PriceUnit'), 1) or 1,
            'minVoorraad': 0,
            'btwGroep': BTW.get(tekst(m(voorraad, 'TaxItemGroupId') or m(inkoop, 'TaxItemGroupId')).lower(), 'Hoog'),
            'levertijd': getal(m(inkoop, 'DeliveryTime')),
            'geblokkeerd': tekst(m(voorraad, 'Blocked')) == 'Ja',
            'inkoopGeblokkeerd': tekst(m(inkoop, 'Blocked')) == 'Ja',
            'verkoopGeblokkeerd': tekst(m(verkoop, 'Blocked')) == 'Ja',
            'gewicht': getal(r[aix['NetWeight']]) or None,
            'hoogte': None,
            'breedte': None,
            'diepte': None,
            'axaptaRecId': r[aix['RecId']],
        })

    with open('migratie/artikelen-import.json', 'w', encoding='utf-8') as f:
        json.dump(uit, f, ensure_ascii=False, separators=(',', ':'))

    print('artikelen:', len(uit))
    print('zonder module-regels:', zonder_module)
    print('typen:', Counter(a['artikeltype'] for a in uit))
    print('eenheden:', Counter(a['eenheid'] for a in uit))
    print('onbekende eenheden:', dict(onbekende_eenheden))
    print('btw:', Counter(a['btwGroep'] for a in uit))
    print('geblokkeerd:', sum(a['geblokkeerd'] for a in uit))
    print('met inkoopprijs:', sum(a['inkoopprijs'] > 0 for a in uit))
    print('met verkoopprijs:', sum(a['verkoopprijs'] > 0 for a in uit))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])

"""Zet de Axapta-export CustTable (klanten) om naar migratie/klanten-import.json.

In de export zijn de regeleinden uit het adres verdwenen ("Loswal 54271 BA DUSSEN").
Waar Axapta straat/postcode/plaats los heeft, gebruiken we die; anders splitsen we
het adres op de postcode. Lukt dat niet, dan krijgt de klant `adresControleren: true`
en staat het oorspronkelijke adres in `adresAxapta`.

Gebruik:  python migratie/axapta-klanten.py "<Klantentabel.xlsx>"
"""
import json
import re
import sys
from collections import Counter

import openpyxl

LANDNAMEN = {
    'nederland': 'Nederland', 'the netherlands': 'Nederland', 'netherlands': 'Nederland',
    'belgie': 'België', 'belgië': 'België', 'belgium': 'België', 'belgique': 'België',
    'duitsland': 'Duitsland', 'deutschland': 'Duitsland', 'germany': 'Duitsland',
    'spain': 'Spanje', 'spanje': 'Spanje', 'espana': 'Spanje',
    'czech republic': 'Tsjechië', 'tsjechie': 'Tsjechië',
    'france': 'Frankrijk', 'frankrijk': 'Frankrijk',
    'united kingdom': 'Verenigd Koninkrijk', 'uk': 'Verenigd Koninkrijk', 'england': 'Verenigd Koninkrijk',
    'sweden': 'Zweden', 'zweden': 'Zweden', 'poland': 'Polen', 'polen': 'Polen',
    'italy': 'Italië', 'italia': 'Italië', 'austria': 'Oostenrijk', 'switzerland': 'Zwitserland',
    'denmark': 'Denemarken', 'norway': 'Noorwegen', 'noorwegen': 'Noorwegen',
    'roemenië': 'Roemenië', 'roemenie': 'Roemenië', 'romania': 'Roemenië',
}

# Postcodevorm per land, voor adressen zonder landcode voor de postcode.
POSTCODE_PER_LAND = {
    'België': r'\d{4}', 'Zwitserland': r'\d{4}', 'Oostenrijk': r'\d{4}', 'Noorwegen': r'\d{4}',
    'Denemarken': r'\d{4}', 'Duitsland': r'\d{5}', 'Spanje': r'\d{5}', 'Frankrijk': r'\d{5}',
    'Tsjechië': r'\d{3}\s?\d{2}', 'Polen': r'\d{2}-\d{3}', 'Roemenië': r'\d{6}',
}
LANDCODES = {
    'NL': 'Nederland', 'DE': 'Duitsland', 'D': 'Duitsland', 'BE': 'België', 'B': 'België',
    'E': 'Spanje', 'ES': 'Spanje', 'F': 'Frankrijk', 'FR': 'Frankrijk', 'GB': 'Verenigd Koninkrijk',
    'UK': 'Verenigd Koninkrijk', 'SE': 'Zweden', 'S': 'Zweden', 'CZ': 'Tsjechië', 'PL': 'Polen',
    'PO': 'Polen', 'A': 'Oostenrijk', 'AT': 'Oostenrijk', 'CH': 'Zwitserland', 'I': 'Italië',
    'IT': 'Italië', 'DK': 'Denemarken',
}
TAAL = {'nl': 'nl', 'de': 'de', 'en-gb': 'en', 'en-us': 'en', 'en': 'en'}


def tekst(v):
    if v is None:
        return ''
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return str(v).strip()


def haal_land_eraf(s):
    """'GenkBelgie' -> ('Genk', 'België'); ook met spatie ervoor."""
    laag = s.lower()
    for naam in sorted(LANDNAMEN, key=len, reverse=True):
        if laag.endswith(naam) and len(s) > len(naam):
            return s[: -len(naam)].rstrip(' ,'), LANDNAMEN[naam]
    return s, ''


def splits_adres(adres):
    """Geeft (straat, postcode, plaats, land, gelukt)."""
    s = re.sub(r'\s+T:\s*[\d\s-]+$', '', adres.strip())  # "… T: 013-5131284"
    s, land = haal_land_eraf(s)

    # Buitenland met landcode: "In Der Illekatte 7-9D-58339 BRECKERFELD", "Taunusweg 6B-3600 Genk",
    # "Schiesstrasse 68D-40549Dusseldorf", "Heihoefke 4bB-2960  Brecht"
    m = list(re.finditer(r'(?<![A-Z])([A-Z]{1,2})-\s?(\d{4,5})\s*([A-Za-zÀ-ž].*)$', s))
    if m:
        m = m[-1]
        straat = s[: m.start()].strip()
        if straat:
            return straat, f'{m.group(1)}-{m.group(2)}', m.group(3).strip(), \
                land or LANDCODES.get(m.group(1), ''), True

    # Nederland: "Postbus 1257050 AC VARSSEVELD", "Gooiland 21948RC Beverwijk", "853125 BA, Schiedam"
    if land in ('', 'Nederland'):
        m = list(re.finditer(r'(\d{4})\s{0,2}([A-Z]{2}),?\s+(\S.*)$', s))
        if m:
            m = m[-1]
            straat = s[: m.start()].strip()
            if straat:
                return straat, f'{m.group(1)} {m.group(2)}', m.group(3).strip(), 'Nederland', True

    # Buitenland zonder landcode, als het land bekend is: "Vennekeslaan 13665 As" (België)
    vorm = POSTCODE_PER_LAND.get(land)
    if vorm:
        m = list(re.finditer(rf'({vorm})\s*([A-Za-zÀ-ž].*)$', s))
        if m:
            m = m[-1]
            straat = s[: m.start()].strip()
            if straat:
                return straat, m.group(1), m.group(2).strip(), land, True

    return s, '', '', land, False


def main(pad):
    ws = openpyxl.load_workbook(pad, read_only=True, data_only=True).active
    rijen = ws.iter_rows(values_only=True)
    kop = list(next(rijen))
    ix = {}
    for i, k in enumerate(kop):
        if k and k not in ix:
            ix[k] = i

    def v(r, veld):
        return tekst(r[ix[veld]]) if veld in ix else ''

    uit = []
    for r in rijen:
        code = v(r, 'AccountNum')
        if not code:
            continue
        adres = v(r, 'Address')
        if v(r, 'ZipCode') and v(r, 'City'):
            straat, postcode, plaats = v(r, 'Street'), v(r, 'ZipCode'), v(r, 'City')
            land = LANDCODES.get(v(r, 'Country').upper(), '') or haal_land_eraf(adres)[1]
            gelukt = True
        else:
            straat, postcode, plaats, land, gelukt = splits_adres(adres)
        if not land:
            land = LANDCODES.get(v(r, 'Country').upper(), '') or ('Nederland' if v(r, 'CustGroup') == 'NL' else '')

        btw_nummer = v(r, 'VATNum')
        if '?' in btw_nummer or '*' in btw_nummer:
            btw_nummer = ''
        btw_groep = v(r, 'TaxGroup') or {'NL': 'NL', 'EU': 'EU-IC' if btw_nummer else 'EU-belast',
                                          'Niet EU': 'Non-EU'}.get(v(r, 'CustGroup'), 'NL')
        termijn = re.match(r'\d+', v(r, 'PaymTermId'))

        uit.append({
            'klantcode': code,
            'naam': v(r, 'Name'),
            'zoeknaam': v(r, 'NameAlias'),
            'klantgroep': v(r, 'CustGroup'),
            'contactpersoon': '',
            'telefoon': v(r, 'Phone'),
            'mobiel': v(r, 'CellularPhone'),
            'fax': v(r, 'TeleFax'),
            'email': v(r, 'Email'),
            'website': v(r, 'URL'),
            'straat': straat,
            'postcode': postcode,
            'plaats': plaats,
            'land': land,
            'adresAxapta': adres,
            'adresControleren': not gelukt,
            'btwGroep': btw_groep,
            'btwNummer': btw_nummer,
            'inclBtw': v(r, 'InclTax') == 'Ja',
            'valuta': v(r, 'Currency') or 'EUR',
            'betalingstermijn': int(termijn.group()) if termijn else (0 if v(r, 'PaymTermId') == 'Kontant' else 30),
            'betalingsconditie': v(r, 'PaymTermId'),
            'leveringsvoorwaarde': v(r, 'DlvTerm'),
            'leveringswijze': v(r, 'DlvMode'),
            'taal': TAAL.get(v(r, 'LanguageId').lower(), 'nl'),
            'kvkNummer': '',
            'geblokkeerd': v(r, 'Blocked') == 'Ja',
        })

    with open('migratie/klanten-import.json', 'w', encoding='utf-8') as f:
        json.dump(uit, f, ensure_ascii=False, indent=1)

    print('klanten:', len(uit))
    print('adres na te kijken:', sum(k['adresControleren'] for k in uit))
    print('landen:', Counter(k['land'] for k in uit))
    print('btw-groepen:', Counter(k['btwGroep'] for k in uit))
    print('talen:', Counter(k['taal'] for k in uit))
    for k in uit:
        if k['adresControleren']:
            print('  NAKIJKEN', k['klantcode'], k['naam'], '|', k['adresAxapta'])


if __name__ == '__main__':
    main(sys.argv[1])

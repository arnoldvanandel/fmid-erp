// Keuzelijsten die klanten en leveranciers delen, overgenomen uit Axapta.

export const BTW_GROEPEN = {
  NL: 'BTW NL',
  DE: 'Duitse BTW (16%)',
  'EU-IC': 'BTW EU BTW nr. bekend',
  'EU-belast': 'BTW EU BTW nr. onbekend',
  'Non-EU': 'BTW buiten EU',
}

export const VALUTA = ['EUR', 'USD', 'GBP', 'CHF']

// Klantgroepen (CustGroup in Axapta).
export const KLANTGROEPEN = ['NL', 'EU', 'Niet EU']

// Leveringsvoorwaarden (DlvTerm in Axapta).
export const LEVERINGSVOORWAARDEN = {
  FH: 'Franco huis',
  EXW: 'Af fabriek (Ex Works)',
  DAP: 'Delivered at Place',
  DDP: 'Delivered Duty Paid',
  DDU: 'Delivered Duty Unpaid',
  PICKUP: 'Wordt afgehaald',
}

// Soorten alternatieve adressen bij een klant (veld "type" in de Axapta-tabel Address).
export const ADRES_TYPES = {
  levering: 'Leveradres',
  factuur: 'Factuuradres',
  alternatief: 'Alternatief afleveradres',
  overig: 'Overig',
}

// Bedrijfsgegevens van FMID voor alle documenten (inkooporder, orderbevestiging,
// pakbon, factuur). Bank-, KvK- en BTW-gegevens zoals op het briefpapier
// (F:\Huisstijl FMI Dussen\Drukwerk\Brief_FMID_voorzijde); lege velden worden
// niet getoond.
export const BEDRIJF = {
  naam: 'F.M.I. Dussen B.V.',
  adres: ['Loswal 5', '4271 BA  Dussen', 'Nederland'],
  telefoon: '+31 (0)416 39 22 33',
  fax: '+31 (0)416 39 21 26',
  email: 'info@fmid.nl',
  website: 'www.fmid.nl',
  bank: '1018.77.617',
  bic: 'RABONL2U',
  iban: 'NL10 RABO 0101 8776 17',
  kvkNummer: '17226152',
  kvkPlaats: 'Tilburg',
  btwNummer: 'NL8194.25.680.B01',
}

// "2026-10-01" -> "1-10-2026" (kop) of "01-10-26" (regels), zoals op de oude order.
export function datumLang(iso) {
  if (!iso) return ''
  const [j, m, d] = iso.split('-')
  return `${Number(d)}-${Number(m)}-${j}`
}

export function datumKort(iso) {
  if (!iso) return ''
  const [j, m, d] = iso.split('-')
  return `${d}-${m}-${j.slice(2)}`
}

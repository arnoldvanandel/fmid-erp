import { doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { barcodeCodesVan, zoekTermen } from './artikelZoeken'

function trim(waarde) {
  return String(waarde || '').trim()
}

function optioneelAantal(waarde) {
  if (waarde === '' || waarde == null) return null
  const n = Number(String(waarde).replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

// Hangt een gescande barcode aan een artikel, met optioneel doos-/zak-inhoud.
// soort: 'zak' | 'doos' | 'beide'
export async function koppelBarcodeAanArtikel(artikel, { barcode, soort = 'zak', stuksPerDoos, stuksPerZak } = {}) {
  const code = trim(barcode)
  if (!artikel?.id) throw new Error('Geen artikel gekozen.')
  if (!code) throw new Error('Geen barcode om te koppelen.')

  const barcodeDoos =
    soort === 'doos' || soort === 'beide' ? code : trim(artikel.barcodeDoos)
  const barcodeZak =
    soort === 'zak' || soort === 'beide' ? code : trim(artikel.barcodeZak)
  const doos = optioneelAantal(stuksPerDoos)
  const zak = optioneelAantal(stuksPerZak)

  const data = {
    barcodeDoos,
    barcodeZak,
    barcode: barcodeDoos || barcodeZak || trim(artikel.barcode) || code,
    barcodeCodes: barcodeCodesVan({
      barcodeDoos,
      barcodeZak,
      barcode: code,
      barcodeCodes: artikel.barcodeCodes,
    }),
    barcodeBron: 'handmatig',
  }
  if (doos != null) data.stuksPerDoos = doos
  else if (artikel.stuksPerDoos != null) data.stuksPerDoos = Number(artikel.stuksPerDoos) || 0
  if (zak != null) data.stuksPerZak = zak
  else if (artikel.stuksPerZak != null) data.stuksPerZak = Number(artikel.stuksPerZak) || 0

  data.zoek = zoekTermen({
    artikelnummer: artikel.artikelnummer,
    naam: artikel.naam,
    zoeknaam: artikel.zoeknaam,
    barcode: data.barcode,
    barcodeDoos: data.barcodeDoos,
    barcodeZak: data.barcodeZak,
    labels: artikel.labels,
  })

  await updateDoc(doc(db, 'artikelen', artikel.id), data)
  return { ...artikel, ...data }
}

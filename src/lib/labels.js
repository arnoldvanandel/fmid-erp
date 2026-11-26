// Verpakkingslabels uit temp3.xlsm (blad Labels). De weegkolom wordt niet gebruikt.

export const LABELPRINTER_URL = 'http://127.0.0.1:8791'
export const PRINTER_SLEUTEL = 'fmid.labelPrinter'

// Eén paginaformaat voor de labelprinter. Komt overeen met het afdrukbereik
// van de Excel-bladen (ongeveer 94 × 96 mm). De afdruk schuift 4 mm naar rechts
// zodat het bereik op de sticker valt.
export const LABEL_MAAT = { breedteMm: 96, hoogteMm: 98 }
export const AFDRUK_VERSCHUIVING_MM = 4

const MERK = {
  PCC: 'pcc.jpg',
  'PCC-V': 'pcc-v.jpg',
  INP: 'inp.jpg',
  'PCC-BONFIX': 'bonfix.png',
  'PCC-M-C': 'pcc-m-c.jpg',
  'PCC-INOX': 'pcc-inox.jpg',
  'PCC-M-C1': 'pcc-m-c1.jpg',
  ZEH: 'zeh.jpg',
}

// Snelkeuze op de labelpagina. De soorten zijn de Excel-bladen uit temp3.
export const LABEL_KLANTEN = [
  { id: 'ANBO', label: 'ANBO', soorten: ['Label'] },
  { id: 'PCC', label: 'PCC', soorten: ['PCC', 'PCC-V', 'PCC-INOX', 'PCC-KK', 'PCC-M-C', 'PCC-M-C1'] },
  { id: 'Zehnder', label: 'Zehnder', soorten: ['ZEH'] },
  { id: 'Betherma', label: 'Betherma', soorten: ['BET'] },
  { id: 'Bonfix', label: 'Bonfix', soorten: ['PCC-BONFIX'] },
  { id: 'HIT', label: 'HIT', soorten: ['HIT'] },
  { id: 'INP', label: 'INP', soorten: ['INP'] },
  { id: 'VSH', label: 'VSH', soorten: ['VSH'] },
]

export function klantVanSoort(soort) {
  return LABEL_KLANTEN.find((klant) => klant.soorten.includes(soort))?.id || ''
}

export function laadLabelcatalogus() {
  return import('../../scripts/labelgegevens.json').then((mod) => mod.default)
}

export function artikelSleutel(artikel) {
  const label = artikel?.labels?.[0]
  if (!label) return ''
  return compact(label.artNr || label.id) || String(label.barcode || '')
}

// Artikelen van één klant, doos en zak bij elkaar, gesorteerd op artikelnummer.
export function artikelenVoorKlant(lijst, klantId) {
  const klant = LABEL_KLANTEN.find((k) => k.id === klantId)
  if (!klant || !lijst?.length) return []
  const soorten = new Set(klant.soorten)
  const groepen = new Map()
  for (const regel of lijst) {
    if (!soorten.has(regel.soort)) continue
    const nr = compact(regel.artNr || regel.id) || String(regel.barcode || '')
    if (!nr) continue
    if (!groepen.has(nr)) groepen.set(nr, [])
    groepen.get(nr).push(regel)
  }
  return [...groepen.values()]
    .map((groep) => ({
      sleutel: compact(groep[0].artNr || groep[0].id) || String(groep[0].barcode || ''),
      artikelnummer: groep[0].artNr || groep[0].id,
      naam: groep[0].nl1 || groep[0].type || '',
      labels: groep,
    }))
    .sort((a, b) => String(a.artikelnummer).localeCompare(String(b.artikelnummer), 'nl', { numeric: true }))
}

export function familieVan(soort) {
  if (soort === 'PCC-BONFIX') return 'bonfix'
  if (soort === 'ZEH') return 'zeh'
  if (soort === 'BET') return 'bet'
  if (soort === 'Label' || soort === 'VSH') return 'klassiek'
  return 'pcc'
}

export function merkBestand(soort) {
  return MERK[soort] ? `/labels/merk/${MERK[soort]}` : ''
}

export function fotoUrl(naam) {
  const bestand = String(naam || '').trim()
  if (!bestand || bestand === '0') return ''
  return `/labels/foto/${encodeURIComponent(bestand)}`
}

export function locatieUrl(locatie) {
  const naam = String(locatie || '').trim()
  if (naam !== 'korte zijde rechts' && naam !== 'lange zijde rechts') return ''
  return `/labels/locatie/${encodeURIComponent(naam)}.jpg`
}

// Doos (id eindigt op D) of zak (Z), zoals in de Excel-lijst.
export function verpakkingVan(label) {
  const id = String(label?.id || '')
  if (/D$/i.test(id)) return 'Doos'
  if (/Z$/i.test(id)) return 'Zak'
  return 'Verpakking'
}

// PCC drukt de datum als jj/mm, BET als mm-dd-jj (Excel-opmaak van die bladen).
export function labelDatum(soort, datum = new Date()) {
  const jj = String(datum.getFullYear()).slice(2)
  const mm = String(datum.getMonth() + 1).padStart(2, '0')
  const dd = String(datum.getDate()).padStart(2, '0')
  if (soort === 'BET') return `${mm}-${dd}-${jj}`
  return `${jj}/${mm}`
}

function compact(waarde) {
  return String(waarde || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

// Zelfde artikelnummer in de Excel-lijst (doos en zak horen bij elkaar).
function groepVan(lijst, label) {
  const nr = compact(label.artNr || label.id)
  if (!nr) return [label]
  const groep = lijst.filter((r) => compact(r.artNr || r.id) === nr)
  return groep.length ? groep : [label]
}

// Zoekt in de labellijst als het artikel in ERP geen label heeft.
export function zoekLabelgegevens(term, lijst) {
  const q = String(term || '').trim().toLowerCase()
  if (!q || !lijst?.length) return []
  const opBarcode = lijst.filter((r) => String(r.barcode) === String(term).trim())
  if (opBarcode.length) return [groepVan(lijst, opBarcode[0])]
  const c = compact(q)
  const groepen = new Map()
  for (const regel of lijst) {
    const hay = [regel.artNr, regel.id, regel.type, regel.nl1, regel.barcode].join(' ').toLowerCase()
    const past = hay.includes(q) || (c.length >= 4 && compact(regel.artNr).includes(c))
    if (!past) continue
    const nr = compact(regel.artNr || regel.id) || regel.barcode
    if (!groepen.has(nr)) groepen.set(nr, groepVan(lijst, regel))
    if (groepen.size >= 12) break
  }
  return [...groepen.values()]
}

export function printerNaam() {
  try {
    return localStorage.getItem(PRINTER_SLEUTEL) || ''
  } catch {
    return ''
  }
}

export function bewaarPrinterNaam(naam) {
  localStorage.setItem(PRINTER_SLEUTEL, naam || '')
}

// Chrome blokkeert een https-site die http://127.0.0.1 aanroept, tenzij het verzoek
// als loopback is aangemerkt. Oudere browsers kennen die optie niet.
function labelprinterVerzoek(pad, opties = {}) {
  const url = `${LABELPRINTER_URL}${pad}`
  const basis = { mode: 'cors', ...opties }
  try {
    return new Request(url, { ...basis, targetAddressSpace: 'loopback' })
  } catch {
    return new Request(url, basis)
  }
}

async function labelprinterFetch(pad, opties) {
  try {
    return await fetch(labelprinterVerzoek(pad, opties))
  } catch (err) {
    const bericht = String(err?.message || '')
    if (/failed to fetch/i.test(bericht)) {
      throw new Error(
        'Geen antwoord van de labelprinter op deze pc. Laat het venster met node scripts/labelprinter.mjs openstaan. In Chrome: slotje bij het adres, site-instellingen, lokaal netwerk of loopback toestaan.'
      )
    }
    throw err
  }
}

// Chrome vraagt toestemming voor http://127.0.0.1 vanaf de live site.
// Niet de oude naam 'local-network-access': die laat oudere Chrome vastlopen.
export async function loopbackStatus() {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) return 'onbekend'
  try {
    const status = await navigator.permissions.query({ name: 'loopback-network' })
    return status.state || 'onbekend'
  } catch {
    return 'onbekend'
  }
}

export async function haalPrintersOp() {
  const res = await labelprinterFetch('/printers')
  if (!res.ok) throw new Error('Labelprinter niet bereikbaar')
  const data = await res.json()
  return { printers: data.printers || [], printer: String(data.printer || '').trim() }
}

export async function zetPrinterVast(printer) {
  const res = await labelprinterFetch('/instelling', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ printer }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.fout || 'Printer vastzetten mislukt')
  bewaarPrinterNaam(data.printer || printer)
  return data.printer || printer
}

export async function drukAfOpPrinter({ printer, copies, pngBase64, widthMm, heightMm }) {
  const res = await labelprinterFetch('/print', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ printer, copies, pngBase64, widthMm, heightMm }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.fout || 'Afdrukken mislukt')
  return data
}

// Maakt een afbeelding van het label op het scherm en stuurt die naar de printer.
export async function drukElementAf(element, { printer, copies }) {
  const { default: html2canvas } = await import('html2canvas')
  const canvas = await html2canvas(element, { scale: 3, backgroundColor: '#ffffff', useCORS: true })
  const verschuivingPx = Math.round(canvas.width * (AFDRUK_VERSCHUIVING_MM / LABEL_MAAT.breedteMm))
  const vel = document.createElement('canvas')
  vel.width = canvas.width
  vel.height = canvas.height
  const ctx = vel.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, vel.width, vel.height)
  ctx.drawImage(canvas, verschuivingPx, 0)
  return drukAfOpPrinter({
    printer,
    copies,
    pngBase64: vel.toDataURL('image/png').split(',')[1],
    widthMm: LABEL_MAAT.breedteMm,
    heightMm: LABEL_MAAT.hoogteMm,
  })
}

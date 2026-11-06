// Zet de labelregels uit scripts/labelgegevens.json op de artikelen in Firestore.
// Koppelt op barcode (doos/zak) en, als dat niet lukt, op artikelnummer.
//
//   node scripts/importeer-labels.mjs           # telt alleen
//   node scripts/importeer-labels.mjs --schrijf # schrijft naar Firestore

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const SCHRIJVEN = process.argv.includes('--schrijf')
const PROJECT = 'fmid-erp-fc354'
const CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com'
const CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi'

const MAX_TERM = 20

function woorden(tekst) {
  return String(tekst || '')
    .toLowerCase()
    .split(/[\s,;:()/\\+*"'[\]{}]+|(?<=\D)\.|\.(?=\D)/)
    .flatMap((w) => [w, ...w.split('-')])
    .map((w) => w.trim())
    .filter(Boolean)
}

function voorvoegsels(woord) {
  const w = woord.slice(0, MAX_TERM)
  const lijst = []
  for (let i = 1; i <= w.length; i++) lijst.push(w.slice(0, i))
  return lijst
}

function zoekTermen({ artikelnummer, naam, zoeknaam, barcode, barcodeDoos, barcodeZak, labels }) {
  const termen = new Set()
  const nummer = String(artikelnummer || '').toLowerCase().trim()
  for (const t of voorvoegsels(nummer)) termen.add(t)
  const extra = (labels || []).flatMap((l) => [l.artNr, l.id, l.barcode, l.type, l.nl1])
  for (const w of [
    ...woorden(artikelnummer),
    ...woorden(naam),
    ...woorden(zoeknaam),
    ...woorden(barcode),
    ...woorden(barcodeDoos),
    ...woorden(barcodeZak),
    ...extra.flatMap(woorden),
  ]) {
    for (const t of voorvoegsels(w)) termen.add(t)
  }
  return [...termen]
}

function code(waarde) {
  return String(waarde ?? '').trim()
}

function sleutel(waarde) {
  return code(waarde).toLowerCase().replace(/\s+/g, '')
}

function compact(waarde) {
  return sleutel(waarde).replace(/[^a-z0-9]/g, '')
}

async function token() {
  const cfg = JSON.parse(readFileSync(join(homedir(), '.config', 'configstore', 'firebase-tools.json'), 'utf8'))
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: cfg.tokens.refresh_token,
    grant_type: 'refresh_token',
  })
  const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body })
  const json = await res.json()
  if (!json.access_token) throw new Error(json.error_description || 'Geen toegang tot Firestore')
  return json.access_token
}

const labels = JSON.parse(readFileSync(new URL('./labelgegevens.json', import.meta.url), 'utf8'))
const opBarcode = new Map()
const opNummer = new Map()
const opCompact = new Map()
for (const label of labels) {
  const barcode = code(label.barcode)
  if (barcode) {
    if (!opBarcode.has(barcode)) opBarcode.set(barcode, [])
    opBarcode.get(barcode).push(label)
  }
  for (const nr of [label.artNr, label.id]) {
    const k = sleutel(nr)
    if (!k) continue
    if (!opNummer.has(k)) opNummer.set(k, [])
    opNummer.get(k).push(label)
  }
  const c = compact(label.artNr)
  if (c.length < 6) continue
  const bestaand = opCompact.get(c)
  if (!bestaand) opCompact.set(c, [label])
  else if (sleutel(bestaand[0].artNr) === sleutel(label.artNr)) bestaand.push(label)
  else opCompact.set(c, null)
}

function labelsVoor(artikel) {
  const gevonden = new Map()
  const codes = [artikel.barcode, artikel.barcodeDoos, artikel.barcodeZak, ...(artikel.barcodeCodes || [])]
  for (const c of codes) {
    for (const label of opBarcode.get(code(c)) || []) gevonden.set(`${label.id}|${label.barcode}`, label)
  }
  const nr = sleutel(artikel.artikelnummer)
  if (nr) {
    for (const label of opNummer.get(nr) || []) gevonden.set(`${label.id}|${label.barcode}`, label)
  }
  if (gevonden.size === 0) {
    const extra = opCompact.get(compact(artikel.artikelnummer))
    for (const label of extra || []) gevonden.set(`${label.id}|${label.barcode}`, label)
  }
  return [...gevonden.values()]
}

function patchVoor(artikel, lijst) {
  let barcodeDoos = code(artikel.barcodeDoos)
  let barcodeZak = code(artikel.barcodeZak)
  let stuksPerDoos = artikel.stuksPerDoos ?? null
  let stuksPerZak = artikel.stuksPerZak ?? null
  const codes = new Set((artikel.barcodeCodes || []).map(code).filter(Boolean))
  for (const label of lijst) {
    if (label.barcode) codes.add(code(label.barcode))
    const aantal = Number(label.aantal)
    if (/D$/i.test(label.id)) {
      if (!barcodeDoos && label.barcode) barcodeDoos = code(label.barcode)
      if (!stuksPerDoos && aantal > 0) stuksPerDoos = aantal
    }
    if (/Z$/i.test(label.id)) {
      if (!barcodeZak && label.barcode) barcodeZak = code(label.barcode)
      if (!stuksPerZak && aantal > 0) stuksPerZak = aantal
    }
  }
  const barcode = code(artikel.barcode) || barcodeDoos || barcodeZak || [...codes][0] || ''
  const data = {
    labels: lijst,
    barcode,
    barcodeDoos,
    barcodeZak,
    barcodeCodes: [...codes],
    stuksPerDoos,
    stuksPerZak,
  }
  data.zoek = zoekTermen({ ...artikel, ...data, labels: lijst })
  return data
}

function decode(waarde) {
  if (!waarde) return undefined
  if ('stringValue' in waarde) return waarde.stringValue
  if ('integerValue' in waarde) return Number(waarde.integerValue)
  if ('doubleValue' in waarde) return waarde.doubleValue
  if ('booleanValue' in waarde) return waarde.booleanValue
  if ('nullValue' in waarde) return null
  if ('arrayValue' in waarde) return (waarde.arrayValue.values || []).map(decode)
  if ('mapValue' in waarde) {
    const obj = {}
    for (const [sleutel, veld] of Object.entries(waarde.mapValue.fields || {})) obj[sleutel] = decode(veld)
    return obj
  }
  return undefined
}

function encode(waarde) {
  if (waarde === null || waarde === undefined) return { nullValue: null }
  if (typeof waarde === 'string') return { stringValue: waarde }
  if (typeof waarde === 'boolean') return { booleanValue: waarde }
  if (typeof waarde === 'number') {
    return Number.isInteger(waarde) ? { integerValue: String(waarde) } : { doubleValue: waarde }
  }
  if (Array.isArray(waarde)) return { arrayValue: { values: waarde.map(encode) } }
  if (typeof waarde === 'object') {
    const fields = {}
    for (const [sleutel, veld] of Object.entries(waarde)) fields[sleutel] = encode(veld)
    return { mapValue: { fields } }
  }
  return { stringValue: String(waarde) }
}

async function alleArtikelen(toegang) {
  const velden = ['artikelnummer', 'naam', 'zoeknaam', 'barcode', 'barcodeDoos', 'barcodeZak', 'barcodeCodes', 'stuksPerDoos', 'stuksPerZak']
  const mask = velden.map((v) => `mask.fieldPaths=${v}`).join('&')
  const basis = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/artikelen`
  const docs = []
  let pageToken = ''
  do {
    const url = `${basis}?pageSize=1000&${mask}${pageToken ? `&pageToken=${pageToken}` : ''}`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${toegang}` } })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error?.message || 'Artikelen lezen mislukt')
    for (const doc of json.documents || []) {
      const id = doc.name.split('/').pop()
      const artikel = {}
      for (const [sleutel, veld] of Object.entries(doc.fields || {})) artikel[sleutel] = decode(veld)
      docs.push({ id, name: doc.name, artikel })
    }
    pageToken = json.nextPageToken || ''
    process.stdout.write(`\r  gelezen ${docs.length}`)
  } while (pageToken)
  process.stdout.write('\n')
  return docs
}

const toegang = await token()
console.log(SCHRIJVEN ? 'Schrijven…' : 'Proef (niets schrijven)…')
const snap = await alleArtikelen(toegang)

const gebruikt = new Set()
const bijwerken = []
for (const doc of snap) {
  const lijst = labelsVoor(doc.artikel)
  if (!lijst.length) continue
  for (const label of lijst) gebruikt.add(`${label.id}|${label.barcode}`)
  bijwerken.push({ name: doc.name, nummer: doc.artikel.artikelnummer, data: patchVoor(doc.artikel, lijst) })
}

const meeste = bijwerken.reduce((best, item) => (item.data.labels.length > (best?.data.labels.length || 0) ? item : best), null)
console.log(`Artikelen: ${snap.length}`)
console.log(`Artikelen met label: ${bijwerken.length}`)
console.log(`Labelregels gekoppeld: ${gebruikt.size} van ${labels.length}`)
console.log(`Niet gekoppeld: ${labels.length - gebruikt.size}`)
if (meeste) console.log(`Meeste labels op één artikel: ${meeste.data.labels.length} (${meeste.nummer})`)
const los = labels.filter((l) => !gebruikt.has(`${l.id}|${l.barcode}`)).slice(0, 8)
for (const l of los) console.log(`  los ${l.barcode} ${l.id} ${l.artNr} ${l.soort}`)

if (!SCHRIJVEN) {
  console.log('Niets geschreven. Opnieuw met --schrijf om de artikelen bij te werken.')
  process.exit(0)
}

const velden = ['labels', 'barcode', 'barcodeDoos', 'barcodeZak', 'barcodeCodes', 'stuksPerDoos', 'stuksPerZak', 'zoek']
let geschreven = 0
for (let i = 0; i < bijwerken.length; i += 400) {
  const deel = bijwerken.slice(i, i + 400)
  const writes = deel.map((item) => ({
    update: {
      name: item.name,
      fields: Object.fromEntries(velden.map((veld) => [veld, encode(item.data[veld])])),
    },
    updateMask: { fieldPaths: velden },
  }))
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents:commit`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${toegang}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ writes }),
    }
  )
  const json = await res.json()
  if (!res.ok) throw new Error(json.error?.message || 'Schrijven mislukt')
  geschreven += deel.length
  console.log(`  ${geschreven}`)
}
console.log(`Bijgewerkt: ${geschreven}`)

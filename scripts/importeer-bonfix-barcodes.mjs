// Zet Bonfix-barcodes (scripts/bonfix-barcodes.json) op BON-artikelen.
// Artcode in het Excel is A… → artikelnummer BON…
//
//   node scripts/importeer-bonfix-barcodes.mjs           # telt alleen
//   node scripts/importeer-bonfix-barcodes.mjs --schrijf # schrijft naar Firestore

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
  const extra = (labels || []).flatMap((l) => [l?.artNr, l?.id, l?.barcode, l?.type, l?.nl1])
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

function kandidaten(artikelnummer) {
  const nr = code(artikelnummer)
  if (!nr) return []
  const set = new Set([nr])
  const m = /^BON(.+)$/i.exec(nr)
  if (m) {
    const rest = m[1]
    const [eerste, ...overig] = rest.split(' ')
    set.add(`BON${rest}`)
    set.add(`BON${rest.toUpperCase()}`)
    set.add(`BON${[eerste.toUpperCase(), ...overig].join(' ')}`)
    set.add(`BON${[eerste.toLowerCase(), ...overig].join(' ')}`)
  }
  return [...set]
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
    for (const [k, veld] of Object.entries(waarde.mapValue.fields || {})) obj[k] = decode(veld)
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
    for (const [k, veld] of Object.entries(waarde)) fields[k] = encode(veld)
    return { mapValue: { fields } }
  }
  return { stringValue: String(waarde) }
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

async function alleArtikelen(toegang) {
  const velden = [
    'artikelnummer',
    'naam',
    'zoeknaam',
    'barcode',
    'barcodeDoos',
    'barcodeZak',
    'barcodeCodes',
    'stuksPerDoos',
    'stuksPerZak',
    'labels',
  ]
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
      for (const [k, veld] of Object.entries(doc.fields || {})) artikel[k] = decode(veld)
      docs.push({ id, name: doc.name, artikel })
    }
    pageToken = json.nextPageToken || ''
    process.stdout.write(`\r  gelezen ${docs.length}`)
  } while (pageToken)
  process.stdout.write('\n')
  return docs
}

function patchVoor(artikel, regel) {
  const barcode = code(regel.barcode)
  const codes = new Set((artikel.barcodeCodes || []).map(code).filter(Boolean))
  codes.add(barcode)

  // Bonfix levert één EAN per artikel; die zit meestal op het zakje.
  // Alleen als er geen zakken zijn, zetten we hem als doosbarcode.
  let barcodeZak = code(artikel.barcodeZak)
  let barcodeDoos = code(artikel.barcodeDoos)
  if (regel.stuksPerZak) barcodeZak = barcodeZak || barcode
  else if (regel.stuksPerDoos) barcodeDoos = barcodeDoos || barcode
  else barcodeZak = barcodeZak || barcode

  if (barcodeZak) codes.add(barcodeZak)
  if (barcodeDoos) codes.add(barcodeDoos)

  const data = {
    barcode: code(artikel.barcode) || barcodeDoos || barcodeZak || barcode,
    barcodeDoos,
    barcodeZak,
    barcodeCodes: [...codes],
    stuksPerDoos: regel.stuksPerDoos != null ? Number(regel.stuksPerDoos) : artikel.stuksPerDoos ?? null,
    stuksPerZak: regel.stuksPerZak != null ? Number(regel.stuksPerZak) : artikel.stuksPerZak ?? null,
    barcodeBron: 'bonfix',
  }
  data.zoek = zoekTermen({ ...artikel, ...data, labels: artikel.labels || [] })
  return data
}

function gewijzigd(oud, nieuw) {
  const velden = ['barcode', 'barcodeDoos', 'barcodeZak', 'stuksPerDoos', 'stuksPerZak', 'barcodeBron']
  for (const v of velden) {
    if (String(oud[v] ?? '') !== String(nieuw[v] ?? '')) return true
  }
  const a = [...(oud.barcodeCodes || [])].map(String).sort().join('|')
  const b = [...(nieuw.barcodeCodes || [])].map(String).sort().join('|')
  return a !== b
}

const regels = JSON.parse(readFileSync(new URL('./bonfix-barcodes.json', import.meta.url), 'utf8'))
const toegang = await token()
console.log(SCHRIJVEN ? 'Schrijven…' : 'Proef (niets schrijven)…')
const snap = await alleArtikelen(toegang)

const opNummer = new Map()
for (const doc of snap) {
  const k = sleutel(doc.artikel.artikelnummer)
  if (!k) continue
  if (!opNummer.has(k)) opNummer.set(k, [])
  opNummer.get(k).push(doc)
}

const bijwerken = []
const ontbreekt = []
const dubbel = []
for (const regel of regels) {
  const docs = []
  const gezien = new Set()
  for (const kandidaat of kandidaten(regel.artikelnummer)) {
    for (const doc of opNummer.get(sleutel(kandidaat)) || []) {
      if (gezien.has(doc.id)) continue
      gezien.add(doc.id)
      docs.push(doc)
    }
  }
  if (docs.length === 0) {
    ontbreekt.push(regel.artikelnummer)
    continue
  }
  if (docs.length > 1) {
    dubbel.push(`${regel.artikelnummer} → ${docs.map((d) => d.artikel.artikelnummer).join(', ')}`)
  }
  const doc = docs[0]
  const data = patchVoor(doc.artikel, regel)
  if (!gewijzigd(doc.artikel, data)) continue
  bijwerken.push({ name: doc.name, nummer: doc.artikel.artikelnummer, barcode: regel.barcode, data })
}

console.log(`Bonfix-regels: ${regels.length}`)
console.log(`Artikelen bijwerken: ${bijwerken.length}`)
console.log(`Geen BON-artikel: ${ontbreekt.length}`)
if (ontbreekt.length) console.log('  ', ontbreekt.slice(0, 12).join(' · '), ontbreekt.length > 12 ? '…' : '')
console.log(`Meerdere treffers: ${dubbel.length}`)
if (dubbel.length) console.log('  ', dubbel.slice(0, 8).join('\n   '))
const voorbeeld = bijwerken.find((b) => b.barcode === '8717845533106') || bijwerken[0]
if (voorbeeld) {
  console.log(
    `Voorbeeld: ${voorbeeld.nummer} barcode ${voorbeeld.barcode} doos=${voorbeeld.data.stuksPerDoos} zak=${voorbeeld.data.stuksPerZak}`
  )
}

if (!SCHRIJVEN) {
  console.log('Niets geschreven. Opnieuw met --schrijf om de artikelen bij te werken.')
  process.exit(0)
}

const velden = [
  'barcode',
  'barcodeDoos',
  'barcodeZak',
  'barcodeCodes',
  'stuksPerDoos',
  'stuksPerZak',
  'zoek',
  'barcodeBron',
]
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

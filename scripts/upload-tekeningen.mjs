// Zet de Axapta-tekeningen (H:\Drawing\Axapta\…) in Firebase Storage, zodat ze
// ook op de online site en op de telefoon opengaan. De downloadlink komt op het
// artikel in `tekeningen[].url`; de app gebruikt die link als hij er is.
//
//   node scripts/upload-tekeningen.mjs           # telt alleen
//   node scripts/upload-tekeningen.mjs --schrijf # uploadt en werkt artikelen bij
//
// Opnieuw draaien is veilig: tekeningen met een url worden overgeslagen.
// Draai dit op een pc die bij de H:-schijf kan, ingelogd met `firebase login`.

import { randomUUID } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, extname, win32 } from 'node:path'

const SCHRIJVEN = process.argv.includes('--schrijf')
const PROJECT = 'fmid-erp-fc354'
const BUCKET = 'fmid-erp-fc354.firebasestorage.app'
// Openbare client van de Firebase CLI (zelfde als scripts/importeer-labels.mjs).
const CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com'
const CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi'
const FIRESTORE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`

const TYPES = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
}

async function token() {
  const cfg = JSON.parse(
    readFileSync(win32.join(homedir(), '.config', 'configstore', 'firebase-tools.json'), 'utf8')
  )
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: cfg.tokens.refresh_token,
    grant_type: 'refresh_token',
  })
  const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body })
  const json = await res.json()
  if (!json.access_token) throw new Error(json.error_description || 'Geen toegang (firebase login?)')
  return json.access_token
}

function decode(waarde) {
  if (!waarde) return undefined
  if ('stringValue' in waarde) return waarde.stringValue
  if ('integerValue' in waarde) return Number(waarde.integerValue)
  if ('doubleValue' in waarde) return waarde.doubleValue
  if ('booleanValue' in waarde) return waarde.booleanValue
  if ('nullValue' in waarde) return null
  if ('timestampValue' in waarde) return waarde.timestampValue
  if ('arrayValue' in waarde) return (waarde.arrayValue.values || []).map(decode)
  if ('mapValue' in waarde) {
    const obj = {}
    for (const [k, v] of Object.entries(waarde.mapValue.fields || {})) obj[k] = decode(v)
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
    for (const [k, v] of Object.entries(waarde)) fields[k] = encode(v)
    return { mapValue: { fields } }
  }
  return { stringValue: String(waarde) }
}

async function artikelenMetTekening(toegang) {
  const mask = ['artikelnummer', 'tekeningen'].map((v) => `mask.fieldPaths=${v}`).join('&')
  const docs = []
  let pageToken = ''
  do {
    const url = `${FIRESTORE}/artikelen?pageSize=1000&${mask}${pageToken ? `&pageToken=${pageToken}` : ''}`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${toegang}` } })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error?.message || 'Artikelen lezen mislukt')
    for (const d of json.documents || []) {
      const tekeningen = decode(d.fields?.tekeningen)
      if (Array.isArray(tekeningen) && tekeningen.length) {
        docs.push({ name: d.name, nummer: decode(d.fields?.artikelnummer) || '', tekeningen })
      }
    }
    pageToken = json.nextPageToken || ''
    process.stdout.write(`\r  artikelen met tekening: ${docs.length}`)
  } while (pageToken)
  process.stdout.write('\n')
  return docs
}

// Vaste plek in Storage per bestand, zodat één tekening bij meerdere artikelen
// maar één keer geüpload wordt.
function objectNaam(pad) {
  const schoon = win32
    .normalize(pad)
    .replace(/^[A-Za-z]:\\/, '')
    .replace(/^\\\\/, '')
    .split('\\')
    .map((deel) => deel.replace(/[#?[\]*]/g, '_'))
    .join('/')
  return `tekeningen/${schoon}`
}

async function upload(toegang, pad) {
  const naam = objectNaam(pad)
  const type = TYPES[extname(pad).toLowerCase()] || 'application/octet-stream'
  const tokenWaarde = randomUUID()
  const grens = `fmid-${randomUUID()}`
  const meta = JSON.stringify({
    name: naam,
    contentType: type,
    contentDisposition: `inline; filename="${basename(win32.basename(pad)).replace(/"/g, '')}"`,
    metadata: { firebaseStorageDownloadTokens: tokenWaarde, bron: pad },
  })
  const body = Buffer.concat([
    Buffer.from(`--${grens}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`),
    Buffer.from(`--${grens}\r\nContent-Type: ${type}\r\n\r\n`),
    readFileSync(pad),
    Buffer.from(`\r\n--${grens}--`),
  ])
  const res = await fetch(
    `https://storage.googleapis.com/upload/storage/v1/b/${BUCKET}/o?uploadType=multipart`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${toegang}`,
        'Content-Type': `multipart/related; boundary=${grens}`,
      },
      body,
    }
  )
  const json = await res.json()
  if (!res.ok) throw new Error(json.error?.message || `Upload mislukt (${res.status})`)
  return {
    storagePath: naam,
    url: `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(naam)}?alt=media&token=${tokenWaarde}`,
  }
}

const toegang = await token()
console.log(SCHRIJVEN ? 'Uploaden…' : 'Proef (niets uploaden)…')
const artikelen = await artikelenMetTekening(toegang)

// Alle unieke paden die nog geen url hebben.
const teDoen = new Map()
let alKlaar = 0
for (const a of artikelen) {
  for (const t of a.tekeningen) {
    if (!t?.pad) continue
    if (t.url) alKlaar++
    else teDoen.set(t.pad, null)
  }
}

// Oude paden (H:\Tekeningen\…, \\2003srv01\…) staan vaak gewoon in de huidige map.
const HUIDIGE_MAP = 'H:\\Drawing\\Axapta'
function grootte(pad) {
  try {
    const st = statSync(pad)
    return st.isFile() ? st.size : -1
  } catch {
    return -1
  }
}

const bronVan = new Map()
let ontbreekt = 0
let bytes = 0
for (const pad of [...teDoen.keys()]) {
  const kandidaten = [pad, win32.join(HUIDIGE_MAP, win32.basename(pad))]
  const bron = kandidaten.find((k) => grootte(k) >= 0)
  if (bron) {
    bronVan.set(pad, bron)
    bytes += grootte(bron)
  } else {
    ontbreekt++
    teDoen.delete(pad)
    console.log(`  niet gevonden: ${pad}`)
  }
}
console.log(`Tekeningen al online: ${alKlaar}`)
console.log(`Nog te uploaden: ${teDoen.size} bestanden (${(bytes / 1024 / 1024).toFixed(1)} MB)`)
console.log(`Niet gevonden op schijf: ${ontbreekt}`)

if (!SCHRIJVEN) {
  console.log('Niets geüpload. Opnieuw met --schrijf om te uploaden.')
  process.exit(0)
}

let klaar = 0
let mislukt = 0
const paden = [...teDoen.keys()]
const PARALLEL = 6
for (let i = 0; i < paden.length; i += PARALLEL) {
  await Promise.all(
    paden.slice(i, i + PARALLEL).map(async (pad) => {
      try {
        teDoen.set(pad, await upload(toegang, bronVan.get(pad)))
        klaar++
      } catch (err) {
        mislukt++
        console.log(`\n  mislukt: ${pad}: ${err.message}`)
      }
    })
  )
  process.stdout.write(`\r  geüpload ${klaar} van ${paden.length}`)
}
process.stdout.write('\n')

// Artikelen bijwerken: url en storagePath bij elke geüploade tekening.
const writes = []
for (const a of artikelen) {
  let gewijzigd = false
  const tekeningen = a.tekeningen.map((t) => {
    const online = t?.pad && !t.url ? teDoen.get(t.pad) : null
    if (!online) return t
    gewijzigd = true
    return { ...t, ...online }
  })
  if (gewijzigd) {
    writes.push({
      update: { name: a.name, fields: { tekeningen: encode(tekeningen) } },
      updateMask: { fieldPaths: ['tekeningen'] },
    })
  }
}
let geschreven = 0
for (let i = 0; i < writes.length; i += 400) {
  const deel = writes.slice(i, i + 400)
  const res = await fetch(`${FIRESTORE}:commit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${toegang}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ writes: deel }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error?.message || 'Artikelen bijwerken mislukt')
  geschreven += deel.length
}
console.log(`Geüpload: ${klaar}, mislukt: ${mislukt}, artikelen bijgewerkt: ${geschreven}`)

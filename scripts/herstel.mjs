// Zet een backup van scripts/backup.mjs terug (zie BACKUP.md).
//
//   npm run herstel -- <backupmap> --emulator          # proef: naar de lokale emulator
//   npm run herstel -- <backupmap> --productie         # naar het echte project
//
// Extra opties:
//   --collectie artikelen,klanten   alleen deze collecties
//   --project <id>                  ander Firebase-project (bijv. een nieuw project na een crash)
//   --storage                       ook de bestanden terugzetten (alleen met --productie)
//
// Bestaande documenten met hetzelfde id worden overschreven; documenten die niet
// in de backup staan blijven staan. De collectie `mail` wordt nooit teruggezet,
// anders verstuurt de Cloud Function `verstuurMail` alle oude mails opnieuw.

import { createReadStream, existsSync, readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { createInterface } from 'node:readline'

const CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com'
const CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi'
const NOOIT = new Set(['mail'])

const args = process.argv.slice(2)
function optie(naam) {
  const i = args.indexOf(naam)
  return i >= 0 ? args[i + 1] : undefined
}
const MAP = args.find((a, i) => !a.startsWith('--') && !['--collectie', '--project'].includes(args[i - 1]))
const EMULATOR = args.includes('--emulator')
const PRODUCTIE = args.includes('--productie')
const PROJECT = optie('--project') || (EMULATOR ? 'demo-fmid-erp' : 'fmid-erp-fc354')
const ALLEEN = optie('--collectie')
  ?.split(',')
  .map((c) => c.trim())
const STORAGE = args.includes('--storage') && PRODUCTIE

if (!MAP || EMULATOR === PRODUCTIE) {
  console.log(
    'Gebruik: npm run herstel -- <backupmap> --emulator | --productie [--collectie a,b] [--project id] [--storage]'
  )
  process.exit(1)
}
const SNAPSHOT = resolve(MAP)
if (!existsSync(join(SNAPSHOT, 'firestore'))) throw new Error(`Geen backup gevonden in ${SNAPSHOT}`)

const ROOT = EMULATOR ? 'http://127.0.0.1:8080/v1' : 'https://firestore.googleapis.com/v1'
const DB = `projects/${PROJECT}/databases/(default)`

let token = null
let tokenTijd = 0
async function toegang() {
  if (EMULATOR) return 'owner'
  if (token && Date.now() - tokenTijd < 40 * 60 * 1000) return token
  const cfg = JSON.parse(readFileSync(join(homedir(), '.config', 'configstore', 'firebase-tools.json'), 'utf8'))
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: cfg.tokens.refresh_token,
    grant_type: 'refresh_token',
  })
  const json = await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body })).json()
  if (!json.access_token) throw new Error(json.error_description || 'Geen toegang: draai eerst `npx firebase login`.')
  token = json.access_token
  tokenTijd = Date.now()
  return token
}

async function haal(url, opties = {}) {
  for (let poging = 1; ; poging++) {
    const res = await fetch(url, {
      ...opties,
      headers: { Authorization: `Bearer ${await toegang()}`, ...(opties.headers || {}) },
    })
    if (res.ok) return res
    if (poging < 4 && (res.status === 429 || res.status >= 500)) {
      await new Promise((r) => setTimeout(r, 2000 * poging))
      continue
    }
    throw new Error(`${res.status} bij ${url}: ${(await res.text()).slice(0, 300)}`)
  }
}

async function vraag(tekst) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const antwoord = await new Promise((r) => rl.question(tekst, r))
  rl.close()
  return antwoord.trim()
}

// Schrijft in batches van max. 400 documenten of ±4 MB (Firestore-limiet: 500 / 10 MB).
async function herstelCollectie(naam) {
  const regels = createInterface({ input: createReadStream(join(SNAPSHOT, 'firestore', `${naam}.ndjson`), 'utf8') })
  let batch = []
  let grootte = 0
  let aantal = 0
  async function schrijf() {
    if (!batch.length) return
    await haal(`${ROOT}/${DB}/documents:commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ writes: batch }),
    })
    aantal += batch.length
    batch = []
    grootte = 0
    process.stdout.write(`\r  ${naam}: ${aantal}`)
  }
  for await (const regel of regels) {
    if (!regel.trim()) continue
    const doc = JSON.parse(regel)
    const write = { update: { name: `${DB}/documents/${naam}/${doc.id}`, fields: doc.fields } }
    const lengte = JSON.stringify(write).length
    if (batch.length >= 400 || grootte + lengte > 4e6) await schrijf()
    batch.push(write)
    grootte += lengte
  }
  await schrijf()
  process.stdout.write(`\r  ${naam}: ${aantal}\n`)
  return aantal
}

async function herstelStorage() {
  const bucket = `${PROJECT}.firebasestorage.app`
  const lijst = JSON.parse(readFileSync(join(SNAPSHOT, 'storage-objecten.json'), 'utf8'))
  const spiegel = join(SNAPSHOT, '..', 'storage')
  let klaar = 0
  for (const o of lijst) {
    const data = readFileSync(join(spiegel, o.lokaalPad))
    const meta = {
      name: o.name,
      contentType: o.contentType,
      cacheControl: o.cacheControl,
      contentDisposition: o.contentDisposition,
      metadata: o.metadata,
    }
    const grens = 'fmid' + Math.random().toString(16).slice(2)
    const body = Buffer.concat([
      Buffer.from(`--${grens}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`),
      Buffer.from(`--${grens}\r\nContent-Type: ${o.contentType || 'application/octet-stream'}\r\n\r\n`),
      data,
      Buffer.from(`\r\n--${grens}--`),
    ])
    await haal(`https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=multipart`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${grens}` },
      body,
    })
    process.stdout.write(`\r  bestanden: ${++klaar}/${lijst.length}`)
  }
  process.stdout.write('\n')
}

const overzicht = JSON.parse(readFileSync(join(SNAPSHOT, 'overzicht.json'), 'utf8'))
const beschikbaar = readdirSync(join(SNAPSHOT, 'firestore'))
  .filter((f) => f.endsWith('.ndjson'))
  .map((f) => f.replace(/\.ndjson$/, ''))
const lijst = beschikbaar.filter((c) => !NOOIT.has(c) && (!ALLEEN || ALLEEN.includes(c)))
const totaal = lijst.reduce((som, c) => som + (overzicht.firestore?.[c] || 0), 0)

console.log(`Backup van ${overzicht.gemaakt} (versie ${overzicht.versie})`)
console.log(`Naar: ${EMULATOR ? 'EMULATOR' : 'PRODUCTIE'} project ${PROJECT}`)
console.log(`Collecties: ${lijst.join(', ')} (${totaal} documenten)${STORAGE ? ' + bestanden' : ''}`)

if (PRODUCTIE) {
  const antwoord = await vraag(`\nDit overschrijft documenten in ${PROJECT}. Typ HERSTEL om door te gaan: `)
  if (antwoord !== 'HERSTEL') {
    console.log('Afgebroken.')
    process.exit(1)
  }
}

for (const naam of lijst) await herstelCollectie(naam)
if (STORAGE) {
  console.log('Storage…')
  await herstelStorage()
}
console.log('Klaar.')

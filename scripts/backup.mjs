// Volledige backup van FMID ERP naar een map buiten Google (zie BACKUP.md).
//
//   npm run backup                       # naar Documenten\FMID-backup
//   npm run backup -- D:\FMID-backup     # naar een andere map
//   npm run backup -- --zonder-storage   # zonder bestanden (sneller)
//
// Wat erin gaat:
//   <map>\<datum_tijd>\firestore\<collectie>.ndjson   alle documenten, met Firestore-typen
//   <map>\<datum_tijd>\storage-objecten.json          lijst + metadata (downloadtokens) van alle bestanden
//   <map>\<datum_tijd>\gebruikers.json                inlogaccounts (firebase auth:export)
//   <map>\<datum_tijd>\fmid-erp.bundle                de hele git-repo (alle branches)
//   <map>\<datum_tijd>\config\                        .env.local, .firebaserc
//   <map>\storage\                                    de bestanden zelf (PDF's, tekeningen, foto's);
//                                                     gedeeld door alle backups, alleen nieuwe/gewijzigde
//                                                     bestanden worden opnieuw gedownload
//
// Inloggen gaat via `firebase login` (zelfde als scripts/upload-tekeningen.mjs).
// Kost één Firestore-read per document (± 20.000), dus niet elk uur draaien.

import { execFileSync, execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'

const PROJECT = 'fmid-erp-fc354'
const BUCKET = 'fmid-erp-fc354.firebasestorage.app'
// Openbare client van de Firebase CLI (zelfde als scripts/importeer-labels.mjs).
const CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com'
const CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi'
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Voor de test tegen de emulator: FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST
const FIRESTORE = EMULATOR
  ? `http://${EMULATOR}/v1/projects/demo-fmid-erp/databases/(default)/documents`
  : `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`

const args = process.argv.slice(2)
const ZONDER_STORAGE = args.includes('--zonder-storage') || !!EMULATOR
const doelArg = args.find((a) => !a.startsWith('--'))
const DOEL = resolve(doelArg || join(homedir(), 'Documents', 'FMID-backup'))

// --- Toegang -------------------------------------------------------------

let token = null
let tokenTijd = 0
async function toegang() {
  if (EMULATOR) return 'owner'
  if (token && Date.now() - tokenTijd < 40 * 60 * 1000) return token
  const pad = join(homedir(), '.config', 'configstore', 'firebase-tools.json')
  const cfg = JSON.parse(readFileSync(pad, 'utf8'))
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: cfg.tokens.refresh_token,
    grant_type: 'refresh_token',
  })
  const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body })
  const json = await res.json()
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

// --- Firestore -----------------------------------------------------------

async function collecties(parent) {
  const ids = []
  let pageToken = ''
  do {
    const res = await haal(`${parent}:listCollectionIds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageSize: 300, pageToken: pageToken || undefined }),
    })
    const json = await res.json()
    ids.push(...(json.collectionIds || []))
    pageToken = json.nextPageToken || ''
  } while (pageToken)
  return ids.sort()
}

// Schrijft elke collectie als NDJSON: één regel per document met de ruwe
// Firestore-velden, zodat datums, gehele getallen en verwijzingen bij het
// terugzetten precies hetzelfde blijven.
async function backupFirestore(map) {
  mkdirSync(map, { recursive: true })
  const lijst = await collecties(FIRESTORE)
  const aantallen = {}
  for (const naam of lijst) {
    const uit = createWriteStream(join(map, `${naam}.ndjson`), 'utf8')
    let aantal = 0
    let pageToken = ''
    do {
      const url = `${FIRESTORE}/${naam}?pageSize=1000${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`
      const json = await (await haal(url)).json()
      for (const doc of json.documents || []) {
        const regel = JSON.stringify({
          id: doc.name.split('/').pop(),
          fields: doc.fields || {},
          createTime: doc.createTime,
          updateTime: doc.updateTime,
        })
        if (!uit.write(regel + '\n')) await once(uit, 'drain')
        aantal++
      }
      pageToken = json.nextPageToken || ''
      process.stdout.write(`\r  ${naam}: ${aantal}`)
    } while (pageToken)
    uit.end()
    await once(uit, 'finish')
    process.stdout.write('\n')
    aantallen[naam] = aantal
  }
  return aantallen
}

// --- Storage -------------------------------------------------------------

// Windows kent sommige tekens niet in bestandsnamen.
function lokaalPad(naam) {
  return naam
    .split('/')
    .map((deel) => deel.replace(/[<>:"\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '_') || '_')
    .join('/')
}

function md5Base64(pad) {
  return createHash('md5').update(readFileSync(pad)).digest('base64')
}

async function backupStorage(snapshotMap) {
  const basis = `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o`
  const objecten = []
  let pageToken = ''
  do {
    const url = `${basis}?maxResults=1000${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`
    const json = await (await haal(url)).json()
    objecten.push(...(json.items || []))
    pageToken = json.nextPageToken || ''
  } while (pageToken)

  const spiegel = join(DOEL, 'storage')
  mkdirSync(spiegel, { recursive: true })
  let nieuw = 0
  let bytes = 0
  const lijst = []
  for (const [i, o] of objecten.entries()) {
    const pad = lokaalPad(o.name)
    const doel = join(spiegel, pad)
    if (!existsSync(doel) || md5Base64(doel) !== o.md5Hash) {
      const res = await haal(`${basis}/${encodeURIComponent(o.name)}?alt=media`)
      const data = Buffer.from(await res.arrayBuffer())
      mkdirSync(dirname(doel), { recursive: true })
      writeFileSync(doel, data)
      nieuw++
      bytes += data.length
    }
    lijst.push({
      name: o.name,
      lokaalPad: pad,
      size: Number(o.size),
      md5Hash: o.md5Hash,
      contentType: o.contentType,
      cacheControl: o.cacheControl,
      contentDisposition: o.contentDisposition,
      // Bevat firebaseStorageDownloadTokens: nodig zodat de downloadlinks in
      // Firestore (bijv. tekeningen[].url) na een herstel blijven werken.
      metadata: o.metadata || {},
      updated: o.updated,
    })
    process.stdout.write(`\r  bestanden: ${i + 1}/${objecten.length} (nieuw gedownload: ${nieuw})`)
  }
  process.stdout.write('\n')
  writeFileSync(join(snapshotMap, 'storage-objecten.json'), JSON.stringify(lijst, null, 1))
  return { aantal: objecten.length, nieuw, mbNieuw: Math.round(bytes / 1e5) / 10 }
}

// --- Gebruikers, git en config -------------------------------------------

function npx(opdracht) {
  return execSync(`npx ${opdracht}`, { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] }).toString()
}

function backupGebruikers(map) {
  const pad = join(map, 'gebruikers.json')
  npx(`firebase auth:export "${pad}" --format=json --project ${PROJECT}`)
  return JSON.parse(readFileSync(pad, 'utf8')).users?.length ?? 0
}

function git(argumenten) {
  return execFileSync('git', argumenten, { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] })
    .toString()
    .trim()
}

function backupGit(map) {
  git(['fetch', 'origin', '--prune'])
  const pad = join(map, 'fmid-erp.bundle')
  git(['bundle', 'create', pad, '--all'])
  return {
    commit: git(['rev-parse', 'origin/main']),
    lokaalNietGepusht: git(['rev-list', '--count', 'origin/main..HEAD']),
    nietGecommit: git(['status', '--porcelain']).split('\n').filter(Boolean).length,
  }
}

function backupConfig(map) {
  const config = join(map, 'config')
  mkdirSync(config, { recursive: true })
  const gekopieerd = []
  for (const bestand of ['.env.local', '.firebaserc']) {
    if (existsSync(join(REPO, bestand))) {
      copyFileSync(join(REPO, bestand), join(config, bestand))
      gekopieerd.push(bestand)
    }
  }
  return gekopieerd
}

// --- Hoofdprogramma ------------------------------------------------------

const nu = new Date()
const stempel = `${nu.getFullYear()}-${String(nu.getMonth() + 1).padStart(2, '0')}-${String(nu.getDate()).padStart(2, '0')}_${String(nu.getHours()).padStart(2, '0')}${String(nu.getMinutes()).padStart(2, '0')}`
const snapshot = join(DOEL, stempel)
mkdirSync(snapshot, { recursive: true })
console.log(`Backup naar ${snapshot}${EMULATOR ? ' (EMULATOR)' : ''}`)

const overzicht = { gemaakt: nu.toISOString(), project: EMULATOR ? 'demo-fmid-erp' : PROJECT }
overzicht.versie = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')).version

console.log('Firestore…')
overzicht.firestore = await backupFirestore(join(snapshot, 'firestore'))
overzicht.documenten = Object.values(overzicht.firestore).reduce((a, b) => a + b, 0)

if (!ZONDER_STORAGE) {
  console.log('Storage…')
  overzicht.storage = await backupStorage(snapshot)
}

if (!EMULATOR) {
  console.log('Gebruikers…')
  overzicht.gebruikers = backupGebruikers(snapshot)
}

console.log('Git…')
overzicht.git = backupGit(snapshot)
overzicht.config = backupConfig(snapshot)

writeFileSync(join(snapshot, 'overzicht.json'), JSON.stringify(overzicht, null, 2))
console.log('\nKlaar.')
console.log(`  Documenten: ${overzicht.documenten} in ${Object.keys(overzicht.firestore).length} collecties`)
if (overzicht.storage)
  console.log(
    `  Bestanden: ${overzicht.storage.aantal} (${overzicht.storage.nieuw} nieuw, ${overzicht.storage.mbNieuw} MB)`
  )
if (overzicht.gebruikers != null) console.log(`  Gebruikers: ${overzicht.gebruikers}`)
console.log(`  Git: ${overzicht.git.commit.slice(0, 7)}`)
if (Number(overzicht.git.lokaalNietGepusht) > 0 || overzicht.git.nietGecommit > 0) {
  console.log(
    `  Let op: ${overzicht.git.lokaalNietGepusht} commit(s) niet gepusht, ${overzicht.git.nietGecommit} bestand(en) niet gecommit.`
  )
}

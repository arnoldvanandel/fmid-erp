// Kopieert Firestore-data en Storage-bestanden van het oude naar het nieuwe
// Firebase-project. Gebruikers (Authentication) gaan apart via de Firebase CLI,
// zie migratie/README.md.
//
// Gebruik:
//   node migreer.mjs            -> proefdraai, schrijft niets
//   node migreer.mjs --echt     -> voert de migratie echt uit
//
// Verwacht in deze map:
//   oud.json   service-account-key van het OUDE project
//   nieuw.json service-account-key van het NIEUWE project

import { readFileSync } from 'node:fs'
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore, DocumentReference } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { getAuth } from 'firebase-admin/auth'

const ECHT = process.argv.includes('--echt')

function laadApp(naam, keyFile, bucketArg) {
  const key = JSON.parse(readFileSync(new URL(keyFile, import.meta.url)))
  const bucket = bucketArg || `${key.project_id}.firebasestorage.app`
  const app = initializeApp({ credential: cert(key), storageBucket: bucket }, naam)
  return {
    projectId: key.project_id,
    bucketNaam: bucket,
    db: getFirestore(app),
    bucket: getStorage(app).bucket(),
    auth: getAuth(app),
  }
}

// Bucketnamen kunnen worden overschreven als het project nog een oude
// *.appspot.com-bucket heeft: OUD_BUCKET=... NIEUW_BUCKET=... node migreer.mjs
const oud = laadApp('oud', './oud.json', process.env.OUD_BUCKET)
const nieuw = laadApp('nieuw', './nieuw.json', process.env.NIEUW_BUCKET)

if (oud.projectId === nieuw.projectId) {
  console.error('oud.json en nieuw.json horen bij hetzelfde project — gestopt.')
  process.exit(1)
}

console.log(`Van:  ${oud.projectId} (bucket ${oud.bucketNaam})`)
console.log(`Naar: ${nieuw.projectId} (bucket ${nieuw.bucketNaam})`)
console.log(ECHT ? 'MODUS: ECHT\n' : 'MODUS: proefdraai (gebruik --echt om te schrijven)\n')

// ---------------------------------------------------------------------------
// Storage: bestanden kopiëren met behoud van download-token, zodat bestaande
// download-URL's alleen een andere bucketnaam nodig hebben.
// ---------------------------------------------------------------------------
async function kopieerStorage() {
  const [bestanden] = await oud.bucket.getFiles()
  console.log(`Storage: ${bestanden.length} bestand(en)`)
  let n = 0
  for (const f of bestanden) {
    if (f.name.endsWith('/')) continue
    if (ECHT) {
      const [meta] = await f.getMetadata()
      const [inhoud] = await f.download()
      await nieuw.bucket.file(f.name).save(inhoud, {
        resumable: false,
        contentType: meta.contentType,
        metadata: {
          cacheControl: meta.cacheControl,
          contentDisposition: meta.contentDisposition,
          // bevat o.a. firebaseStorageDownloadTokens
          metadata: meta.metadata || {},
        },
      })
    }
    n++
    if (n % 25 === 0) console.log(`  ${n}/${bestanden.length}`)
  }
  console.log(`Storage: ${n} bestand(en) ${ECHT ? 'gekopieerd' : 'zouden worden gekopieerd'}\n`)
}

// ---------------------------------------------------------------------------
// Firestore: alle collecties (incl. subcollecties) kopiëren met dezelfde
// document-ID's. Verwijzingen naar de oude bucket worden omgezet.
// ---------------------------------------------------------------------------
function zetOm(waarde) {
  if (typeof waarde === 'string') return waarde.split(oud.bucketNaam).join(nieuw.bucketNaam)
  if (waarde instanceof DocumentReference) return nieuw.db.doc(waarde.path)
  if (Array.isArray(waarde)) return waarde.map(zetOm)
  if (waarde && typeof waarde === 'object' && waarde.constructor === Object) {
    return Object.fromEntries(Object.entries(waarde).map(([k, v]) => [k, zetOm(v)]))
  }
  return waarde // Timestamp, GeoPoint, getallen, booleans, null, Bytes
}

// De gebruikers zijn in het nieuwe project handmatig aangemaakt en hebben dus
// andere UID's. Profielen in users/{uid} koppelen we via het e-mailadres.
async function alleGebruikers(auth) {
  const lijst = []
  let token
  do {
    const res = await auth.listUsers(1000, token)
    lijst.push(...res.users)
    token = res.pageToken
  } while (token)
  return lijst
}

async function maakUidKoppeling() {
  const nieuwPerEmail = new Map(
    (await alleGebruikers(nieuw.auth)).filter((u) => u.email).map((u) => [u.email.toLowerCase(), u.uid])
  )
  const koppeling = new Map()
  console.log('Gebruikers:')
  for (const u of await alleGebruikers(oud.auth)) {
    const nieuweUid = u.email && nieuwPerEmail.get(u.email.toLowerCase())
    koppeling.set(u.uid, nieuweUid || null)
    console.log(`  ${u.email || u.uid}: ${nieuweUid ? `${u.uid} -> ${nieuweUid}` : 'GEEN account in nieuw project, profiel wordt overgeslagen'}`)
  }
  console.log()
  return koppeling
}

function doelPad(pad, uidKoppeling) {
  const delen = pad.split('/')
  if (delen[0] !== 'users' || delen.length < 2) return pad
  const nieuweUid = uidKoppeling.get(delen[1])
  if (!nieuweUid) return null
  delen[1] = nieuweUid
  return delen.join('/')
}

async function kopieerCollectie(colRef, writer, telling, uidKoppeling) {
  const snap = await colRef.get()
  telling[colRef.path] = snap.size
  for (const d of snap.docs) {
    const pad = doelPad(d.ref.path, uidKoppeling)
    if (!pad) {
      console.log(`  Overgeslagen: ${d.ref.path}`)
      continue
    }
    if (ECHT) writer.set(nieuw.db.doc(pad), zetOm(d.data()))
    for (const sub of await d.ref.listCollections()) {
      await kopieerCollectie(sub, writer, telling, uidKoppeling)
    }
  }
}

async function kopieerFirestore() {
  const writer = nieuw.db.bulkWriter()
  writer.onWriteError((err) => {
    console.error(`  Fout bij ${err.documentRef.path}: ${err.message}`)
    return err.failedAttempts < 5
  })
  const uidKoppeling = await maakUidKoppeling()
  const telling = {}
  for (const col of await oud.db.listCollections()) {
    await kopieerCollectie(col, writer, telling, uidKoppeling)
  }
  await writer.close()
  console.log('Firestore:')
  for (const [pad, aantal] of Object.entries(telling)) console.log(`  ${pad.padEnd(30)} ${aantal}`)
  const totaal = Object.values(telling).reduce((a, b) => a + b, 0)
  console.log(`Firestore: ${totaal} document(en) ${ECHT ? 'gekopieerd' : 'zouden worden gekopieerd'}\n`)
}

await kopieerStorage()
await kopieerFirestore()
console.log('Klaar.')

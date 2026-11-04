/**
 * Alleen-lezen sync: open Axapta-verkoopregels → Firestore.
 * Voert uitsluitend SELECT uit. Geen INSERT/UPDATE/DELETE op SQL Server.
 *
 * Gebruik:
 *   npm run proef   — toont aantallen, schrijft niets
 *   npm run sync    — schrijft naar Firestore
 */
import 'dotenv/config'
import sql from 'mssql'
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const COLLECTIE = 'axaptaOpenstaandeRegels'
const META_DOC = 'axaptaSync/openstaandeRegels'

const proef = process.argv.includes('--proef')

function vereist(naam) {
  const v = process.env[naam]
  if (!v || !String(v).trim()) {
    throw new Error(`Omgevingsvariabele ${naam} ontbreekt. Zie .env.example.`)
  }
  return String(v).trim()
}

function sqlConfig() {
  const server = vereist('AX_SQL_SERVER')
  const database = vereist('AX_SQL_DATABASE')
  const user = vereist('AX_SQL_GEBRUIKER')
  const password = process.env.AX_SQL_WACHTWOORD ?? ''

  return {
    server,
    database,
    user,
    password,
    options: {
      // SQL Server 2005: geen encryptie, oud TDS-protocol
      encrypt: false,
      trustServerCertificate: true,
      tdsVersion: '7_1',
      enableArithAbort: true,
    },
    requestTimeout: 60000,
    connectionTimeout: 15000,
  }
}

function initFirestore() {
  if (getApps().length > 0) return getFirestore()

  const pad = process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (!pad) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS ontbreekt (pad naar firebase-sleutel.json).')
  }
  const json = JSON.parse(readFileSync(resolve(pad), 'utf8'))
  initializeApp({ credential: cert(json) })
  return getFirestore()
}

/**
 * Open regels: restant > 0 in bedrijf fmd.
 * Spaties in CUSTACCOUNT/ITEMID worden weggehaald.
 * Barcode is optioneel (LEFT JOIN); bij meerdere barcodes komt de eerste.
 */
const OPEN_REGELS_SQL = `
SELECT
  LTRIM(RTRIM(s.DATAAREAID)) AS dataAreaId,
  LTRIM(RTRIM(s.CUSTACCOUNT)) AS klantnummer,
  LTRIM(RTRIM(c.NAME)) AS klantnaam,
  LTRIM(RTRIM(s.SALESID)) AS ordernummer,
  l.LINENUM AS regelnummer,
  LTRIM(RTRIM(l.ITEMID)) AS artikelnummer,
  LTRIM(RTRIM(l.NAME)) AS artikelnaam,
  l.SALESQTY AS besteld,
  l.REMAINSALESPHYSICAL AS tePicken,
  LTRIM(RTRIM(l.SALESUNIT)) AS eenheid,
  l.SALESSTATUS AS regelstatus,
  s.SALESSTATUS AS orderstatus,
  (
    SELECT TOP 1 LTRIM(RTRIM(b.ITEMBARCODE))
    FROM INVENTITEMBARCODE b
    WHERE LTRIM(RTRIM(b.ITEMID)) = LTRIM(RTRIM(l.ITEMID))
      AND b.DATAAREAID = l.DATAAREAID
  ) AS barcode
FROM SALESLINE l
JOIN SALESTABLE s
  ON s.SALESID = l.SALESID
 AND s.DATAAREAID = l.DATAAREAID
JOIN CUSTTABLE c
  ON LTRIM(RTRIM(c.ACCOUNTNUM)) = LTRIM(RTRIM(s.CUSTACCOUNT))
 AND c.DATAAREAID = s.DATAAREAID
WHERE LTRIM(RTRIM(s.DATAAREAID)) = @dataAreaId
  AND l.REMAINSALESPHYSICAL > 0
  AND (@klant IS NULL OR LTRIM(RTRIM(s.CUSTACCOUNT)) = @klant)
ORDER BY LTRIM(RTRIM(s.CUSTACCOUNT)), s.SALESID, l.LINENUM
`

function docId(rij) {
  // Stabiel id zonder spaties/slash
  const parts = [
    rij.dataAreaId,
    rij.klantnummer,
    rij.ordernummer,
    String(rij.regelnummer),
  ].map((p) => String(p ?? '').replace(/[\/\\#?%\s]/g, '_'))
  return parts.join('__')
}

function naarPayload(rij) {
  return {
    bron: 'axapta',
    dataAreaId: rij.dataAreaId || '',
    klantnummer: rij.klantnummer || '',
    klantnaam: rij.klantnaam || '',
    ordernummer: rij.ordernummer || '',
    regelnummer: Number(rij.regelnummer) || 0,
    artikelnummer: rij.artikelnummer || '',
    artikelnaam: rij.artikelnaam || '',
    besteld: Number(rij.besteld) || 0,
    tePicken: Number(rij.tePicken) || 0,
    eenheid: rij.eenheid || '',
    barcode: rij.barcode || '',
    regelstatus: Number(rij.regelstatus) || 0,
    orderstatus: Number(rij.orderstatus) || 0,
    bijgewerktOp: FieldValue.serverTimestamp(),
  }
}

async function leesOpenRegels() {
  const dataAreaId = vereist('AX_DATAAREAID')
  const klant = process.env.AX_KLANT?.trim() || null

  const pool = await sql.connect(sqlConfig())
  try {
    const req = pool.request()
    req.input('dataAreaId', sql.VarChar(8), dataAreaId)
    req.input('klant', sql.VarChar(20), klant)
    const result = await req.query(OPEN_REGELS_SQL)
    return result.recordset || []
  } finally {
    await pool.close()
  }
}

async function schrijfNaarFirestore(rijen) {
  const db = initFirestore()
  const col = db.collection(COLLECTIE)
  const nieuwIds = new Set(rijen.map(docId))

  // Bestaande docs ophalen om verouderde open regels te verwijderen
  const bestaand = await col.get()
  const teVerwijderen = []
  bestaand.forEach((snap) => {
    if (!nieuwIds.has(snap.id)) teVerwijderen.push(snap.ref)
  })

  // Firestore: max 500 operaties per batch
  const chunks = []
  let batch = db.batch()
  let n = 0

  function flush() {
    if (n === 0) return
    chunks.push(batch)
    batch = db.batch()
    n = 0
  }

  for (const rij of rijen) {
    const ref = col.doc(docId(rij))
    batch.set(ref, naarPayload(rij), { merge: true })
    n += 1
    if (n >= 400) flush()
  }

  for (const ref of teVerwijderen) {
    batch.delete(ref)
    n += 1
    if (n >= 400) flush()
  }

  flush()
  for (const b of chunks) {
    await b.commit()
  }

  await db.doc(META_DOC).set(
    {
      laatsteSync: FieldValue.serverTimestamp(),
      aantalRegels: rijen.length,
      verwijderd: teVerwijderen.length,
      dataAreaId: vereist('AX_DATAAREAID'),
      bron: 'axapta',
    },
    { merge: true }
  )

  return { geschreven: rijen.length, verwijderd: teVerwijderen.length }
}

async function main() {
  console.log(proef ? 'Proefrun (schrijft niets)…' : 'Sync Axapta → Firestore…')
  const rijen = await leesOpenRegels()
  console.log(`Gelezen: ${rijen.length} open regel(s)`)

  if (rijen.length > 0) {
    const voorbeeld = rijen[0]
    console.log(
      `Voorbeeld: klant ${voorbeeld.klantnummer} (${voorbeeld.klantnaam}), ` +
        `order ${voorbeeld.ordernummer}, ${voorbeeld.artikelnummer}, te picken ${voorbeeld.tePicken}`
    )
  }

  if (proef) {
    console.log('Proef klaar. Geen schrijfactie naar Firestore.')
    return
  }

  const { geschreven, verwijderd } = await schrijfNaarFirestore(rijen)
  console.log(`Firestore bijgewerkt: ${geschreven} regel(s), ${verwijderd} verouderde verwijderd.`)
}

main().catch((err) => {
  console.error('Sync mislukt:', err.message)
  process.exit(1)
})

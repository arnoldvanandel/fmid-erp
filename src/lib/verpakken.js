// Verpakken van dozen, nagebouwd naar frmVerpakkenDoos uit Controlsys.
// De verpakkingsvoorschriften (`verpakkingen`, één per artikel) beheer je in de
// app (Verpakkingsvoorschriften); de eerste lading kwam uit een Excel van Controlsys.
// Voorlopig kies je een artikelnummer; de productieorder is (nog) optioneel.
import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  deleteDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { db, storage } from '../firebase'

const EINDE = ''
const MAX_FOTO = 5 * 1024 * 1024

// Verpakkingsinstructies waarvan het artikelnummer met `term` begint. Firestore
// let op hoofdletters, dus zoek zoals getypt en in hoofdletters.
export async function zoekVerpakkingen(term, max = 30) {
  const getypt = String(term || '').trim()
  const varianten = getypt ? [...new Set([getypt, getypt.toUpperCase()])] : ['']
  const lijsten = await Promise.all(
    varianten.map(async (begin) => {
      const delen = [orderBy('artikelnummer'), limit(max)]
      if (begin) delen.unshift(where('artikelnummer', '>=', begin), where('artikelnummer', '<=', begin + EINDE))
      const snap = await getDocs(query(collection(db, 'verpakkingen'), ...delen))
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    })
  )
  const perId = new Map(lijsten.flat().map((v) => [v.id, v]))
  return [...perId.values()].sort((a, b) => a.artikelnummer.localeCompare(b.artikelnummer))
}

export function totaalGewicht(verpakking) {
  return (
    (Number(verpakking?.gewichtPerProduct) || 0) * (Number(verpakking?.aantalPerDoos) || 0) +
    (Number(verpakking?.tarraDoos) || 0)
  )
}

// Goed als het gewicht minder dan een half product afwijkt.
export function gewichtKlopt(gewicht, verpakking) {
  const perStuk = Number(verpakking?.gewichtPerProduct)
  if (gewicht === null || !(perStuk > 0)) return false
  return Math.abs(gewicht - totaalGewicht(verpakking)) < perStuk / 2
}

export function aantalInDoos({ gewicht, tarra, gewichtPerProduct }) {
  return Math.round((gewicht - tarra) / gewichtPerProduct)
}

// "12,345" of "12.345" -> 12.345; null als het geen getal is.
export function leesKilo(tekst) {
  const t = String(tekst ?? '').trim().replace(',', '.')
  return /^\d+(\.\d*)?$/.test(t) ? Number(t) : null
}

// Legt een doos vast met een uniek doosnummer (DS-000001, …). Nummer en doos in
// één transactie. Een eigen reeks, los van de doosnummers uit Controlsys.
export async function registreerDoos({ verpakking, productieorder = '', artikelnaam, gewicht, tarra, gebruiker }) {
  const gewichtPerProduct = Number(verpakking.gewichtPerProduct)
  const aantal = aantalInDoos({ gewicht, tarra, gewichtPerProduct })
  if (!Number.isFinite(aantal) || aantal < 1) throw new Error('Het gewicht is te laag voor een gevulde doos.')
  const teller = doc(db, 'counters', 'verpaktedozen')
  const nieuw = doc(collection(db, 'verpaktedozen'))
  const doos = {
    artikelnummerKlant: verpakking.artikelnummerKlant || '',
    artikelnaam,
    aantal,
    productieorder,
    tarra,
    gewichtPerProduct,
    totaalGewicht: gewicht,
    artikelnummer: verpakking.artikelnummer,
    verpaktDoor: gebruiker || '',
  }
  const doosnummer = await runTransaction(db, async (tx) => {
    const snap = await tx.get(teller)
    const volgnummer = (snap.exists() ? Number(snap.data().laatsteNummer) || 0 : 0) + 1
    const nummer = `DS-${String(volgnummer).padStart(6, '0')}`
    tx.set(teller, { laatsteNummer: volgnummer }, { merge: true })
    tx.set(nieuw, { ...doos, doosnummer: nummer, datum: serverTimestamp() })
    return nummer
  })
  return { ...doos, doosnummer, datum: new Date() }
}

// Foto per artikel. Ook de sleutel van het voorschrift in `verpakkingen`.
export function fotoSleutel(artikelnummer) {
  return encodeURIComponent(String(artikelnummer || '').trim().toUpperCase())
}

export async function uploadVerpakkingFoto({ artikelnummer, file, gebruiker }) {
  if (!storage) throw new Error('Cloud Storage is niet beschikbaar.')
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Kies een foto (JPG, PNG of WebP).')
  }
  if (file.size > MAX_FOTO) throw new Error('Foto is te groot (max 5 MB).')
  const sleutel = fotoSleutel(artikelnummer)
  const extensie = file.type.split('/')[1].replace('jpeg', 'jpg')
  const storagePath = `verpakking/${sleutel}/${Date.now()}.${extensie}`
  const opslag = ref(storage, storagePath)
  await uploadBytes(opslag, file, { contentType: file.type })
  const url = await getDownloadURL(opslag)
  await setDoc(doc(db, 'verpakkingFotos', sleutel), {
    artikelnummer,
    url,
    storagePath,
    geuploadDoor: gebruiker || '',
    datum: serverTimestamp(),
  })
}

// ---- Voorschriften beheren ----

export const JA_NEE_VELDEN = [
  ['storten', 'Storten'],
  ['karton', 'Karton'],
  ['kartonPerLaag', 'Karton per laag'],
  ['etiketOpZak', 'Etiket op zak'],
  ['etiketOpDoos', 'Etiket op doos'],
  ['noppenfolie', 'Noppenfolie'],
]

function tekst(waarde) {
  return waarde === null || waarde === undefined ? '' : String(waarde).trim()
}

function getalOfNull(waarde) {
  if (waarde === null || waarde === undefined || waarde === '') return null
  const n = typeof waarde === 'number' ? waarde : Number(String(waarde).trim().replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function ja(waarde) {
  if (typeof waarde === 'string') return ['true', '1', 'ja', 'waar'].includes(waarde.trim().toLowerCase())
  return Boolean(waarde)
}

// Zet invoer (formulier of Excel) om naar een voorschrift.
export function maakVoorschrift(v) {
  const voorschrift = {
    artikelnummer: tekst(v.artikelnummer),
    artikelnummerKlant: tekst(v.artikelnummerKlant),
    soortDoos: tekst(v.soortDoos),
    soortZak: tekst(v.soortZak),
    aantalPerZak: getalOfNull(v.aantalPerZak),
    zakkenPerDoos: getalOfNull(v.zakkenPerDoos),
    soortTape: tekst(v.soortTape),
    gewichtPerProduct: getalOfNull(v.gewichtPerProduct),
    aantalPerDoos: getalOfNull(v.aantalPerDoos),
    tarraDoos: getalOfNull(v.tarraDoos),
    opmerkingen: tekst(v.opmerkingen),
  }
  for (const [veld] of JA_NEE_VELDEN) voorschrift[veld] = ja(v[veld])
  return voorschrift
}

export async function slaVoorschriftOp(voorschrift, gebruiker) {
  if (!voorschrift.artikelnummer) throw new Error('Artikelnummer is verplicht.')
  await setDoc(doc(db, 'verpakkingen', fotoSleutel(voorschrift.artikelnummer)), {
    ...voorschrift,
    bijgewerktDoor: gebruiker || '',
    bijgewerkt: serverTimestamp(),
  })
}

export function verwijderVoorschrift(id) {
  return deleteDoc(doc(db, 'verpakkingen', id))
}

// Kolomvolgorde van VerpakingTabel in Controlsys (ControlsysDataSet), zoals in
// Verpakkingsvoorschrift.xlsx: Index, Artikelnummer, … , Foto, Opmerkingen.
const EXCEL_KOLOMMEN = [
  'index', 'artikelnummer', 'soortDoos', 'soortZak', 'aantalPerZak', 'zakkenPerDoos',
  'storten', 'karton', 'kartonPerLaag', 'soortTape', 'etiketOpZak', 'etiketOpDoos',
  'noppenfolie', 'gewichtPerProduct', 'aantalPerDoos', 'tarraDoos',
  'artikelnummerKlant', 'foto', 'opmerkingen',
]

// Leest een Excel-export van Controlsys. Geeft de voorschriften (eerste regel
// per artikel, zoals Controlsys) en het aantal overgeslagen regels.
export async function leesVoorschriftenUitExcel(file) {
  const { readSheet } = await import('read-excel-file/browser')
  const rijen = await readSheet(file)
  const voorschriften = []
  const gezien = new Set()
  let overgeslagen = 0
  for (const origineel of rijen) {
    const rij = [...origineel]
    // De export begint met een lege kolom.
    while (rij.length > EXCEL_KOLOMMEN.length && (rij[0] === null || rij[0] === '')) rij.shift()
    const v = Object.fromEntries(EXCEL_KOLOMMEN.map((k, i) => [k, rij[i]]))
    const nummer = tekst(v.artikelnummer)
    if (!nummer || typeof v.index === 'string') continue // lege regel of kopregel
    if (gezien.has(nummer.toUpperCase())) {
      overgeslagen += 1
      continue
    }
    gezien.add(nummer.toUpperCase())
    voorschriften.push(maakVoorschrift(v))
  }
  return { voorschriften, overgeslagen }
}

export async function importeerVoorschriften(voorschriften, gebruiker) {
  for (let i = 0; i < voorschriften.length; i += 400) {
    const batch = writeBatch(db)
    for (const v of voorschriften.slice(i, i + 400)) {
      batch.set(doc(db, 'verpakkingen', fotoSleutel(v.artikelnummer)), {
        ...v,
        bijgewerktDoor: gebruiker || '',
        bijgewerkt: serverTimestamp(),
      })
    }
    await batch.commit()
  }
}

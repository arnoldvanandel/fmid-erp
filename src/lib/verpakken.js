// Verpakken van dozen, nagebouwd naar frmVerpakkenDoos uit Controlsys.
// De verpakkingsinstructies (`verpakkingen`) komen uit koppeling/verpakking_sync.py.
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
  where,
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

// Foto per artikel, los van `verpakkingen` omdat de sync die overschrijft.
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

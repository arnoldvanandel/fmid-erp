// Verpakken van dozen, nagebouwd naar frmVerpakkenDoos uit Controlsys.
// De verpakkingsinstructies (`verpakkingen`) en de Axapta-productieorders
// (`axaptaProductieorders`) komen uit koppeling/verpakking_sync.py.
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

const BRONNEN = [
  { naam: 'axaptaProductieorders', veld: 'prodId' },
  { naam: 'productieorders', veld: 'ordernummer' },
]
const EINDE = ''
const MAX_FOTO = 5 * 1024 * 1024

// Productieorders waarvan het nummer met `term` begint, nieuwste eerst. Zoekt
// in de orders uit Axapta en in de eigen orders (PO-…).
export async function zoekProductieorders(term, max = 30) {
  const begin = String(term || '').trim().toUpperCase()
  const lijsten = await Promise.all(
    BRONNEN.map(async ({ naam, veld }) => {
      const delen = [orderBy(veld, 'desc'), limit(max)]
      if (begin) delen.unshift(where(veld, '>=', begin), where(veld, '<=', begin + EINDE))
      const snap = await getDocs(query(collection(db, naam), ...delen))
      const lijst = snap.docs.map((d) => ({
        nummer: d.data()[veld],
        artikelnummer: d.data().artikelnummer || '',
        artikelnaam: d.data().artikelnaam || '',
      }))
      // Aflopend met een limiet kan het exacte nummer net buiten de lijst vallen.
      if (begin && snap.size === max && !lijst.some((o) => o.nummer === begin)) {
        const exact = await getDocs(query(collection(db, naam), where(veld, '==', begin), limit(1)))
        exact.forEach((d) =>
          lijst.unshift({
            nummer: d.data()[veld],
            artikelnummer: d.data().artikelnummer || '',
            artikelnaam: d.data().artikelnaam || '',
          })
        )
      }
      return lijst
    })
  )
  return lijsten.flat()
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
export async function registreerDoos({ order, verpakking, artikelnaam, gewicht, tarra, gebruiker }) {
  const gewichtPerProduct = Number(verpakking.gewichtPerProduct)
  const aantal = aantalInDoos({ gewicht, tarra, gewichtPerProduct })
  if (!Number.isFinite(aantal) || aantal < 1) throw new Error('Het gewicht is te laag voor een gevulde doos.')
  const teller = doc(db, 'counters', 'verpaktedozen')
  const nieuw = doc(collection(db, 'verpaktedozen'))
  const doos = {
    artikelnummerKlant: verpakking.artikelnummerKlant || '',
    artikelnaam,
    aantal,
    productieorder: order.nummer,
    tarra,
    gewichtPerProduct,
    totaalGewicht: gewicht,
    artikelnummer: order.artikelnummer,
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

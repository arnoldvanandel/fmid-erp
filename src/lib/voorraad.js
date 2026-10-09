import { doc, runTransaction, collection, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'

// Voorraad wordt (net als in Axapta) per locatie bijgehouden. Elke combinatie
// artikel+locatie heeft één document in `voorraadstanden`, met een voorspelbare
// id zodat we 'm zonder extra query kunnen opzoeken/aanmaken in de transactie.
export function voorraadstandId(artikelId, locatieId) {
  return `${artikelId}__${locatieId}`
}

// Boekt een voorraadmutatie (in, uit of correctie) op één locatie, en werkt de
// voorraadstand van dat artikel op die locatie atomisch bij, zodat gelijktijdige
// boekingen door verschillende collega's elkaar niet overschrijven.
export async function boekVoorraadMutatie({
  artikelId,
  locatieId,
  type, // 'in' | 'uit' | 'correctie'
  aantal,
  reden,
  gebruiker,
}) {
  if (!artikelId) throw new Error('Geen artikel gekozen.')
  if (!locatieId) throw new Error('Geen locatie gekozen.')
  const n = Number(aantal)
  if (!Number.isFinite(n) || n < 0) {
    throw new Error('Aantal moet een geldig getal zijn.')
  }
  if (type !== 'correctie' && n <= 0) {
    throw new Error('Aantal moet een positief getal zijn.')
  }

  const artikelRef = doc(db, 'artikelen', artikelId)
  const locatieRef = doc(db, 'locaties', locatieId)
  const standRef = doc(db, 'voorraadstanden', voorraadstandId(artikelId, locatieId))
  const mutatieRef = doc(collection(db, 'voorraadmutaties'))

  await runTransaction(db, async (tx) => {
    const [artikelSnap, locatieSnap, standSnap] = await Promise.all([
      tx.get(artikelRef),
      tx.get(locatieRef),
      tx.get(standRef),
    ])
    if (!artikelSnap.exists()) throw new Error('Artikel bestaat niet (meer).')
    if (!locatieSnap.exists()) throw new Error('Locatie bestaat niet (meer).')

    const huidig = standSnap.exists() ? Number(standSnap.data().aantal) || 0 : 0

    let nieuw
    if (type === 'in') {
      nieuw = huidig + n
    } else if (type === 'uit') {
      nieuw = huidig - n
      if (nieuw < 0) {
        throw new Error(
          `Onvoldoende voorraad op ${locatieSnap.data().code}: nog ${huidig}, kan niet ${n} afboeken.`
        )
      }
    } else if (type === 'correctie') {
      nieuw = n // bij correctie is "aantal" de nieuwe absolute voorraadstand
    } else {
      throw new Error('Onbekend mutatietype.')
    }

    tx.set(
      standRef,
      {
        artikelId,
        artikelnummer: artikelSnap.data().artikelnummer || '',
        locatieId,
        locatieCode: locatieSnap.data().code || '',
        aantal: nieuw,
      },
      { merge: true }
    )
    tx.set(mutatieRef, {
      artikelId,
      artikelnummer: artikelSnap.data().artikelnummer || '',
      artikelnaam: artikelSnap.data().naam || '',
      locatieId,
      locatieCode: locatieSnap.data().code || '',
      type,
      aantal: n,
      voorraadVoor: huidig,
      voorraadNa: nieuw,
      reden: reden || '',
      bron: 'handmatig',
      gebruiker: gebruiker || '',
      datum: serverTimestamp(),
    })
  })
}

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

// Omboeken van het ene artikel naar het andere op dezelfde locatie, bijv. een
// BON-artikel dat als A-artikel geleverd wordt (BON104 22-15 -> A104 22-15).
// `omboekingen` is een lijst { vanArtikelId, naarArtikelId, locatieId, aantal }.
// Per omboeking: het van-artikel gaat eraf, het naar-artikel erbij, elk met een
// mutatie (herkomst "omboeking"). Alles in één transactie: lukt één regel niet
// (bijv. te weinig voorraad), dan wordt er niets geboekt.
export async function boekOmboekingen({ omboekingen, bronNummer = '', gebruiker }) {
  const lijst = omboekingen.filter((o) => Number(o.aantal) > 0)
  if (lijst.length === 0) throw new Error('Er is niets om om te boeken.')

  await runTransaction(db, async (tx) => {
    const artikelIds = [...new Set(lijst.flatMap((o) => [o.vanArtikelId, o.naarArtikelId]))]
    const locatieIds = [...new Set(lijst.map((o) => o.locatieId))]
    const artikelen = {}
    for (const id of artikelIds) {
      const snap = await tx.get(doc(db, 'artikelen', id))
      if (!snap.exists()) throw new Error('Artikel bestaat niet (meer).')
      artikelen[id] = snap.data()
    }
    const locaties = {}
    for (const id of locatieIds) {
      const snap = await tx.get(doc(db, 'locaties', id))
      if (!snap.exists()) throw new Error('Locatie bestaat niet (meer).')
      locaties[id] = snap.data()
    }
    const standen = {}
    for (const o of lijst) {
      for (const artikelId of [o.vanArtikelId, o.naarArtikelId]) {
        const id = voorraadstandId(artikelId, o.locatieId)
        if (!(id in standen)) {
          const snap = await tx.get(doc(db, 'voorraadstanden', id))
          standen[id] = snap.exists() ? Number(snap.data().aantal) || 0 : 0
        }
      }
    }

    const mutaties = []
    for (const o of lijst) {
      const n = Number(o.aantal)
      const van = artikelen[o.vanArtikelId]
      const naar = artikelen[o.naarArtikelId]
      const locatie = locaties[o.locatieId]
      const vanId = voorraadstandId(o.vanArtikelId, o.locatieId)
      const naarId = voorraadstandId(o.naarArtikelId, o.locatieId)
      if (standen[vanId] - n < 0) {
        throw new Error(`Onvoldoende voorraad van ${van.artikelnummer} op ${locatie.code}: nog ${standen[vanId]}, kan niet ${n} omboeken.`)
      }
      const reden = `Omboeking ${van.artikelnummer} → ${naar.artikelnummer}${bronNummer ? ` voor ${bronNummer}` : ''}`
      for (const [artikelId, artikel, standId, type, delta] of [
        [o.vanArtikelId, van, vanId, 'uit', -n],
        [o.naarArtikelId, naar, naarId, 'in', n],
      ]) {
        const voor = standen[standId]
        standen[standId] = voor + delta
        mutaties.push({
          standId,
          stand: { artikelId, artikelnummer: artikel.artikelnummer || '', locatieId: o.locatieId, locatieCode: locatie.code || '', aantal: voor + delta },
          mutatie: {
            artikelId,
            artikelnummer: artikel.artikelnummer || '',
            artikelnaam: artikel.naam || '',
            locatieId: o.locatieId,
            locatieCode: locatie.code || '',
            type,
            aantal: n,
            voorraadVoor: voor,
            voorraadNa: voor + delta,
            reden,
            bron: 'omboeking',
            bronNummer,
            gebruiker: gebruiker || '',
            datum: serverTimestamp(),
          },
        })
      }
    }
    for (const m of mutaties) {
      tx.set(doc(db, 'voorraadstanden', m.standId), m.stand, { merge: true })
      tx.set(doc(collection(db, 'voorraadmutaties')), m.mutatie)
    }
  })
}

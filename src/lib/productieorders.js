import { addDoc, collection, doc, runTransaction, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'

// Genereert een oplopend productieordernummer (PO-000001, PO-000002, ...) via
// een transactie op counters/productieorders, zodat twee collega's die
// tegelijk een order aanmaken nooit hetzelfde nummer krijgen.
async function volgendOrdernummer() {
  const counterRef = doc(db, 'counters', 'productieorders')
  const volgnummer = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef)
    const huidig = snap.exists() ? Number(snap.data().laatsteNummer) || 0 : 0
    const nieuw = huidig + 1
    tx.set(counterRef, { laatsteNummer: nieuw }, { merge: true })
    return nieuw
  })
  return `PO-${String(volgnummer).padStart(6, '0')}`
}

// Maakt een productieorder aan voor één artikel en aantal, met een uniek
// aangemaakt productieordernummer. Boekt nog geen voorraad (componenten
// af-/eindproduct bij) — dat is een latere stap.
export async function maakProductieorder({ artikel, aantal, gebruiker }) {
  if (!artikel?.id) throw new Error('Geen artikel gekozen.')
  const n = Number(aantal)
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error('Aantal moet een positief getal zijn.')
  }

  const ordernummer = await volgendOrdernummer()
  await addDoc(collection(db, 'productieorders'), {
    ordernummer,
    artikelId: artikel.id,
    artikelnummer: artikel.artikelnummer || '',
    artikelnaam: artikel.naam || '',
    eenheid: artikel.eenheid || '',
    aantal: n,
    status: 'open',
    aangemaaktDoor: gebruiker || '',
    datum: serverTimestamp(),
  })
  return ordernummer
}

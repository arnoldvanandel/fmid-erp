import { addDoc, collection, deleteDoc, doc, runTransaction, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'

// Genereert een oplopend inkoopordernummer (IO-000001, IO-000002, ...) via
// een transactie op counters/inkooporders, zodat twee collega's die
// tegelijk een order aanmaken nooit hetzelfde nummer krijgen.
async function volgendOrdernummer() {
  const counterRef = doc(db, 'counters', 'inkooporders')
  const volgnummer = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef)
    const huidig = snap.exists() ? Number(snap.data().laatsteNummer) || 0 : 0
    const nieuw = huidig + 1
    tx.set(counterRef, { laatsteNummer: nieuw }, { merge: true })
    return nieuw
  })
  return `IO-${String(volgnummer).padStart(6, '0')}`
}

// Maakt de kop van een inkooporder aan voor een leverancier. Orderregels
// worden er daarna los aan toegevoegd (zie voegInkooporderRegelToe), net
// zoals stuklijstregels bij een artikel.
export async function maakInkooporder({ leverancier, gebruiker }) {
  if (!leverancier?.id) throw new Error('Geen leverancier gekozen.')

  const vandaag = new Date().toISOString().slice(0, 10)

  const ordernummer = await volgendOrdernummer()
  const order = {
    ordernummer,
    leverancierId: leverancier.id,
    leverancierscode: leverancier.leverancierscode || '',
    leverancierNaam: leverancier.naam || '',
    status: 'concept',
    besteldatum: vandaag,
    verwachteLeverdatum: '',
    // Kopvelden zoals op de Axapta-inkooporder: "Uw referentie" (contact bij
    // de leverancier), "Besteld door" en de leveringsvoorwaarde.
    referentie: leverancier.contactpersoon || '',
    besteldDoor: gebruiker || '',
    levering: '',
    opmerkingen: '',
    aangemaaktDoor: gebruiker || '',
    datum: serverTimestamp(),
  }
  const ref = await addDoc(collection(db, 'inkooporders'), order)
  return { ...order, id: ref.id, datum: new Date() }
}

export async function wijzigInkooporder(inkooporderId, updates) {
  await updateDoc(doc(db, 'inkooporders', inkooporderId), updates)
}

export async function verwijderInkooporder(inkooporderId) {
  await deleteDoc(doc(db, 'inkooporders', inkooporderId))
}

// Voegt een regel (artikel + aantal + inkoopprijs) toe aan een inkooporder.
// Regelnummers lopen op in stappen van 10, zodat er later tussen bestaande
// regels in genummerd kan worden — zelfde patroon als routeregels.
export async function voegInkooporderRegelToe({
  inkooporder,
  artikel,
  aantal,
  prijs,
  leverdatum = '',
  leverancierArtikelnummer = '',
  hoogsteRegelnummer = 0,
}) {
  if (!artikel?.id) throw new Error('Kies een artikel.')
  const n = Number(aantal)
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error('Aantal moet een positief getal zijn.')
  }
  const p = Number(prijs)
  if (!Number.isFinite(p) || p < 0) {
    throw new Error('Prijs moet een getal zijn.')
  }

  await addDoc(collection(db, 'inkooporderregels'), {
    inkooporderId: inkooporder.id,
    regelnummer: hoogsteRegelnummer + 10,
    artikelId: artikel.id,
    artikelnummer: artikel.artikelnummer || '',
    artikelnaam: artikel.naam || '',
    eenheid: artikel.eenheid || '',
    aantal: n,
    prijs: p,
    leverdatum: leverdatum || inkooporder.verwachteLeverdatum || '',
    leverancierArtikelnummer: (leverancierArtikelnummer || '').trim(),
  })
}

export async function wijzigInkooporderRegel(regelId, updates) {
  await updateDoc(doc(db, 'inkooporderregels', regelId), updates)
}

export async function verwijderInkooporderRegel(regelId) {
  await deleteDoc(doc(db, 'inkooporderregels', regelId))
}

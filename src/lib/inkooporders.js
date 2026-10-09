import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from '../firebase'
import { voorraadstandId } from './voorraad'

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
export async function maakInkooporder({ leverancier, gebruiker, gebruikerEmail }) {
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
    besteldDoorEmail: gebruikerEmail || '',
    offertenummer: '',
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

// Haalt alles op wat nodig is om een inkooporder af te drukken of als PDF te
// mailen: de kop, de leverancier (adres + e-mailadressen) en de regels.
export async function laadInkooporderVoorAfdruk(inkooporderId) {
  const orderSnap = await getDoc(doc(db, 'inkooporders', inkooporderId))
  if (!orderSnap.exists()) throw new Error('Inkooporder niet gevonden.')
  const order = { id: orderSnap.id, ...orderSnap.data() }

  const [levSnap, regelSnap] = await Promise.all([
    order.leverancierId ? getDoc(doc(db, 'leveranciers', order.leverancierId)) : null,
    getDocs(query(collection(db, 'inkooporderregels'), where('inkooporderId', '==', inkooporderId))),
  ])
  const regels = regelSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (Number(a.regelnummer) || 0) - (Number(b.regelnummer) || 0))

  return {
    order,
    leverancier: levSnap?.exists() ? { id: levSnap.id, ...levSnap.data() } : null,
    regels,
  }
}

// De adressen waar inkooporders voor deze leverancier heen gaan. Valt terug
// op het algemene e-mailadres als er geen aparte inkooporder-adressen zijn.
export function inkooporderEmailadressen(leverancier) {
  const lijst = leverancier?.inkooporderEmails?.length
    ? leverancier.inkooporderEmails
    : [leverancier?.email].filter(Boolean)
  return [...new Set(lijst.map((e) => e.trim()).filter(Boolean))]
}

// ---------------------------------------------------------------------------
// Ontvangst
// ---------------------------------------------------------------------------

export const STATUS_LABEL = {
  concept: 'Concept',
  besteld: 'Besteld',
  'deels ontvangen': 'Deels ontvangen',
  ontvangen: 'Ontvangen',
  geannuleerd: 'Geannuleerd',
}

// Per artikel de locatie waar het al het meeste van ligt, als voorstel bij
// een ontvangst ({ artikelId: { id, code } }).
export async function standaardLocaties(artikelIds) {
  const uniek = [...new Set(artikelIds.filter(Boolean))]
  const beste = {}
  for (let i = 0; i < uniek.length; i += 30) {
    const snap = await getDocs(query(collection(db, 'voorraadstanden'), where('artikelId', 'in', uniek.slice(i, i + 30))))
    for (const d of snap.docs) {
      const s = d.data()
      if (!beste[s.artikelId] || Number(s.aantal) > Number(beste[s.artikelId].aantal)) beste[s.artikelId] = s
    }
  }
  return Object.fromEntries(
    Object.entries(beste).map(([artikelId, s]) => [artikelId, { id: s.locatieId, code: s.locatieCode }])
  )
}

// Boekt een (deel)ontvangst: `ontvangst` is { regelId: { aantal, locatieId } }.
// Werkt per regel het ontvangen aantal bij, boekt de voorraad in op de gekozen
// locatie (met een mutatie per regel) en zet de status van de order. Alles in
// één transactie.
export async function boekOntvangst({ inkooporderId, ontvangst, pakbonLeverancier = '', gebruiker }) {
  const regelIds = Object.keys(ontvangst).filter((id) => Number(ontvangst[id].aantal) > 0)
  if (regelIds.length === 0) throw new Error('Vul bij minimaal één regel een aantal in.')
  for (const id of regelIds) {
    if (!ontvangst[id].locatieId) throw new Error('Kies bij elke ontvangen regel een locatie.')
  }
  const pakbon = String(pakbonLeverancier || '').trim()

  const alleRegels = (await getDocs(query(collection(db, 'inkooporderregels'), where('inkooporderId', '==', inkooporderId)))).docs.map(
    (d) => ({ id: d.id, ...d.data() })
  )

  return runTransaction(db, async (tx) => {
    const orderRef = doc(db, 'inkooporders', inkooporderId)
    const orderSnap = await tx.get(orderRef)
    if (!orderSnap.exists()) throw new Error('Inkooporder niet gevonden.')
    const order = orderSnap.data()

    const regelSnaps = await Promise.all(regelIds.map((id) => tx.get(doc(db, 'inkooporderregels', id))))
    const locatieIds = [...new Set(regelIds.map((id) => ontvangst[id].locatieId))]
    const locaties = {}
    for (const id of locatieIds) {
      const snap = await tx.get(doc(db, 'locaties', id))
      if (!snap.exists()) throw new Error('Een gekozen locatie bestaat niet (meer).')
      locaties[id] = { id, ...snap.data() }
    }

    // Voorraadstanden per artikel+locatie (één artikel kan op twee regels staan).
    const standen = {}
    for (const s of regelSnaps) {
      if (!s.exists()) throw new Error('Een orderregel bestaat niet meer; vernieuw de order.')
      const sleutel = voorraadstandId(s.data().artikelId, ontvangst[s.id].locatieId)
      if (!(sleutel in standen)) {
        const snap = await tx.get(doc(db, 'voorraadstanden', sleutel))
        standen[sleutel] = snap.exists() ? Number(snap.data().aantal) || 0 : 0
      }
    }

    const bijgewerkt = {}
    for (const s of regelSnaps) {
      const r = s.data()
      const n = Number(ontvangst[s.id].aantal)
      const locatie = locaties[ontvangst[s.id].locatieId]
      const sleutel = voorraadstandId(r.artikelId, locatie.id)
      const voor = standen[sleutel]
      standen[sleutel] = voor + n
      bijgewerkt[s.id] = (Number(r.ontvangen) || 0) + n

      tx.set(
        doc(db, 'voorraadstanden', sleutel),
        { artikelId: r.artikelId, artikelnummer: r.artikelnummer, locatieId: locatie.id, locatieCode: locatie.code || '', aantal: voor + n },
        { merge: true }
      )
      tx.set(doc(collection(db, 'voorraadmutaties')), {
        artikelId: r.artikelId,
        artikelnummer: r.artikelnummer,
        artikelnaam: r.artikelnaam,
        locatieId: locatie.id,
        locatieCode: locatie.code || '',
        type: 'in',
        aantal: n,
        voorraadVoor: voor,
        voorraadNa: voor + n,
        reden: `Ontvangst ${order.ordernummer}${pakbon ? `, pakbon leverancier ${pakbon}` : ''}`,
        bron: 'inkooporder',
        bronId: inkooporderId,
        bronNummer: order.ordernummer,
        relatie: `${order.leverancierscode} ${order.leverancierNaam}`.trim(),
        gebruiker: gebruiker || '',
        datum: serverTimestamp(),
      })
    }
    for (const [id, ontvangen] of Object.entries(bijgewerkt)) {
      tx.update(doc(db, 'inkooporderregels', id), { ontvangen })
    }

    const regelsNa = alleRegels.map((r) => (r.id in bijgewerkt ? { ...r, ontvangen: bijgewerkt[r.id] } : r))
    const alles = regelsNa.every((r) => (Number(r.ontvangen) || 0) >= Number(r.aantal))
    tx.update(orderRef, {
      status: order.status === 'geannuleerd' ? order.status : alles ? 'ontvangen' : 'deels ontvangen',
      laatsteOntvangstOp: serverTimestamp(),
    })
    return { alles }
  })
}

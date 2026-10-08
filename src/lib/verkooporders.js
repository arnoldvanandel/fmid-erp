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

// Verkooporders, opgezet zoals de inkooporders (lib/inkooporders.js):
//   verkooporders       kop van de order (VO-000001)
//   verkooporderregels  regels, met per regel hoeveel er geleverd en gefactureerd is
//   pakbonnen           een levering (PB-000001); afdruk/mail als pakbon
//   facturen            een factuur (F-000001); afdruk/mail als factuur
// Nummers lopen via counters/{verkooporders|pakbonnen|facturen}. Wil je de
// factuurnummers laten doorlopen vanaf Axapta, zet dan in counters/facturen
// het veld `laatsteNummer` op het laatste Axapta-factuurnummer.

export const STATUS_LABEL = {
  concept: 'Concept',
  bevestigd: 'Bevestigd',
  'deels geleverd': 'Deels geleverd',
  geleverd: 'Geleverd',
  gefactureerd: 'Gefactureerd',
  geannuleerd: 'Geannuleerd',
}

export const STATUS_BADGE = {
  concept: 'badge-neutral',
  bevestigd: 'badge-warning',
  'deels geleverd': 'badge-warning',
  geleverd: 'badge-success',
  gefactureerd: 'badge-success',
  geannuleerd: 'badge-danger',
}

const NUMMERS = {
  verkooporders: (n) => `VO-${String(n).padStart(6, '0')}`,
  pakbonnen: (n) => `PB-${String(n).padStart(6, '0')}`,
  facturen: (n) => `F-${String(n).padStart(6, '0')}`,
}

// Leest en verhoogt een teller binnen een lopende transactie. Moet vóór de
// eerste schrijfactie in de transactie worden aangeroepen.
async function volgendNummerInTransactie(tx, teller) {
  const ref = doc(db, 'counters', teller)
  const snap = await tx.get(ref)
  const nieuw = (snap.exists() ? Number(snap.data().laatsteNummer) || 0 : 0) + 1
  return { nummer: NUMMERS[teller](nieuw), schrijf: () => tx.set(ref, { laatsteNummer: nieuw }, { merge: true }) }
}

function vandaag() {
  return new Date().toISOString().slice(0, 10)
}

function plusDagen(iso, dagen) {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + (Number(dagen) || 0))
  return d.toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// Adressen en e-mailadressen van de klant
// ---------------------------------------------------------------------------

// Het hoofdadres van de klant in dezelfde vorm als een alternatief adres.
export function hoofdadres(klant) {
  return {
    naam: klant?.naam || '',
    straat: klant?.straat || '',
    postcode: klant?.postcode || '',
    plaats: klant?.plaats || '',
    land: klant?.land || '',
  }
}

function alsAdres(a) {
  return { naam: a.naam || '', straat: a.straat || '', postcode: a.postcode || '', plaats: a.plaats || '', land: a.land || '' }
}

// Keuzes voor het lever- of factuuradres op de order: het hoofdadres plus de
// passende alternatieve adressen van de klant. `sleutel` blijft gelijk zolang
// de klant niet verandert, zodat de gekozen optie in de lijst terug te vinden is.
export function adresKeuzes(klant, soort) {
  const types = soort === 'factuur' ? ['factuur', 'overig'] : ['levering', 'alternatief', 'overig']
  const alternatief = (klant?.adressen || [])
    .map((a, i) => ({ ...a, i }))
    .filter((a) => types.includes(a.type))
    .map((a) => ({ sleutel: `adres-${a.i}`, label: adresLabel(a), adres: alsAdres(a) }))
  return [{ sleutel: 'hoofdadres', label: `Hoofdadres — ${adresLabel(klant || {})}`, adres: hoofdadres(klant) }, ...alternatief]
}

export function adresLabel(a) {
  return [a.naam, a.straat, [a.postcode, a.plaats].filter(Boolean).join(' ')].filter(Boolean).join(', ')
}

// Standaard: het eerste alternatieve leveradres resp. factuuradres, anders het hoofdadres.
function standaardAdresKeuze(klant, soort) {
  const keuzes = adresKeuzes(klant, soort)
  const voorkeur = soort === 'factuur' ? 'factuur' : 'levering'
  const i = (klant?.adressen || []).findIndex((a) => a.type === voorkeur)
  return keuzes.find((k) => k.sleutel === `adres-${i}`) || keuzes[0]
}

// Adressen voor de mail per soort document. Valt terug op het algemene adres.
export function klantEmailadressen(klant, soort) {
  const veld = soort === 'factuur' ? 'factuurEmails' : 'orderbevestigingEmails'
  const lijst = klant?.[veld]?.length ? klant[veld] : [klant?.email].filter(Boolean)
  return [...new Set(lijst.map((e) => e.trim()).filter(Boolean))]
}

// ---------------------------------------------------------------------------
// BTW
// ---------------------------------------------------------------------------

const BTW_TARIEF = { Hoog: 21, Laag: 9, Nul: 0, Vrijgesteld: 0 }

// BTW-percentage van een regel: bij intracommunautaire levering (EU-IC) en
// export buiten de EU 0%, anders het tarief van het artikel.
export function btwPercentage(btwGroepArtikel, btwGroepKlant) {
  if (btwGroepKlant === 'EU-IC' || btwGroepKlant === 'Non-EU') return 0
  return BTW_TARIEF[btwGroepArtikel] ?? 21
}

// Tekst op de factuur bij 0% BTW vanwege de klant.
export function btwVermelding(btwGroepKlant, taal = 'nl') {
  const teksten = {
    'EU-IC': {
      nl: 'BTW verlegd — intracommunautaire levering (art. 138 Richtlijn 2006/112/EG)',
      de: 'Steuerschuldnerschaft des Leistungsempfängers — innergemeinschaftliche Lieferung (Art. 138 MwStSystRL)',
      en: 'VAT reverse charge — intra-Community supply (Art. 138 Directive 2006/112/EC)',
    },
    'Non-EU': {
      nl: 'Export buiten de EU — 0% BTW',
      de: 'Ausfuhrlieferung außerhalb der EU — 0% MwSt.',
      en: 'Export outside the EU — 0% VAT',
    },
  }
  return teksten[btwGroepKlant]?.[taal] || teksten[btwGroepKlant]?.nl || ''
}

// Netto, BTW per tarief en totaal over een lijst regels { aantal, prijs, btwPercentage }.
export function berekenTotalen(regels) {
  const perTarief = {}
  let netto = 0
  for (const r of regels) {
    const bedrag = Math.round((Number(r.aantal) || 0) * (Number(r.prijs) || 0) * 100) / 100
    netto += bedrag
    const pct = Number(r.btwPercentage) || 0
    perTarief[pct] = (perTarief[pct] || 0) + bedrag
  }
  const btw = Object.entries(perTarief)
    .map(([pct, grondslag]) => ({
      percentage: Number(pct),
      grondslag: Math.round(grondslag * 100) / 100,
      bedrag: Math.round(grondslag * Number(pct)) / 100,
    }))
    .sort((a, b) => b.percentage - a.percentage)
  netto = Math.round(netto * 100) / 100
  const btwTotaal = Math.round(btw.reduce((s, b) => s + b.bedrag, 0) * 100) / 100
  return { netto, btw, btwTotaal, totaal: Math.round((netto + btwTotaal) * 100) / 100 }
}

// ---------------------------------------------------------------------------
// Verkooporder en regels
// ---------------------------------------------------------------------------

export async function maakVerkooporder({ klant, gebruiker }) {
  if (!klant?.id) throw new Error('Geen klant gekozen.')
  if (klant.geblokkeerd) throw new Error(`Klant ${klant.klantcode} is geblokkeerd.`)

  const lever = standaardAdresKeuze(klant, 'levering')
  const factuur = standaardAdresKeuze(klant, 'factuur')
  const ordernummer = await runTransaction(db, async (tx) => {
    const { nummer, schrijf } = await volgendNummerInTransactie(tx, 'verkooporders')
    schrijf()
    return nummer
  })

  const order = {
    ordernummer,
    klantId: klant.id,
    klantcode: klant.klantcode || '',
    klantNaam: klant.naam || '',
    status: 'concept',
    orderdatum: vandaag(),
    gewensteLeverdatum: '',
    // "Uw referentie": het ordernummer of de naam bij de klant.
    referentie: '',
    contactpersoon: klant.contactpersoon || '',
    verkoper: gebruiker || '',
    leveringsvoorwaarde: klant.leveringsvoorwaarde || '',
    leveringswijze: klant.leveringswijze || '',
    leveradresKeuze: lever.sleutel,
    leveradres: lever.adres,
    factuuradresKeuze: factuur.sleutel,
    factuuradres: factuur.adres,
    // Overgenomen van de klant, zodat de order niet verandert als de klant later wordt aangepast.
    btwGroep: klant.btwGroep || 'NL',
    btwNummer: klant.btwNummer || '',
    valuta: klant.valuta || 'EUR',
    betalingstermijn: Number(klant.betalingstermijn ?? 30),
    taal: klant.taal || 'nl',
    opmerkingen: '',
    aangemaaktDoor: gebruiker || '',
    datum: serverTimestamp(),
  }
  const ref = await addDoc(collection(db, 'verkooporders'), order)
  return { ...order, id: ref.id, datum: new Date() }
}

export async function wijzigVerkooporder(verkooporderId, updates) {
  await updateDoc(doc(db, 'verkooporders', verkooporderId), updates)
}

export async function verwijderVerkooporder(verkooporderId) {
  const [regels, pakbonnen, facturen] = await Promise.all(
    ['verkooporderregels', 'pakbonnen', 'facturen'].map((c) =>
      getDocs(query(collection(db, c), where('verkooporderId', '==', verkooporderId)))
    )
  )
  if (!pakbonnen.empty || !facturen.empty) {
    throw new Error('Deze order heeft al pakbonnen of facturen en kan niet worden verwijderd. Annuleer de order.')
  }
  await Promise.all(regels.docs.map((d) => deleteDoc(d.ref)))
  await deleteDoc(doc(db, 'verkooporders', verkooporderId))
}

// Verkoopprijs per stuk uit het artikel. Prijzen uit Axapta gelden vaak per
// 100 of 1000 stuks.
export function verkoopprijsPerStuk(artikel) {
  const perStuk = (Number(artikel?.verkoopprijs) || 0) / (Number(artikel?.verkoopprijsHoeveelheid) || 1)
  return Math.round(perStuk * 10000) / 10000
}

export async function voegVerkooporderRegelToe({
  verkooporder,
  artikel,
  aantal,
  prijs,
  leverdatum = '',
  klantArtikelnummer = '',
  hoogsteRegelnummer = 0,
}) {
  if (!artikel?.id) throw new Error('Kies een artikel.')
  if (artikel.geblokkeerd || artikel.verkoopGeblokkeerd) {
    throw new Error(`Artikel ${artikel.artikelnummer} is geblokkeerd voor verkoop.`)
  }
  const n = Number(aantal)
  if (!Number.isFinite(n) || n <= 0) throw new Error('Aantal moet een positief getal zijn.')
  const p = Number(prijs)
  if (!Number.isFinite(p) || p < 0) throw new Error('Prijs moet een getal zijn.')

  await addDoc(collection(db, 'verkooporderregels'), {
    verkooporderId: verkooporder.id,
    regelnummer: hoogsteRegelnummer + 10,
    artikelId: artikel.id,
    artikelnummer: artikel.artikelnummer || '',
    artikelnaam: artikel.naam || '',
    eenheid: artikel.eenheid || '',
    btwGroep: artikel.btwGroep || 'Hoog',
    aantal: n,
    prijs: p,
    leverdatum: leverdatum || verkooporder.gewensteLeverdatum || '',
    klantArtikelnummer: (klantArtikelnummer || '').trim(),
    geleverd: 0,
    gefactureerd: 0,
  })
}

export async function wijzigVerkooporderRegel(regelId, updates) {
  await updateDoc(doc(db, 'verkooporderregels', regelId), updates)
}

export async function verwijderVerkooporderRegel(regel) {
  if ((Number(regel.geleverd) || 0) > 0 || (Number(regel.gefactureerd) || 0) > 0) {
    throw new Error('Deze regel is al (deels) geleverd of gefactureerd en kan niet worden verwijderd.')
  }
  await deleteDoc(doc(db, 'verkooporderregels', regel.id))
}

async function laadRegels(verkooporderId) {
  const snap = await getDocs(query(collection(db, 'verkooporderregels'), where('verkooporderId', '==', verkooporderId)))
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (Number(a.regelnummer) || 0) - (Number(b.regelnummer) || 0))
}

// Alles voor de orderbevestiging: kop, klant en regels.
export async function laadVerkooporderVoorAfdruk(verkooporderId) {
  const orderSnap = await getDoc(doc(db, 'verkooporders', verkooporderId))
  if (!orderSnap.exists()) throw new Error('Verkooporder niet gevonden.')
  const order = { id: orderSnap.id, ...orderSnap.data() }
  const [klantSnap, regels] = await Promise.all([
    order.klantId ? getDoc(doc(db, 'klanten', order.klantId)) : null,
    laadRegels(verkooporderId),
  ])
  return {
    soort: 'bevestiging',
    order,
    klant: klantSnap?.exists() ? { id: klantSnap.id, ...klantSnap.data() } : null,
    regels,
  }
}

// Pakbon of factuur met de bijbehorende order en klant, voor afdruk of mail.
export async function laadDocumentVoorAfdruk(collectie, id) {
  const snap = await getDoc(doc(db, collectie, id))
  if (!snap.exists()) throw new Error(collectie === 'facturen' ? 'Factuur niet gevonden.' : 'Pakbon niet gevonden.')
  const document = { id: snap.id, ...snap.data() }
  const [orderSnap, klantSnap] = await Promise.all([
    getDoc(doc(db, 'verkooporders', document.verkooporderId)),
    document.klantId ? getDoc(doc(db, 'klanten', document.klantId)) : null,
  ])
  return {
    soort: collectie === 'facturen' ? 'factuur' : 'pakbon',
    document,
    order: orderSnap.exists() ? { id: orderSnap.id, ...orderSnap.data() } : null,
    klant: klantSnap?.exists() ? { id: klantSnap.id, ...klantSnap.data() } : null,
    regels: document.regels || [],
  }
}

// Status van de order na een levering of factuur, afgeleid uit de regels.
function statusNa(order, regels) {
  if (order.status === 'geannuleerd') return order.status
  const actief = regels.filter((r) => Number(r.aantal) > 0)
  if (actief.length === 0) return order.status
  if (actief.every((r) => (Number(r.gefactureerd) || 0) >= Number(r.aantal))) return 'gefactureerd'
  if (actief.every((r) => (Number(r.geleverd) || 0) >= Number(r.aantal))) return 'geleverd'
  if (actief.some((r) => (Number(r.geleverd) || 0) > 0)) return 'deels geleverd'
  return order.status
}

// ---------------------------------------------------------------------------
// Pakbon
// ---------------------------------------------------------------------------

// Maakt een pakbon voor de opgegeven aantallen ({ regelId: aantal }). Werkt de
// regels (geleverd) en de orderstatus bij, en boekt desgewenst de voorraad af
// van `locatieId`. Alles in één transactie: lukt één onderdeel niet (bijv.
// onvoldoende voorraad), dan wordt er niets vastgelegd.
export async function maakPakbon({ verkooporderId, aantallen, locatieId, leverdatum, gebruiker }) {
  const regelIds = Object.keys(aantallen).filter((id) => Number(aantallen[id]) > 0)
  if (regelIds.length === 0) throw new Error('Vul bij minimaal één regel een aantal in.')

  return runTransaction(db, async (tx) => {
    const { nummer, schrijf } = await volgendNummerInTransactie(tx, 'pakbonnen')
    const orderRef = doc(db, 'verkooporders', verkooporderId)
    const orderSnap = await tx.get(orderRef)
    if (!orderSnap.exists()) throw new Error('Verkooporder niet gevonden.')
    const order = orderSnap.data()
    const alleRegels = await laadRegels(verkooporderId)
    const regelSnaps = await Promise.all(regelIds.map((id) => tx.get(doc(db, 'verkooporderregels', id))))

    let locatie = null
    const standen = {}
    if (locatieId) {
      const locSnap = await tx.get(doc(db, 'locaties', locatieId))
      if (!locSnap.exists()) throw new Error('Locatie bestaat niet (meer).')
      locatie = { id: locSnap.id, ...locSnap.data() }
      for (const s of regelSnaps) {
        const artikelId = s.data().artikelId
        if (!standen[artikelId]) standen[artikelId] = await tx.get(doc(db, 'voorraadstanden', voorraadstandId(artikelId, locatieId)))
      }
    }

    // Controleren en berekenen (nog niets schrijven).
    const pakbonRegels = []
    const bijgewerkt = {}
    const afboeken = {}
    for (const s of regelSnaps) {
      if (!s.exists()) throw new Error('Een orderregel bestaat niet meer; vernieuw de order.')
      const r = s.data()
      const n = Number(aantallen[s.id])
      const geleverd = (Number(r.geleverd) || 0) + n
      bijgewerkt[s.id] = geleverd
      afboeken[r.artikelId] = (afboeken[r.artikelId] || 0) + n
      pakbonRegels.push({
        regelId: s.id,
        artikelId: r.artikelId,
        artikelnummer: r.artikelnummer,
        artikelnaam: r.artikelnaam,
        klantArtikelnummer: r.klantArtikelnummer || '',
        eenheid: r.eenheid,
        besteld: Number(r.aantal) || 0,
        aantal: n,
        nogTeLeveren: Math.max(0, (Number(r.aantal) || 0) - geleverd),
      })
    }
    if (locatie) {
      for (const [artikelId, n] of Object.entries(afboeken)) {
        const huidig = standen[artikelId].exists() ? Number(standen[artikelId].data().aantal) || 0 : 0
        if (huidig - n < 0) {
          const r = pakbonRegels.find((p) => p.artikelId === artikelId)
          throw new Error(
            `Onvoldoende voorraad van ${r.artikelnummer} op ${locatie.code}: nog ${huidig}, kan niet ${n} afboeken.`
          )
        }
      }
    }

    // Schrijven.
    schrijf()
    const pakbonRef = doc(collection(db, 'pakbonnen'))
    tx.set(pakbonRef, {
      pakbonnummer: nummer,
      verkooporderId,
      ordernummer: order.ordernummer,
      klantId: order.klantId,
      klantcode: order.klantcode,
      klantNaam: order.klantNaam,
      leveradres: order.leveradres || null,
      referentie: order.referentie || '',
      leveringswijze: order.leveringswijze || '',
      taal: order.taal || 'nl',
      leverdatum: leverdatum || vandaag(),
      regels: pakbonRegels,
      locatieId: locatie?.id || '',
      locatieCode: locatie?.code || '',
      gemaaktDoor: gebruiker || '',
      datum: serverTimestamp(),
    })
    for (const [id, geleverd] of Object.entries(bijgewerkt)) {
      tx.update(doc(db, 'verkooporderregels', id), { geleverd })
    }
    if (locatie) {
      for (const [artikelId, n] of Object.entries(afboeken)) {
        const huidig = standen[artikelId].exists() ? Number(standen[artikelId].data().aantal) || 0 : 0
        const r = pakbonRegels.find((p) => p.artikelId === artikelId)
        tx.set(
          doc(db, 'voorraadstanden', voorraadstandId(artikelId, locatie.id)),
          { artikelId, artikelnummer: r.artikelnummer, locatieId: locatie.id, locatieCode: locatie.code || '', aantal: huidig - n },
          { merge: true }
        )
        tx.set(doc(collection(db, 'voorraadmutaties')), {
          artikelId,
          artikelnummer: r.artikelnummer,
          artikelnaam: r.artikelnaam,
          locatieId: locatie.id,
          locatieCode: locatie.code || '',
          type: 'uit',
          aantal: n,
          voorraadVoor: huidig,
          voorraadNa: huidig - n,
          reden: `Pakbon ${nummer} (${order.ordernummer}, ${order.klantNaam})`,
          gebruiker: gebruiker || '',
          datum: serverTimestamp(),
        })
      }
    }
    const regelsNa = alleRegels.map((r) => (r.id in bijgewerkt ? { ...r, geleverd: bijgewerkt[r.id] } : r))
    tx.update(orderRef, { status: statusNa(order, regelsNa) })
    return { id: pakbonRef.id, pakbonnummer: nummer }
  })
}

// ---------------------------------------------------------------------------
// Factuur
// ---------------------------------------------------------------------------

// Maakt een factuur voor de opgegeven aantallen ({ regelId: aantal }), met de
// prijzen van de orderregels en de BTW volgens de BTW-groep van de klant.
export async function maakFactuur({ verkooporderId, aantallen, factuurdatum, gebruiker }) {
  const regelIds = Object.keys(aantallen).filter((id) => Number(aantallen[id]) > 0)
  if (regelIds.length === 0) throw new Error('Vul bij minimaal één regel een aantal in.')
  const datum = factuurdatum || vandaag()

  return runTransaction(db, async (tx) => {
    const { nummer, schrijf } = await volgendNummerInTransactie(tx, 'facturen')
    const orderRef = doc(db, 'verkooporders', verkooporderId)
    const orderSnap = await tx.get(orderRef)
    if (!orderSnap.exists()) throw new Error('Verkooporder niet gevonden.')
    const order = orderSnap.data()
    const alleRegels = await laadRegels(verkooporderId)
    const regelSnaps = await Promise.all(regelIds.map((id) => tx.get(doc(db, 'verkooporderregels', id))))

    const factuurRegels = []
    const bijgewerkt = {}
    for (const s of regelSnaps) {
      if (!s.exists()) throw new Error('Een orderregel bestaat niet meer; vernieuw de order.')
      const r = s.data()
      const n = Number(aantallen[s.id])
      bijgewerkt[s.id] = (Number(r.gefactureerd) || 0) + n
      factuurRegels.push({
        regelId: s.id,
        artikelId: r.artikelId,
        artikelnummer: r.artikelnummer,
        artikelnaam: r.artikelnaam,
        klantArtikelnummer: r.klantArtikelnummer || '',
        eenheid: r.eenheid,
        aantal: n,
        prijs: Number(r.prijs) || 0,
        bedrag: Math.round(n * (Number(r.prijs) || 0) * 100) / 100,
        btwPercentage: btwPercentage(r.btwGroep, order.btwGroep),
      })
    }
    const totalen = berekenTotalen(factuurRegels)

    schrijf()
    const factuurRef = doc(collection(db, 'facturen'))
    tx.set(factuurRef, {
      factuurnummer: nummer,
      verkooporderId,
      ordernummer: order.ordernummer,
      klantId: order.klantId,
      klantcode: order.klantcode,
      klantNaam: order.klantNaam,
      factuuradres: order.factuuradres || null,
      referentie: order.referentie || '',
      btwGroep: order.btwGroep || 'NL',
      btwNummer: order.btwNummer || '',
      valuta: order.valuta || 'EUR',
      taal: order.taal || 'nl',
      factuurdatum: datum,
      betalingstermijn: Number(order.betalingstermijn) || 0,
      vervaldatum: plusDagen(datum, order.betalingstermijn),
      regels: factuurRegels,
      ...totalen,
      gemaaktDoor: gebruiker || '',
      datum: serverTimestamp(),
    })
    for (const [id, gefactureerd] of Object.entries(bijgewerkt)) {
      tx.update(doc(db, 'verkooporderregels', id), { gefactureerd })
    }
    const regelsNa = alleRegels.map((r) => (r.id in bijgewerkt ? { ...r, gefactureerd: bijgewerkt[r.id] } : r))
    tx.update(orderRef, { status: statusNa(order, regelsNa) })
    return { id: factuurRef.id, factuurnummer: nummer }
  })
}

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { db } from '../firebase'
import { haalArtikelOpNummer, zoekTermen } from './artikelZoeken'
import { hoofdadres, plusDagen } from './verkooporders'
import { schoonMateriaal } from './materiaalCalculator'
import { VALUTA } from './stamgegevens'

// Calculaties en aanbiedingen aan de klant:
//   1. artikel aanmaken (eerste 3 letters van de klant + het artikelnummer van de klant)
//   2. tekening bij het artikel zetten (artikeldocumenten, zie lib/documenten.js)
//   3. calculatie maken: bewerkingen en kosten, per aantal een kostprijs
//   4. prijs per aantal en de leveringsvoorwaarden invullen
//   5. aanbieding naar de klant mailen (lib/calculatieMail.js)
// Alles staat in één document in `calculaties` (CA-000001, teller counters/calculaties).

export const STATUS_LABEL = {
  concept: 'Concept',
  verstuurd: 'Verstuurd',
  akkoord: 'Akkoord',
  afgewezen: 'Afgewezen',
}

export const STATUS_BADGE = {
  concept: 'badge-neutral',
  verstuurd: 'badge-warning',
  akkoord: 'badge-success',
  afgewezen: 'badge-danger',
}

export const KOSTENSOORTEN = ['Materiaal', 'Uitbesteed', 'Gereedschap', 'Overig']

// Uurtarief dat bij een nieuwe bewerking wordt voorgesteld.
export const STANDAARD_UURTARIEF = 75
export const STANDAARD_MARGE = 25
export const STANDAARD_GELDIG_DAGEN = 30

function vandaag() {
  return new Date().toISOString().slice(0, 10)
}

function getal(waarde) {
  const n = Number(waarde)
  return Number.isFinite(n) ? n : 0
}

function rond(waarde, decimalen = 2) {
  const f = 10 ** decimalen
  return Math.round((getal(waarde) + Number.EPSILON) * f) / f
}

// ---------------------------------------------------------------------------
// Artikelnummer
// ---------------------------------------------------------------------------

// Eerste drie letters van de klantnaam, in hoofdletters: "F.M.I. Dussen" -> "FMI".
export function klantVoorvoegsel(klant) {
  const letters = String(klant?.naam || '')
    .normalize('NFD')
    .replace(/[^A-Za-z]/g, '')
    .toUpperCase()
  return letters.slice(0, 3)
}

// Voorstel voor ons artikelnummer: voorvoegsel + het artikelnummer van de klant.
export function stelArtikelnummerVoor(klant, klantArtikelnummer) {
  const nummer = String(klantArtikelnummer || '').trim()
  return nummer ? `${klantVoorvoegsel(klant)}${nummer}` : ''
}

// ---------------------------------------------------------------------------
// Rekenen
// ---------------------------------------------------------------------------

// "10, 50; 100" -> [10, 50, 100]
export function leesAantallen(tekst) {
  const lijst = String(tekst || '')
    .split(/[;,\s/]+/)
    .map((t) => Number(t.replace(',', '.')))
    .filter((n) => Number.isFinite(n) && n > 0)
  return [...new Set(lijst)].sort((a, b) => a - b)
}

// Tijd per stuk in seconden. De eerste calculaties bewaarden minuten
// (`stukMinuten`); die rekenen we om.
export function stukSeconden(bewerking) {
  if (bewerking?.stukSeconden !== undefined && bewerking.stukSeconden !== '') return getal(bewerking.stukSeconden)
  return getal(bewerking?.stukMinuten) * 60
}

// Kosten van één bewerking: instellen (eenmalig per serie) en per stuk.
export function bewerkingKosten(bewerking) {
  const tarief = getal(bewerking?.uurtarief)
  return {
    instel: (getal(bewerking?.instelMinuten) / 60) * tarief,
    perStuk: (stukSeconden(bewerking) / 3600) * tarief,
  }
}

// Kosten die één keer per serie vallen (instellen, gereedschap) en kosten per stuk.
export function kostenOpbouw(calculatie) {
  let vast = 0
  let perStuk = 0
  for (const b of calculatie?.bewerkingen || []) {
    const k = bewerkingKosten(b)
    vast += k.instel
    perStuk += k.perStuk
  }
  for (const k of calculatie?.kosten || []) {
    vast += getal(k.eenmalig)
    perStuk += getal(k.perStuk)
  }
  return { vast, perStuk }
}

// Per aantal: kostprijs per stuk, de adviesprijs (kostprijs + marge) en de
// prijs voor de klant. `prijzen` bevat per aantal de zelf ingevulde prijs;
// zonder invulling geldt de adviesprijs.
export function berekenPrijzen(calculatie) {
  const { vast, perStuk } = kostenOpbouw(calculatie)
  const marge = getal(calculatie?.marge)
  const prijzen = calculatie?.prijzen || {}
  return (calculatie?.aantallen || []).map((aantal) => {
    const kostprijs = perStuk + vast / aantal
    const advies = rond(kostprijs * (1 + marge / 100))
    const ingevuld = prijzen[String(aantal)]
    const prijs = ingevuld === '' || ingevuld == null ? advies : rond(ingevuld, 4)
    return {
      aantal,
      vastPerStuk: vast / aantal,
      perStuk,
      kostprijs,
      advies,
      prijs,
      handmatig: !(ingevuld === '' || ingevuld == null),
      // Opslag op de kostprijs, en marge op de verkoopprijs (wat je aan de klant verdient).
      opslagPct: kostprijs > 0 ? ((prijs - kostprijs) / kostprijs) * 100 : 0,
      margePct: prijs > 0 ? ((prijs - kostprijs) / prijs) * 100 : 0,
      bedrag: prijs * aantal,
    }
  })
}

// Prijs per stuk terugrekenen vanuit wat je in de prijstabel aanpast.
export function prijsUitOpslag(kostprijs, opslagPct) {
  return rond(getal(kostprijs) * (1 + getal(opslagPct) / 100), 4)
}

export function prijsUitMarge(kostprijs, margePct) {
  const m = getal(margePct)
  if (m >= 100) throw new Error('Een marge van 100% of meer kan niet.')
  return rond(getal(kostprijs) / (1 - m / 100), 4)
}

export function prijsUitBedrag(bedrag, aantal) {
  return getal(aantal) > 0 ? rond(getal(bedrag) / getal(aantal), 4) : 0
}

// ---------------------------------------------------------------------------
// Aanmaken, wijzigen, verwijderen
// ---------------------------------------------------------------------------

async function volgendNummer() {
  return runTransaction(db, async (tx) => {
    const ref = doc(db, 'counters', 'calculaties')
    const snap = await tx.get(ref)
    const nieuw = (snap.exists() ? Number(snap.data().laatsteNummer) || 0 : 0) + 1
    tx.set(ref, { laatsteNummer: nieuw }, { merge: true })
    return `CA-${String(nieuw).padStart(6, '0')}`
  })
}

// Stap 1: het artikel. Bestaat het artikelnummer al, dan gebruiken we dat artikel.
async function maakOfVindArtikel({ klant, artikelnummer, klantArtikelnummer, omschrijving }) {
  const bestaand = await haalArtikelOpNummer(artikelnummer)
  if (bestaand) return { artikel: bestaand, nieuw: false }

  const payload = {
    artikelnummer,
    naam: omschrijving,
    eenheid: 'Stuks',
    artikeltype: 'Artikel',
    btwGroep: 'Hoog',
    barcodeDoos: '',
    barcodeZak: '',
    barcode: '',
    barcodeCodes: [],
    inkoopprijs: 0,
    inkoopprijsHoeveelheid: 1,
    verkoopprijs: 0,
    verkoopprijsHoeveelheid: 1,
    minVoorraad: 0,
    levertijd: 0,
    geblokkeerd: false,
    // Klantspecifiek artikel: bij welke klant het hoort en hoe de klant het noemt.
    klantId: klant.id,
    klantcode: klant.klantcode || '',
    klantArtikelnummer,
    createdAt: serverTimestamp(),
  }
  payload.zoek = zoekTermen({ ...payload, zoeknaam: klantArtikelnummer })
  const ref = await addDoc(collection(db, 'artikelen'), payload)
  return { artikel: { ...payload, id: ref.id }, nieuw: true }
}

export async function maakCalculatie({ klant, artikelnummer, klantArtikelnummer, revisie, omschrijving, gebruiker }) {
  if (!klant?.id) throw new Error('Kies een klant.')
  if (klant.geblokkeerd) throw new Error(`Klant ${klant.klantcode} is geblokkeerd.`)
  const nummer = String(artikelnummer || '').trim()
  const klantNummer = String(klantArtikelnummer || '').trim()
  const naam = String(omschrijving || '').trim()
  if (!klantNummer) throw new Error('Vul het artikelnummer van de klant in.')
  if (!nummer) throw new Error('Vul ons artikelnummer in.')
  if (!naam) throw new Error('Vul een omschrijving in.')

  const { artikel, nieuw } = await maakOfVindArtikel({
    klant,
    artikelnummer: nummer,
    klantArtikelnummer: klantNummer,
    omschrijving: naam,
  })
  const calculatienummer = await volgendNummer()

  const calculatie = {
    calculatienummer,
    status: 'concept',
    calculatiedatum: vandaag(),
    klantId: klant.id,
    klantcode: klant.klantcode || '',
    klantNaam: klant.naam || '',
    adres: hoofdadres(klant),
    contactpersoon: klant.contactpersoon || '',
    taal: klant.taal || 'nl',
    valuta: klant.valuta || 'EUR',
    artikelId: artikel.id,
    artikelnummer: artikel.artikelnummer,
    klantArtikelnummer: klantNummer,
    // Revisie van de tekening waarop de calculatie gemaakt is.
    revisie: String(revisie || '').trim(),
    omschrijving: naam,
    eenheid: artikel.eenheid || 'Stuks',
    // Stap 3: de calculatie zelf.
    aantallen: [1],
    bewerkingen: [],
    kosten: [],
    marge: STANDAARD_MARGE,
    prijzen: {},
    // Stap 4: voorwaarden bij de prijs.
    referentie: '',
    leveringsvoorwaarde: klant.leveringsvoorwaarde || '',
    levertijd: '',
    geldigDagen: STANDAARD_GELDIG_DAGEN,
    betalingstermijn: Number(klant.betalingstermijn ?? 30),
    opmerkingen: '',
    notities: '',
    behandeldDoor: gebruiker || '',
    aangemaaktDoor: gebruiker || '',
    datum: serverTimestamp(),
  }
  const ref = await addDoc(collection(db, 'calculaties'), calculatie)
  return { calculatie: { ...calculatie, id: ref.id, datum: new Date() }, artikelNieuw: nieuw }
}

// Velden van het formulier -> wat we opslaan. De berekende regels gaan mee
// (`regels`), zodat lijst en aanbieding niet opnieuw hoeven te rekenen.
export function calculatieVelden(form) {
  const aantallen = leesAantallen(Array.isArray(form.aantallen) ? form.aantallen.join(' ') : form.aantallen)
  const prijzen = {}
  for (const aantal of aantallen) {
    const p = form.prijzen?.[String(aantal)]
    if (p !== '' && p != null && Number.isFinite(Number(p))) prijzen[String(aantal)] = rond(p, 4)
  }
  const velden = {
    omschrijving: String(form.omschrijving || '').trim(),
    klantArtikelnummer: String(form.klantArtikelnummer || '').trim(),
    revisie: String(form.revisie || '').trim(),
    contactpersoon: String(form.contactpersoon || '').trim(),
    referentie: String(form.referentie || '').trim(),
    aantallen,
    bewerkingen: (form.bewerkingen || [])
      .filter((b) => String(b.omschrijving || '').trim() || getal(b.instelMinuten) || stukSeconden(b))
      .map((b) => ({
        omschrijving: String(b.omschrijving || '').trim(),
        instelMinuten: getal(b.instelMinuten),
        stukSeconden: stukSeconden(b),
        uurtarief: getal(b.uurtarief),
      })),
    kosten: (form.kosten || [])
      .filter((k) => String(k.omschrijving || '').trim() || getal(k.perStuk) || getal(k.eenmalig))
      .map((k) => ({
        soort: KOSTENSOORTEN.includes(k.soort) ? k.soort : 'Overig',
        omschrijving: String(k.omschrijving || '').trim(),
        perStuk: getal(k.perStuk),
        eenmalig: getal(k.eenmalig),
        // Invoer van de materiaalcalculator, zodat je hem later kunt bijstellen.
        ...(k.soort === 'Materiaal' && k.materiaal ? { materiaal: schoonMateriaal(k.materiaal) } : {}),
      })),
    marge: getal(form.marge),
    prijzen,
    valuta: VALUTA.includes(form.valuta) ? form.valuta : 'EUR',
    leveringsvoorwaarde: String(form.leveringsvoorwaarde || '').trim(),
    levertijd: String(form.levertijd || '').trim(),
    geldigDagen: getal(form.geldigDagen),
    betalingstermijn: getal(form.betalingstermijn),
    opmerkingen: String(form.opmerkingen || '').trim(),
    notities: String(form.notities || '').trim(),
    status: STATUS_LABEL[form.status] ? form.status : 'concept',
  }
  velden.regels = berekenPrijzen(velden).map((r) => ({
    aantal: r.aantal,
    kostprijs: rond(r.kostprijs, 4),
    prijs: r.prijs,
  }))
  return velden
}

export async function wijzigCalculatie(calculatie, form) {
  const velden = calculatieVelden(form)
  if (!velden.omschrijving) throw new Error('Vul een omschrijving in.')
  if (velden.aantallen.length === 0) throw new Error('Vul minimaal één aantal in.')
  await updateDoc(doc(db, 'calculaties', calculatie.id), { ...velden, gewijzigdOp: serverTimestamp() })
  // De omschrijving en het klantnummer horen ook bij het artikel.
  if (
    calculatie.artikelId &&
    (velden.omschrijving !== calculatie.omschrijving || velden.klantArtikelnummer !== calculatie.klantArtikelnummer)
  ) {
    const snap = await getDoc(doc(db, 'artikelen', calculatie.artikelId))
    if (snap.exists()) {
      const artikel = snap.data()
      const nieuw = { naam: velden.omschrijving, klantArtikelnummer: velden.klantArtikelnummer }
      await updateDoc(snap.ref, {
        ...nieuw,
        zoek: zoekTermen({ ...artikel, ...nieuw, zoeknaam: artikel.zoeknaam || velden.klantArtikelnummer }),
      })
    }
  }
  return velden
}

// Het artikel en de tekeningen blijven staan; alleen de calculatie gaat weg.
export async function verwijderCalculatie(calculatie) {
  await deleteDoc(doc(db, 'calculaties', calculatie.id))
}

// ---------------------------------------------------------------------------
// Aanbieding
// ---------------------------------------------------------------------------

export function geldigTot(calculatie) {
  const dagen = getal(calculatie?.geldigDagen)
  return calculatie?.calculatiedatum && dagen > 0 ? plusDagen(calculatie.calculatiedatum, dagen) : ''
}

// Alles wat de aanbieding (afdruk, PDF, mail) nodig heeft.
export async function laadCalculatieVoorAfdruk(calculatieId) {
  const snap = await getDoc(doc(db, 'calculaties', calculatieId))
  if (!snap.exists()) throw new Error('Calculatie niet gevonden.')
  const calculatie = { id: snap.id, ...snap.data() }
  const klantSnap = calculatie.klantId ? await getDoc(doc(db, 'klanten', calculatie.klantId)) : null
  const klant = klantSnap?.exists() ? { id: klantSnap.id, ...klantSnap.data() } : null
  return { calculatie, klant, regels: berekenPrijzen(calculatie) }
}

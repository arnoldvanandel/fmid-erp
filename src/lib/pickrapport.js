import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore'
import { db } from '../firebase'

const SLEUTEL = (klantId) => `pickrapport-${klantId}`

function blijftLiggen(p) {
  const voorraad = Number(p.voorraadOpLocatie ?? p.opLocatie)
  if (!Number.isFinite(voorraad)) return null
  return Math.max(0, voorraad - (Number(p.aantal) || 0))
}

function regelVoorRapport(p) {
  return {
    locatieCode: p.locatieCode || '',
    artikelnummer: p.artikelnummer || '',
    artikelnaam: p.artikelnaam || '',
    aantal: Number(p.aantal) || 0,
    gevraagd: Number.isFinite(Number(p.gevraagd)) ? Number(p.gevraagd) : Number(p.aantal) || 0,
    eenheid: p.eenheid || '',
    blijft: blijftLiggen(p),
    totaalOpen: Number.isFinite(Number(p.totaalOpen)) ? Number(p.totaalOpen) : null,
    ordernummers: (p.ordernummers || [p.ordernummer]).filter(Boolean),
    vervangt: p.vervangt || '',
    verdeling: (p.verdeling || [])
      .map((v) => ({
        orderId: v.orderId || '',
        ordernummer: v.ordernummer || '',
        regelId: v.regelId || '',
        regelnummer: v.regelnummer ?? '',
        aantal: Number(v.aantal) || 0,
      }))
      .filter((v) => v.aantal > 0),
  }
}

function tekortVoorRapport(t) {
  return {
    ordernummer: t.ordernummer || '',
    regelnummer: t.regelnummer ?? '',
    artikelnummer: t.artikelnummer || '',
    artikelnaam: t.artikelnaam || '',
    tekort: Number(t.tekort) || 0,
    eenheid: t.eenheid || '',
    nodig: Number.isFinite(Number(t.nodig)) ? Number(t.nodig) : null,
  }
}

function rond3(n) {
  return Math.round(n * 1000) / 1000
}

function schaalVerdeling(verdeling, nieuwAantal) {
  const stukken = (verdeling || []).filter((v) => (Number(v.aantal) || 0) > 0)
  const totaal = stukken.reduce((som, v) => som + (Number(v.aantal) || 0), 0)
  const doel = Math.max(0, Number(nieuwAantal) || 0)
  if (stukken.length === 0 || doel <= 0 || totaal <= 0) return []
  if (Math.abs(doel - totaal) < 1e-9) {
    return stukken.map((v) => ({ ...v, aantal: Number(v.aantal) || 0 }))
  }

  const geheel = Number.isInteger(doel) && stukken.every((v) => Number.isInteger(Number(v.aantal)))
  if (geheel) {
    const basis = stukken.map((v) => {
      const exact = ((Number(v.aantal) || 0) / totaal) * doel
      return { stuk: v, aantal: Math.floor(exact), rest: exact - Math.floor(exact) }
    })
    let over = doel - basis.reduce((som, v) => som + v.aantal, 0)
    const volgorde = basis.map((v, i) => i).sort((a, b) => basis[b].rest - basis[a].rest)
    for (const i of volgorde) {
      if (over <= 0) break
      basis[i].aantal += 1
      over -= 1
    }
    return basis
      .filter((v) => v.aantal > 0)
      .map((v) => ({ ...v.stuk, aantal: v.aantal }))
  }

  let rest = doel
  return stukken
    .map((v, i) => {
      const deel =
        i === stukken.length - 1
          ? rest
          : Math.round((((Number(v.aantal) || 0) / totaal) * doel) * 1000) / 1000
      const aantal = Math.max(0, Math.min(rest, deel))
      rest = Math.round((rest - aantal) * 1000) / 1000
      return { ...v, aantal }
    })
    .filter((v) => v.aantal > 0)
}

// Het bevestigde aantal vervangt het gevraagde. Minder gepickt wordt
// evenredig over de orders verdeeld, zodat er niet meer ingepakt kan worden.
export function pasPickHoeveelheid(pick, bevestigd) {
  const gevraagd = Number(pick?.aantal) || 0
  const ingevuld = Number(bevestigd)
  const ruw = Number.isFinite(ingevuld) ? ingevuld : gevraagd
  const aantal = Math.min(gevraagd, Math.max(0, ruw))
  return {
    ...pick,
    gevraagd,
    aantal,
    verdeling: schaalVerdeling(pick?.verdeling || [], aantal),
  }
}

// Wat er op de telefoon is afgevinkt, als afdrukbaar rapport.
export function bouwPickrapport({ klant, orders, picks, tekorten, gebruiker }) {
  return {
    klantId: klant.id,
    klantcode: klant.klantcode || '',
    klantNaam: klant.naam || '',
    ordernummers: (orders || []).map((o) => o.ordernummer).filter(Boolean),
    gebruiker: gebruiker || '',
    gepicktOp: new Date().toISOString(),
    regels: (picks || []).map(regelVoorRapport),
    tekorten: (tekorten || []).map(tekortVoorRapport),
  }
}

export function schrijfPickrapportLokaal(rapport) {
  try {
    sessionStorage.setItem(SLEUTEL(rapport.klantId), JSON.stringify(rapport))
  } catch {
    // Opslag kan geblokkeerd zijn; Firestore is dan de kopie voor de pc.
  }
}

export function leesPickrapportLokaal(klantId) {
  try {
    const raw = sessionStorage.getItem(SLEUTEL(klantId))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function nieuwer(a, b) {
  if (!a) return b
  if (!b) return a
  return String(a.gepicktOp || '') >= String(b.gepicktOp || '') ? a : b
}

export function nieuwPickrapportId() {
  return doc(collection(db, 'pickrapporten')).id
}

// Eén document per pickronde. Een bestaande id (zelfde ronde op de telefoon,
// of een correctie op de pc) werkt hetzelfde rapport bij.
export async function slaPickrapportOp(rapport) {
  const id = rapport.id || nieuwPickrapportId()
  const op = { ...rapport, id }
  await setDoc(doc(db, 'pickrapporten', id), op)
  return op
}

// Alleen bijwerken als dit rapport nog de kopie van deze klant op dit apparaat is.
export function werkPickrapportLokaalBij(rapport) {
  const lokaal = leesPickrapportLokaal(rapport.klantId)
  if (!lokaal || lokaal.id === rapport.id || String(rapport.gepicktOp || '') >= String(lokaal.gepicktOp || '')) {
    schrijfPickrapportLokaal(rapport)
  }
}

// Locatie en gepikt aantal op een opgeslagen regel. Minder dan de verdeling
// gaat ook naar de inpaklijst; meer blijft op het rapport.
export function pasRapportRegel(regel, { aantal, locatieCode } = {}) {
  const oud = Number(regel.aantal) || 0
  const nieuw = Math.max(0, Number(aantal ?? oud) || 0)
  const locatie = locatieCode != null ? String(locatieCode).trim() : regel.locatieCode || ''
  const verdelingSom = (regel.verdeling || []).reduce((som, v) => som + (Number(v.aantal) || 0), 0)
  const verdeling =
    nieuw + 1e-9 >= verdelingSom ? regel.verdeling || [] : schaalVerdeling(regel.verdeling, nieuw)
  const voorraadBekend = Number.isFinite(Number(regel.blijft))
  const voorraad = voorraadBekend ? Number(regel.blijft) + oud : null
  const aantalGewijzigd = Math.abs(nieuw - oud) > 1e-9
  return {
    ...regel,
    locatieCode: locatie,
    aantal: nieuw,
    verdeling,
    blijft: !aantalGewijzigd || voorraad == null ? regel.blijft : Math.max(0, rond3(voorraad - nieuw)),
  }
}

export function pasRapportTekort(tekort, aantal) {
  return { ...tekort, tekort: Math.max(0, Number(aantal) || 0) }
}

async function rapportenVanKlant(klantId) {
  const snap = await getDocs(query(collection(db, 'pickrapporten'), where('klantId', '==', klantId)))
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => String(b.gepicktOp || '').localeCompare(String(a.gepicktOp || '')))
}

export async function laadPickrapportOpId(id) {
  const snap = await getDoc(doc(db, 'pickrapporten', id))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() }
}

// Het laatste rapport van deze klant: daar pakt de inpaklijst de regels van.
// Oudere rondes blijven apart staan.
export async function laadPickrapport(klantId) {
  let opgeslagen = null
  try {
    const lijst = await rapportenVanKlant(klantId)
    opgeslagen = lijst[0] || null
  } catch {
    opgeslagen = null
  }
  return nieuwer(opgeslagen, leesPickrapportLokaal(klantId))
}

import { doc, getDoc, setDoc } from 'firebase/firestore'
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
    eenheid: p.eenheid || '',
    blijft: blijftLiggen(p),
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

export async function slaPickrapportOp(rapport) {
  await setDoc(doc(db, 'pickrapporten', rapport.klantId), rapport)
}

// Firestore zodat de pc het rapport kan afdrukken; anders de kopie op dit apparaat.
export async function laadPickrapport(klantId) {
  let opgeslagen = null
  try {
    const snap = await getDoc(doc(db, 'pickrapporten', klantId))
    if (snap.exists()) opgeslagen = { id: snap.id, ...snap.data() }
  } catch {
    opgeslagen = null
  }
  return nieuwer(opgeslagen, leesPickrapportLokaal(klantId))
}

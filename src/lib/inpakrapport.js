import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'

const SLEUTEL = (klantId) => `inpakrapport-${klantId}`
const VOORTGANG = (klantId) => `inpakken-${klantId}`

export function leesAantal(waarde) {
  const n = Number(String(waarde ?? '').trim().replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

export function toegewezenAantal(verdeling, sleutel) {
  return (verdeling || [])
    .filter((v) => v.sleutel === sleutel)
    .reduce((som, v) => som + (Number(v.aantal) || 0), 0)
}

export function restAantal(lijn, verdeling) {
  return Math.max(0, (Number(lijn?.aantal) || 0) - toegewezenAantal(verdeling, lijn?.sleutel))
}

export function leesInpakvoortgang(klantId) {
  try {
    const raw = sessionStorage.getItem(VOORTGANG(klantId))
    if (!raw) return { index: 0, verdeling: [], doos: '1' }
    const data = JSON.parse(raw)
    return {
      index: Number.isInteger(data.index) && data.index >= 0 ? data.index : 0,
      verdeling: Array.isArray(data.verdeling) ? data.verdeling : [],
      doos: String(data.doos || '1'),
    }
  } catch {
    return { index: 0, verdeling: [], doos: '1' }
  }
}

export function schrijfInpakvoortgang(klantId, voortgang) {
  try {
    sessionStorage.setItem(VOORTGANG(klantId), JSON.stringify(voortgang))
  } catch {
    // De loop gaat door; het rapport gaat bij afronden naar Firestore.
  }
}

export function bouwInpakrapport({ klant, lijnen, verdeling, gebruiker }) {
  const perSleutel = Object.fromEntries((lijnen || []).map((l) => [l.sleutel, l]))
  const regels = (verdeling || [])
    .map((v) => {
      const lijn = perSleutel[v.sleutel]
      const aantal = Number(v.aantal) || 0
      const doos = String(v.doos || '').trim()
      if (!lijn || !doos || aantal <= 0) return null
      return {
        doos,
        ordernummer: lijn.ordernummer || '',
        orderId: lijn.orderId || '',
        regelnummer: lijn.regelnummer ?? '',
        artikelnummer: lijn.artikelnummer || '',
        artikelnaam: lijn.artikelnaam || '',
        eenheid: lijn.eenheid || '',
        aantal,
      }
    })
    .filter(Boolean)

  return {
    klantId: klant.id,
    klantcode: klant.klantcode || '',
    klantNaam: klant.naam || '',
    gebruiker: gebruiker || '',
    ingepaktOp: new Date().toISOString(),
    regels,
  }
}

export function dozenVanRapport(regels) {
  const dozen = new Map()
  for (const r of regels || []) {
    if (!dozen.has(r.doos)) dozen.set(r.doos, new Map())
    const perRegel = dozen.get(r.doos)
    const sleutel = [r.orderId, r.regelnummer, r.artikelnummer].join('|')
    const bestaand = perRegel.get(sleutel)
    if (bestaand) bestaand.aantal += Number(r.aantal) || 0
    else perRegel.set(sleutel, { ...r, aantal: Number(r.aantal) || 0 })
  }
  return [...dozen.entries()]
    .sort(([a], [b]) => String(a).localeCompare(String(b), 'nl', { numeric: true }))
    .map(([doos, perRegel]) => [doos, [...perRegel.values()]])
}

export function schrijfInpakrapportLokaal(rapport) {
  try {
    sessionStorage.setItem(SLEUTEL(rapport.klantId), JSON.stringify(rapport))
  } catch {
    // Firestore is de kopie voor de pc.
  }
}

export function leesInpakrapportLokaal(klantId) {
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
  const tijdA = a.ingepaktOp || ''
  const tijdB = b.ingepaktOp || ''
  return String(tijdA) >= String(tijdB) ? a : b
}

export async function slaInpakrapportOp(rapport) {
  await setDoc(doc(db, 'inpakrapporten', rapport.klantId), rapport)
}

export async function laadInpakrapport(klantId) {
  let opgeslagen = null
  try {
    const snap = await getDoc(doc(db, 'inpakrapporten', klantId))
    if (snap.exists()) opgeslagen = { id: snap.id, ...snap.data() }
  } catch {
    opgeslagen = null
  }
  return nieuwer(opgeslagen, leesInpakrapportLokaal(klantId))
}

import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'

// Looproute: afstanden tussen vloerzones.
// Locatiecode bijv. 1541-8 → zone "15" (vloer). De laatste twee cijfers (41)
// en het deel na de streep zijn hoogte / palletpositie — niet relevant voor lopen.
// Document: looproute/matrix
//   { startZone, afstanden: { "15|16": meters } }
const MATRIX_REF = () => doc(db, 'looproute', 'matrix')

/** Eerste twee cijfers van de locatiecode = positie op de vloer (altijd 2 tekens, bijv. 01). */
export function vloerZone(codeOfLocatie) {
  const raw = typeof codeOfLocatie === 'object' ? codeOfLocatie?.code : codeOfLocatie
  const cijfers = String(raw || '').replace(/\D/g, '')
  if (cijfers.length < 2) return ''
  return cijfers.slice(0, 2)
}

// Alleen deze vloerposities horen in de looproute-matrix / pick-sorteerlogica.
// Overige locaties (andere eerste twee cijfers) worden genegeerd voor afstanden.
export const LOOPROUTE_VLOERPOSITIES = [
  '01',
  '11',
  '12',
  '13',
  '14',
  '15',
  '16',
  '17',
  '31',
  '32',
  '21',
  '22',
  '23',
  '19',
  '20',
  '24',
  '25',
  '51',
  '52',
]

const LOOPROUTE_VLOER_SET = new Set(LOOPROUTE_VLOERPOSITIES)

export function isLooprouteVloerpositie(codeOfZone) {
  const z = typeof codeOfZone === 'object' ? vloerZone(codeOfZone) : String(codeOfZone || '').padStart(2, '0').slice(0, 2)
  const genormaliseerd = String(z || '').replace(/\D/g, '').padStart(2, '0').slice(-2)
  return LOOPROUTE_VLOER_SET.has(genormaliseerd)
}

export function afstandSleutel(zoneA, zoneB) {
  const a = String(zoneA || '')
  const b = String(zoneB || '')
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

function isZoneSleutel(sleutel) {
  // Alleen "15|16" tussen toegestane vloerposities.
  const m = /^(\d{2})\|(\d{2})$/.exec(String(sleutel || ''))
  if (!m) return false
  return isLooprouteVloerpositie(m[1]) && isLooprouteVloerpositie(m[2])
}

export async function laadLooproute() {
  try {
    const snap = await getDoc(MATRIX_REF())
    if (!snap.exists()) return { startZone: '', afstanden: {} }
    const d = snap.data() || {}
    const raw = d.afstanden && typeof d.afstanden === 'object' ? d.afstanden : {}
    // Oude sleutels op locatie-id negeren; alleen zone-paren houden.
    const afstanden = {}
    for (const [k, v] of Object.entries(raw)) {
      if (isZoneSleutel(k)) afstanden[k] = v
    }
    return {
      startZone: String(d.startZone || '')
        .replace(/\D/g, '')
        .slice(0, 2),
      afstanden,
    }
  } catch (e) {
    console.warn('Looproute niet leesbaar, val terug op zone/sorteercode:', e.message)
    return { startZone: '', afstanden: {} }
  }
}

export async function bewaarLooproute({ startZone, afstanden }) {
  const schoon = {}
  for (const [k, v] of Object.entries(afstanden || {})) {
    if (isZoneSleutel(k)) schoon[k] = Number(v)
  }
  await setDoc(
    MATRIX_REF(),
    {
      startZone: String(startZone || '').replace(/\D/g, '').slice(0, 2),
      afstanden: schoon,
      bijgewerktOp: new Date().toISOString(),
    },
    { merge: true }
  )
}

export function leesAfstand(afstanden, zoneA, zoneB) {
  if (!zoneA || !zoneB) return null
  if (zoneA === zoneB) return 0
  const v = afstanden?.[afstandSleutel(zoneA, zoneB)]
  return v == null || v === '' ? null : Number(v)
}

/** Vaste vloerposities voor de looproute-matrix (niet alle locatiecodes). */
export function uniekeVloerZones(_locaties) {
  return [...LOOPROUTE_VLOERPOSITIES]
}

export function looprouteMatrixPosities() {
  return [...LOOPROUTE_VLOERPOSITIES]
}

/**
 * Complete ongerichte matrix: elk uniek zonepaar krijgt een sleutel.
 * Bestaande waarden blijven; ontbrekende paren krijgen `leeg` (null) of
 * een voorstel op basis van |zoneA − zoneB| × meterPerStap.
 */
export function completeZoneMatrix(zones, bestaande = {}, { voorstel = false, meterPerStap = 1 } = {}) {
  const gesorteerd = [...new Set((zones || []).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'nl', { numeric: true })
  )
  const matrix = {}
  for (let i = 0; i < gesorteerd.length; i++) {
    for (let j = i + 1; j < gesorteerd.length; j++) {
      const a = gesorteerd[i]
      const b = gesorteerd[j]
      const key = afstandSleutel(a, b)
      if (bestaande[key] != null && bestaande[key] !== '') {
        matrix[key] = Number(bestaande[key])
      } else if (voorstel) {
        const d = Math.abs(Number(a) - Number(b))
        matrix[key] = (Number.isFinite(d) ? d : 1) * meterPerStap
      } else {
        matrix[key] = bestaande[key] ?? ''
      }
    }
  }
  return matrix
}

/** Aantal ingevulde paren vs totaal mogelijke paren. */
export function matrixStatus(zones, afstanden) {
  const n = (zones || []).length
  const totaal = n < 2 ? 0 : (n * (n - 1)) / 2
  let ingevuld = 0
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const v = afstanden?.[afstandSleutel(zones[i], zones[j])]
      if (v != null && v !== '' && Number.isFinite(Number(v))) ingevuld += 1
    }
  }
  return { ingevuld, totaal }
}

// Nearest-neighbour over vloerzones; daarna picks binnen een zone op volle code.
export function sorteerLocatieIdsOpLooproute(locatieIds, { locatiesById, afstanden, startZone } = {}) {
  const uniek = [...new Set(locatieIds.filter(Boolean))]
  if (uniek.length <= 1) return uniek

  const meta = (id) => locatiesById?.[id] || {}
  const zoneVan = (id) => vloerZone(meta(id).code) || ''

  // Alleen toegestane vloerposities meenemen in de loop; overige achteraan.
  const zonesInPick = [
    ...new Set(uniek.map(zoneVan).filter((z) => z && isLooprouteVloerpositie(z))),
  ]
  const zoneAfstand = (a, b) => {
    const m = leesAfstand(afstanden, a, b)
    if (m != null && Number.isFinite(m) && m >= 0) return m
    const na = Number(a)
    const nb = Number(b)
    if (Number.isFinite(na) && Number.isFinite(nb)) return Math.abs(na - nb)
    return 1_000_000
  }

  let zoneRoute = []
  if (zonesInPick.length <= 1) {
    zoneRoute = zonesInPick
  } else {
    let huidig =
      startZone && zonesInPick.includes(startZone)
        ? startZone
        : [...zonesInPick].sort(
            (a, b) =>
              LOOPROUTE_VLOERPOSITIES.indexOf(a) - LOOPROUTE_VLOERPOSITIES.indexOf(b) ||
              a.localeCompare(b, 'nl', { numeric: true })
          )[0]
    zoneRoute = [huidig]
    const rest = new Set(zonesInPick.filter((z) => z !== huidig))
    while (rest.size > 0) {
      let beste = null
      let besteAfstand = Infinity
      for (const kandidaat of rest) {
        const d = zoneAfstand(huidig, kandidaat)
        if (beste == null || d < besteAfstand || (d === besteAfstand && kandidaat < beste)) {
          besteAfstand = d
          beste = kandidaat
        }
      }
      zoneRoute.push(beste)
      rest.delete(beste)
      huidig = beste
    }
  }

  const zoneIndex = Object.fromEntries(zoneRoute.map((z, i) => [z, i]))

  return [...uniek].sort((a, b) => {
    const za = zoneVan(a)
    const zb = zoneVan(b)
    const aIn = isLooprouteVloerpositie(za)
    const bIn = isLooprouteVloerpositie(zb)
    if (aIn !== bIn) return aIn ? -1 : 1
    const ia = aIn ? zoneIndex[za] ?? Infinity : Infinity
    const ib = bIn ? zoneIndex[zb] ?? Infinity : Infinity
    if (ia !== ib) return ia - ib
    const sa = Number(meta(a).sorteercode) || Infinity
    const sb = Number(meta(b).sorteercode) || Infinity
    return (
      sa - sb ||
      String(meta(a).code || a).localeCompare(String(meta(b).code || b), 'nl', { numeric: true })
    )
  })
}

export function sorteerPicksOpLooproute(picks, opties) {
  const volgorde = sorteerLocatieIdsOpLooproute(
    picks.map((p) => p.locatieId),
    opties
  )
  const index = Object.fromEntries(volgorde.map((id, i) => [id, i]))
  return [...picks].sort(
    (a, b) =>
      (index[a.locatieId] ?? Infinity) - (index[b.locatieId] ?? Infinity) ||
      String(a.locatieCode).localeCompare(String(b.locatieCode), 'nl', { numeric: true }) ||
      String(a.artikelnummer).localeCompare(String(b.artikelnummer), 'nl', { numeric: true }) ||
      String(a.ordernummer || '').localeCompare(String(b.ordernummer || ''), 'nl', { numeric: true }) ||
      (a.regelnummer || 0) - (b.regelnummer || 0)
  )
}

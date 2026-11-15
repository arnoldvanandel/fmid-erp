// Materiaalprijs per stuk uit stafmateriaal: soort, vorm en maat van de staf,
// de lengte van het product plus de toeslag op de lengte (zaagsnede,
// afsteken, vlakken), de prijs per kg of per meter en de toeslag op de prijs.

// Soortelijk gewicht in kg/dm³ (= gram per cm³).
export const MATERIALEN = {
  staal: { label: 'Staal', dichtheid: 7.85 },
  rvs: { label: 'RVS', dichtheid: 7.93 },
  messing: { label: 'Messing', dichtheid: 8.5 },
  aluminium: { label: 'Aluminium', dichtheid: 2.7 },
}

// Oppervlak van de doorsnede in mm². `maat` is de diameter (rond) of de
// sleutelwijdte, de maat tussen twee platte zijden (zeskant, achtkant, vierkant).
export const VORMEN = {
  rond: {
    label: 'Rond',
    maatLabel: 'Diameter',
    teken: 'Ø',
    oppervlak: (d) => (Math.PI / 4) * d * d,
  },
  zeskant: {
    label: 'Zeskant',
    maatLabel: 'Sleutelwijdte',
    teken: 'SW',
    oppervlak: (s) => (Math.sqrt(3) / 2) * s * s,
  },
  achtkant: {
    label: 'Achtkant',
    maatLabel: 'Sleutelwijdte',
    teken: 'SW',
    oppervlak: (s) => 2 * (Math.SQRT2 - 1) * s * s,
  },
  vierkant: {
    label: 'Vierkant',
    maatLabel: 'Zijde',
    teken: '□',
    oppervlak: (a) => a * a,
  },
}

export const PRIJS_PER = { kg: 'per kg', meter: 'per meter' }

export const LEEG_MATERIAAL = {
  materiaal: 'staal',
  vorm: 'rond',
  maat: '',
  lengte: '',
  lengteToeslag: 3,
  prijsPer: 'kg',
  prijs: '',
  prijsToeslag: 0,
}

function getal(waarde) {
  const n = Number(waarde)
  return Number.isFinite(n) ? n : 0
}

// Alleen de bekende velden, als getallen, zoals we ze bij de kostenregel bewaren.
export function schoonMateriaal(m) {
  const bron = { ...LEEG_MATERIAAL, ...(m || {}) }
  return {
    materiaal: MATERIALEN[bron.materiaal] ? bron.materiaal : 'staal',
    vorm: VORMEN[bron.vorm] ? bron.vorm : 'rond',
    maat: getal(bron.maat),
    lengte: getal(bron.lengte),
    lengteToeslag: getal(bron.lengteToeslag),
    prijsPer: PRIJS_PER[bron.prijsPer] ? bron.prijsPer : 'kg',
    prijs: getal(bron.prijs),
    prijsToeslag: getal(bron.prijsToeslag),
  }
}

// Alle tussenstappen, zodat de calculator ze kan tonen.
export function berekenMateriaal(invoer) {
  const m = schoonMateriaal(invoer)
  const vorm = VORMEN[m.vorm]
  const oppervlak = m.maat > 0 ? vorm.oppervlak(m.maat) : 0 // mm²
  const kgPerMeter = (oppervlak * MATERIALEN[m.materiaal].dichtheid) / 1000
  const zaaglengte = m.lengte + m.lengteToeslag // mm per stuk
  const meters = zaaglengte / 1000
  const kgPerStuk = kgPerMeter * meters
  const prijsPerMeter = m.prijsPer === 'meter' ? m.prijs : m.prijs * kgPerMeter
  const kaal = prijsPerMeter * meters
  const perStuk = kaal * (1 + m.prijsToeslag / 100)

  let ontbreekt = ''
  if (!(m.lengte > 0)) ontbreekt = 'Vul de lengte van het product in.'
  else if (!(m.prijs > 0)) ontbreekt = 'Vul de materiaalprijs in.'
  else if (m.prijsPer === 'kg' && !(m.maat > 0))
    ontbreekt = `Vul de ${vorm.maatLabel.toLowerCase()} in om het gewicht te bepalen.`

  return {
    ...m,
    oppervlak,
    kgPerMeter,
    zaaglengte,
    kgPerStuk,
    prijsPerMeter,
    kaal,
    perStuk,
    ontbreekt,
  }
}

// "RVS rond Ø25 × 183 mm" voor de omschrijving van de kostenregel.
export function materiaalOmschrijving(invoer) {
  const m = schoonMateriaal(invoer)
  const vorm = VORMEN[m.vorm]
  const maat = m.maat > 0 ? ` ${vorm.teken}${String(m.maat).replace('.', ',')}` : ''
  const lengte = m.lengte > 0 ? ` × ${String(m.lengte + m.lengteToeslag).replace('.', ',')} mm` : ''
  return `${MATERIALEN[m.materiaal].label} ${vorm.label.toLowerCase()}${maat}${lengte}`
}

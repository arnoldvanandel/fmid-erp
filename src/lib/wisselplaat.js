// ISO 1832 (wisselplaten) en ISO 5608 (beitelhouders) ontcijferen, zoals
// WNMG 080408 HCX1125 en MWLNR 2020K 08W. Namen die niet aan de norm voldoen
// (steekplaten, draadsnijplaten) geven alleen de vorm terug.

export const VORMEN = {
  C: { naam: 'Ruit 80°', soort: 'ruit', hoek: 80 },
  D: { naam: 'Ruit 55°', soort: 'ruit', hoek: 55 },
  E: { naam: 'Ruit 75°', soort: 'ruit', hoek: 75 },
  M: { naam: 'Ruit 86°', soort: 'ruit', hoek: 86 },
  V: { naam: 'Ruit 35°', soort: 'ruit', hoek: 35 },
  K: { naam: 'Parallellogram 55°', soort: 'parallel', hoek: 55 },
  W: { naam: 'Trigon 80°', soort: 'trigon', hoek: 80 },
  T: { naam: 'Driehoek 60°', soort: 'veelhoek', hoeken: 3 },
  S: { naam: 'Vierkant 90°', soort: 'veelhoek', hoeken: 4 },
  P: { naam: 'Vijfhoek 108°', soort: 'veelhoek', hoeken: 5 },
  H: { naam: 'Zeshoek 120°', soort: 'veelhoek', hoeken: 6 },
  O: { naam: 'Achthoek 135°', soort: 'veelhoek', hoeken: 8 },
  L: { naam: 'Rechthoek 90°', soort: 'rechthoek' },
  R: { naam: 'Rond', soort: 'rond' },
  DR: { naam: 'Draadsnijplaat', soort: 'draad' },
  ST: { naam: 'Steekplaat', soort: 'steek' },
}

// Draadsnij- en steekplaten hebben geen ISO 1832-code, maar wel herkenbare namen:
// 16ERM 1.50 ISO, 11IRM 19W, DGN 3102C, GDMY 400.
export function plaatFamilie(naam) {
  const ruw = String(naam || '').trim().toUpperCase()
  if (/^\d{2,3}\s*[EI][RL]/.test(ruw) || /^[EI][RL]M?\b/.test(ruw)) return 'DR'
  if (/^(DG[NRL]|GD[A-Z]{2}|GI[PMA]|GF[NF]|TG[PFM]|SG[NT]|MG[MG]|CG[PA])/.test(ruw)) return 'ST'
  return ''
}

export function houderFamilie(naam) {
  const ruw = String(naam || '').trim().toUpperCase()
  if (/^(SI[RL]|SE[RL]|CE[RL]|CI[RL]|TI[RL]|AVR|SHER|SHIR)/.test(ruw)) return 'DR'
  if (/^(DG[TF]|GH[DI]|SGT|CGH|GHSR|GHSL)/.test(ruw)) return 'ST'
  return ''
}

const VRIJLOOP = {
  A: '3°', B: '5°', C: '7°', D: '15°', E: '20°', F: '25°', G: '30°', N: '0°', P: '11°', O: 'bijzonder',
}

const TOLERANTIE = {
  A: 'zeer nauw', F: 'zeer nauw', C: 'nauw', H: 'nauw', E: 'nauw', G: 'nauw',
  J: 'middel', K: 'middel', L: 'middel', M: 'gesinterd (M)', N: 'gesinterd (N)', U: 'gesinterd (U)',
}

const TYPE = {
  A: 'Gat, zonder spaanbreker',
  B: 'Verzonken gat één zijde',
  C: 'Verzonken gat twee zijden',
  F: 'Zonder gat, spaanbreker twee zijden',
  G: 'Gat, spaanbreker twee zijden',
  H: 'Verzonken gat, spaanbreker één zijde',
  J: 'Verzonken gat, spaanbreker twee zijden',
  M: 'Gat, spaanbreker één zijde',
  N: 'Zonder gat, zonder spaanbreker',
  Q: 'Verzonken gat twee zijden',
  R: 'Zonder gat, spaanbreker één zijde',
  T: 'Verzonken gat, spaanbreker één zijde',
  U: 'Verzonken gat, spaanbreker twee zijden',
  W: 'Verzonken gat één zijde',
  X: 'Bijzonder ontwerp',
}

const MET_GAT = new Set(['A', 'B', 'C', 'G', 'H', 'J', 'M', 'Q', 'T', 'U', 'W'])

const DIKTE = {
  T0: 1.02, '01': 1.59, T1: 1.98, '02': 2.38, '03': 3.17,
  T3: 3.97, '04': 4.76, '05': 5.56, '06': 6.35, '07': 7.94,
  '08': 8.69, '09': 9.52, '11': 11.11, '12': 12.7,
}

const PLAAT_PATROON = /^([A-Z])([A-Z])([A-Z])([A-Z])\s*-?\s*(\d{2})\s*(T\d|\d{2})\s*(\d{2}|M0)\s*(.*)$/

export function ontcijferPlaat(naam) {
  const ruw = String(naam || '').trim().toUpperCase()
  const match = ruw.match(PLAAT_PATROON)
  if (!match || !VORMEN[match[1]]) {
    const familie = plaatFamilie(ruw)
    return { iso: false, vorm: familie, metGat: familie !== 'ST', delen: [] }
  }
  const [, vorm, vrijloop, tolerantie, type, lengte, dikte, radius, rest] = match
  const radiusMm = radius === 'M0' ? 0 : Number(radius) / 10
  const dikteMm = DIKTE[dikte] ?? null
  const delen = [
    { code: vorm, label: 'Vorm', waarde: VORMEN[vorm].naam },
    { code: vrijloop, label: 'Vrijloophoek', waarde: VRIJLOOP[vrijloop] || '—' },
    { code: tolerantie, label: 'Tolerantie', waarde: TOLERANTIE[tolerantie] || tolerantie },
    { code: type, label: 'Bevestiging', waarde: TYPE[type] || '—' },
    { code: lengte, label: 'Snijkant', waarde: `${Number(lengte)} mm` },
    { code: dikte, label: 'Dikte', waarde: dikteMm ? `${String(dikteMm).replace('.', ',')} mm` : '—' },
    { code: radius, label: 'Hoekradius', waarde: radiusMm ? `${String(radiusMm).replace('.', ',')} mm` : 'scherp' },
  ]
  const kwaliteit = rest.trim()
  if (kwaliteit) delen.push({ code: kwaliteit, label: 'Breker / kwaliteit', waarde: 'fabrikant' })
  return {
    iso: true,
    vorm,
    metGat: MET_GAT.has(type),
    snijkant: Number(lengte),
    dikte: dikteMm,
    radius: radiusMm,
    delen,
  }
}

const KLEMMING = {
  C: 'Klem van boven',
  D: 'Klem boven + gat',
  M: 'Klem boven + pen',
  P: 'Hefboom door gat',
  S: 'Schroef door gat',
}

const INSTELHOEK = {
  A: '90° recht', B: '75°', C: '90° voorzijde', D: '45°', E: '60°', F: '90° voorzijde',
  G: '90° verzet', H: '107,5°', J: '93°', K: '75° voorzijde', L: '95°', M: '50°',
  N: '63°', P: '117,5°', Q: '107,5°', R: '75°', S: '45°', T: '60°', U: '93°',
  V: '72,5°', W: '60° voorzijde', Y: '85°',
}

const HAND = { R: 'Rechts', L: 'Links', N: 'Neutraal' }

const LENGTE = {
  A: 32, B: 40, C: 50, D: 60, E: 70, F: 80, G: 90, H: 100, J: 110, K: 125, L: 140,
  M: 150, N: 160, P: 170, Q: 180, R: 200, S: 250, T: 300, U: 350, V: 400, W: 450,
}

const HOUDER_PATROON = /^([CDMPS])([A-Z])([A-Z])([A-Z])([RLN])\s*(\d{2})(\d{2})\s*([A-Z])\s*(\d{2})/

export function ontcijferHouder(naam) {
  const ruw = String(naam || '').trim().toUpperCase()
  const match = ruw.match(HOUDER_PATROON)
  if (!match || !VORMEN[match[2]]) return { iso: false, vorm: '', delen: [] }
  const [, klem, vorm, stijl, vrijloop, hand, hoogte, breedte, lengte, snijkant] = match
  return {
    iso: true,
    vorm,
    delen: [
      { code: klem, label: 'Klemming', waarde: KLEMMING[klem] || '—' },
      { code: vorm, label: 'Plaatvorm', waarde: VORMEN[vorm].naam },
      { code: stijl, label: 'Instelhoek', waarde: INSTELHOEK[stijl] || '—' },
      { code: vrijloop, label: 'Vrijloop plaat', waarde: VRIJLOOP[vrijloop] || '—' },
      { code: hand, label: 'Uitvoering', waarde: HAND[hand] },
      { code: `${hoogte}${breedte}`, label: 'Schacht', waarde: `${Number(hoogte)} × ${Number(breedte)} mm` },
      { code: lengte, label: 'Lengte', waarde: LENGTE[lengte] ? `${LENGTE[lengte]} mm` : '—' },
      { code: snijkant, label: 'Snijkant', waarde: `${Number(snijkant)} mm` },
    ],
  }
}

// Hoekpunten van de plaatvorm rond (0,0), grootste maat ongeveer 2.
function hoekpunten(vorm) {
  const info = VORMEN[vorm]
  if (!info) return null
  const rad = (graden) => (graden * Math.PI) / 180
  if (info.soort === 'ruit') {
    const half = rad(info.hoek / 2)
    const lang = Math.cos(half)
    const kort = Math.sin(half)
    const schaal = 1 / Math.max(lang, kort)
    return [[-lang * schaal, 0], [0, -kort * schaal], [lang * schaal, 0], [0, kort * schaal]]
  }
  if (info.soort === 'parallel') {
    const dx = Math.cos(rad(info.hoek)) * 0.9
    return [[-1 + dx / 2, -0.45], [1 + dx / 2, -0.45], [1 - dx / 2, 0.45], [-1 - dx / 2, 0.45]].map(([x, y]) => [x * 0.85, y * 1.4])
  }
  if (info.soort === 'trigon') {
    const tip = 1
    const binnen = (tip * Math.tan(rad(40))) / (Math.cos(rad(30)) + Math.tan(rad(40)) / 2)
    const punten = []
    for (let i = 0; i < 6; i += 1) {
      const hoek = rad(-90 + i * 60)
      const straal = i % 2 === 0 ? tip : binnen
      punten.push([Math.cos(hoek) * straal, Math.sin(hoek) * straal + 0.12])
    }
    return punten
  }
  if (info.soort === 'veelhoek') {
    const punten = []
    for (let i = 0; i < info.hoeken; i += 1) {
      const hoek = rad(-90 + (i * 360) / info.hoeken + (info.hoeken === 4 ? 45 : 0))
      punten.push([Math.cos(hoek), Math.sin(hoek) + (info.hoeken === 3 ? 0.22 : 0)])
    }
    return punten
  }
  if (info.soort === 'rechthoek') return [[-1, -0.55], [1, -0.55], [1, 0.55], [-1, 0.55]]
  if (info.soort === 'draad') {
    // Driehoek met aan elke punt een smalle 60°-tand voor het draadprofiel.
    const punten = []
    for (let i = 0; i < 3; i += 1) {
      const tip = rad(-90 + i * 120)
      const zij = (graden) => rad(-90 + i * 120 + graden)
      punten.push([Math.cos(zij(-20)) * 0.78, Math.sin(zij(-20)) * 0.78 + 0.2])
      punten.push([Math.cos(tip) * 1.08, Math.sin(tip) * 1.08 + 0.2])
      punten.push([Math.cos(zij(20)) * 0.78, Math.sin(zij(20)) * 0.78 + 0.2])
    }
    return punten
  }
  if (info.soort === 'steek') {
    return [
      [-1.2, -0.22], [-1.0, -0.36], [-0.42, -0.36], [-0.26, -0.24],
      [0.26, -0.24], [0.42, -0.36], [1.0, -0.36], [1.2, -0.22],
      [1.2, 0.22], [1.0, 0.36], [0.42, 0.36], [0.26, 0.24],
      [-0.26, 0.24], [-0.42, 0.36], [-1.0, 0.36], [-1.2, 0.22],
    ]
  }
  return null
}

// SVG-pad met afgeronde hoeken; `afronding` is een fractie van de kortste zijde.
export function plaatPad(vorm, afronding = 0.08) {
  const punten = hoekpunten(vorm)
  if (!punten) return null
  const n = punten.length
  const stukken = []
  for (let i = 0; i < n; i += 1) {
    const [px, py] = punten[(i - 1 + n) % n]
    const [cx, cy] = punten[i]
    const [nx, ny] = punten[(i + 1) % n]
    const lengteIn = Math.hypot(cx - px, cy - py)
    const lengteUit = Math.hypot(nx - cx, ny - cy)
    const knip = Math.min(afronding, lengteIn / 2.5, lengteUit / 2.5)
    const inX = cx - ((cx - px) / lengteIn) * knip
    const inY = cy - ((cy - py) / lengteIn) * knip
    const uitX = cx + ((nx - cx) / lengteUit) * knip
    const uitY = cy + ((ny - cy) / lengteUit) * knip
    stukken.push(`${i === 0 ? 'M' : 'L'}${inX.toFixed(4)},${inY.toFixed(4)}`)
    stukken.push(`Q${cx.toFixed(4)},${cy.toFixed(4)} ${uitX.toFixed(4)},${uitY.toFixed(4)}`)
  }
  return `${stukken.join(' ')} Z`
}

export function plaatSleutel(naam) {
  return String(naam || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

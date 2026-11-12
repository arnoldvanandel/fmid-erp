import { evalueerAantal } from './magazijnInvoer'

export function rond3(n) {
  return Math.round((Number(n) || 0) * 1000) / 1000
}

// Leeg is 0. Een formule zoals 2x10 telt mee; ongeldige tekst is null.
export function leesAantal(waarde) {
  if (waarde == null) return 0
  const tekst = String(waarde).trim()
  if (!tekst) return 0
  const n = evalueerAantal(tekst)
  return Number.isFinite(n) ? rond3(n) : null
}

export function invoerVan(n) {
  if (!Number.isFinite(Number(n))) return ''
  const x = rond3(n)
  if (Math.abs(x) < 1e-9) return '0'
  return String(x).replace('.', ',')
}

// Hoeveel volle dozen, zakjes en losse stuks in een aantal zitten.
// Zonder verpakking is er niets te splitsen.
export function verpakkingVanAantal(aantal, doos, zak) {
  const totaal = rond3(Math.max(0, Number(aantal) || 0))
  const perDoos = Number(doos) > 1 ? Number(doos) : 0
  const perZak = Number(zak) > 1 ? Number(zak) : 0
  if (!perDoos && !perZak) return null
  let rest = totaal
  let dozen = 0
  let zakjes = 0
  if (perDoos) {
    dozen = Math.floor(rest / perDoos)
    rest = rond3(rest - dozen * perDoos)
  }
  if (perZak) {
    zakjes = Math.floor(rest / perZak + 1e-9)
    rest = rond3(rest - zakjes * perZak)
  }
  return { dozen, zakjes, los: rest, totaal }
}

export function verpakkingTekst(v) {
  if (!v) return ''
  const delen = []
  if (v.dozen) delen.push(`${v.dozen} ${v.dozen === 1 ? 'doos' : 'dozen'}`)
  if (v.zakjes) delen.push(`${v.zakjes} ${v.zakjes === 1 ? 'zakje' : 'zakjes'}`)
  if (v.los) delen.push(`${String(rond3(v.los)).replace('.', ',')} los`)
  if (!delen.length) return ''
  return delen.join(', ')
}

// Naar boven afronden op hele zakjes, zodat er geen aangebroken zak gepakt wordt.
export function rondOpNaarZakjes(aantal, stuksPerZak) {
  const n = rond3(Math.max(0, Number(aantal) || 0))
  const zak = Number(stuksPerZak) || 0
  if (zak <= 1 || n === 0) return n
  return rond3(Math.ceil(n / zak - 1e-9) * zak)
}

// Wat er nog uit Bonfix moet nadat er een aantal ANBO is gepakt.
// voorgesteld is de rest, naar boven afgerond op hele Bonfix-zakjes.
export function bonfixTePakken(totaalOpen, anboGepakt, stuksPerZak) {
  const exact = rond3(Math.max(0, (Number(totaalOpen) || 0) - (Number(anboGepakt) || 0)))
  return { exact, voorgesteld: rondOpNaarZakjes(exact, stuksPerZak) }
}

export function anboLocaties(stap) {
  return (stap?.locaties || []).filter((l) => !l.isBonfix)
}

export function bonfixLocaties(stap) {
  return (stap?.locaties || []).filter((l) => l.isBonfix)
}

export function somInvoer(locaties, waarden) {
  return rond3((locaties || []).reduce((s, l) => s + (leesAantal(waarden?.[l.sleutel]) || 0), 0))
}

function stukkenVan(p) {
  if (Array.isArray(p.verdeling) && p.verdeling.length) return p.verdeling
  if (!p.regelId && !p.ordernummer) return []
  return [
    {
      orderId: p.orderId || '',
      ordernummer: p.ordernummer || '',
      regelId: p.regelId || '',
      regelnummer: p.regelnummer ?? '',
      aantal: Number(p.aantal) || 0,
    },
  ]
}

function voegOrder(stap, nummer) {
  if (nummer && !stap.ordernummers.includes(nummer)) stap.ordernummers.push(nummer)
}

function leegVraag(v) {
  return {
    orderId: v.orderId || '',
    ordernummer: v.ordernummer || '',
    regelId: v.regelId || '',
    regelnummer: v.regelnummer ?? '',
    aantal: 0,
    tekort: 0,
    vast: false,
  }
}

function voegVraag(stap, v) {
  const id = String(v.regelId || `${v.ordernummer || ''}-${v.regelnummer ?? ''}`)
  const best = stap.vraagMap.get(id) || leegVraag(v)
  if (!best.vast) best.aantal = rond3(best.aantal + (Number(v.aantal) || 0))
  voegOrder(stap, v.ordernummer)
  stap.vraagMap.set(id, best)
}

function voegTekort(stap, t) {
  const id = String(t.regelId || `${t.ordernummer || ''}-${t.regelnummer ?? ''}`)
  const best = stap.vraagMap.get(id) || leegVraag(t)
  best.aantal = rond3(Number(t.nodig) || best.aantal)
  best.tekort = rond3(Number(t.tekort) || 0)
  best.vast = true
  if (t.artikelnaam && !stap.artikelnaam) stap.artikelnaam = t.artikelnaam
  if (t.eenheid && !stap.eenheid) stap.eenheid = t.eenheid
  voegOrder(stap, t.ordernummer)
  stap.vraagMap.set(id, best)
}

function afrondStap(stap) {
  const vraag = [...stap.vraagMap.values()].map(({ vast, ...v }) => v)
  const locaties = [...stap.locaties].sort((a, b) => Number(a.isBonfix) - Number(b.isBonfix))
  const totaalOpen = rond3(vraag.reduce((s, v) => s + (Number(v.aantal) || 0), 0))
  const tekort = rond3(vraag.reduce((s, v) => s + (Number(v.tekort) || 0), 0))
  const { vraagMap, ...rest } = stap
  return { ...rest, vraag, locaties, totaalOpen, tekort }
}

function legeStap(key, bron) {
  return {
    sleutel: key,
    artikelId: bron.artikelId || '',
    artikelnummer: bron.artikelnummer || '',
    artikelnaam: bron.artikelnaam || '',
    eenheid: bron.eenheid || '',
    stuksPerDoos: 0,
    stuksPerZak: 0,
    ordernummers: [],
    vraagMap: new Map(),
    locaties: [],
  }
}

// Eén scherm per verkoopartikel: alle locaties, inclusief het Bonfix-vervangende artikel.
// De volgorde blijft de looproute (eerste locatie die we tegenkomen).
export function groepeerPickstappen(picks, tekorten = []) {
  const groepen = new Map()
  const volgorde = []

  for (const p of picks || []) {
    const key = String(p.omboekenNaarId || p.artikelId || p.artikelnummer || '')
    if (!key) continue
    if (!groepen.has(key)) {
      volgorde.push(key)
      groepen.set(
        key,
        legeStap(key, {
          artikelId: p.omboekenNaarId || p.artikelId || '',
          artikelnummer: p.vervangt || p.artikelnummer || '',
          artikelnaam: p.vervangt ? '' : p.artikelnaam || '',
          eenheid: p.eenheid || '',
        })
      )
    }
    const stap = groepen.get(key)
    if (!p.vervangt && p.artikelnaam) stap.artikelnaam = p.artikelnaam
    else if (!stap.artikelnaam && p.artikelnaam) stap.artikelnaam = p.artikelnaam
    if (!p.vervangt && (Number(p.stuksPerDoos) > 0 || Number(p.stuksPerZak) > 0)) {
      stap.stuksPerDoos = Number(p.stuksPerDoos) || 0
      stap.stuksPerZak = Number(p.stuksPerZak) || 0
    } else if (!stap.stuksPerDoos && !stap.stuksPerZak) {
      stap.stuksPerDoos = Number(p.stuksPerDoos) || 0
      stap.stuksPerZak = Number(p.stuksPerZak) || 0
    }
    if (p.eenheid && !stap.eenheid) stap.eenheid = p.eenheid
    for (const nr of p.ordernummers || [p.ordernummer]) voegOrder(stap, nr)
    for (const v of stukkenVan(p)) voegVraag(stap, v)

    const locSleutel = `${p.artikelId || ''}__${p.locatieId || p.locatieCode || ''}`
    const voorraad = Number(p.voorraadOpLocatie ?? p.opLocatie) || 0
    const bestaand = stap.locaties.find((l) => l.sleutel === locSleutel)
    if (bestaand) {
      bestaand.voorgesteld = rond3(bestaand.voorgesteld + (Number(p.aantal) || 0))
      bestaand.voorraad = Math.max(bestaand.voorraad, voorraad)
    } else if (p.locatieId || p.locatieCode) {
      stap.locaties.push({
        sleutel: locSleutel,
        locatieId: p.locatieId || '',
        locatieCode: p.locatieCode || '',
        artikelId: p.artikelId || '',
        artikelnummer: p.artikelnummer || '',
        artikelnaam: p.artikelnaam || '',
        voorraad,
        voorgesteld: Number(p.aantal) || 0,
        isBonfix: Boolean(p.vervangt),
        vervangt: p.vervangt || '',
        omboekenNaarId: p.omboekenNaarId || '',
        stuksPerDoos: Number(p.stuksPerDoos) || 0,
        stuksPerZak: Number(p.stuksPerZak) || 0,
        eenheid: p.eenheid || stap.eenheid || '',
      })
    }
  }

  const gebruikt = new Set()
  for (const t of tekorten || []) {
    const key = String(t.artikelId || t.artikelnummer || '')
    const stap = groepen.get(key)
    if (!stap) continue
    voegTekort(stap, t)
    gebruikt.add(t)
  }

  const tekortVolgorde = []
  const tekortGroepen = new Map()
  for (const t of tekorten || []) {
    if (gebruikt.has(t)) continue
    const key = String(t.artikelId || t.artikelnummer || '')
    if (!key) continue
    if (!tekortGroepen.has(key)) {
      tekortVolgorde.push(key)
      tekortGroepen.set(
        key,
        legeStap(`tekort-${key}`, {
          artikelId: t.artikelId || '',
          artikelnummer: t.artikelnummer || '',
          artikelnaam: t.artikelnaam || '',
          eenheid: t.eenheid || '',
        })
      )
    }
    voegTekort(tekortGroepen.get(key), t)
  }

  return [
    ...volgorde.map((k) => afrondStap(groepen.get(k))),
    ...tekortVolgorde.map((k) => afrondStap(tekortGroepen.get(k))),
  ]
}

export function standaardPickInvoer(stap) {
  const anbo = anboLocaties(stap)
  const bon = bonfixLocaties(stap)
  const anboAantal = rond3(anbo.reduce((s, l) => s + (Number(l.voorgesteld) || 0), 0))
  const bonfixAantal = bon.length ? bonfixTePakken(stap.totaalOpen, anboAantal, bon[0].stuksPerZak || 0).voorgesteld : 0
  const locaties = {}
  for (const l of anbo) locaties[l.sleutel] = invoerVan(l.voorgesteld || 0)
  bon.forEach((l, i) => {
    locaties[l.sleutel] = i === 0 ? invoerVan(bonfixAantal) : ''
  })
  return {
    anboTotaal: invoerVan(anboAantal),
    bonfixTotaal: invoerVan(bonfixAantal),
    locaties,
  }
}

// Bonfix volgt het ANBO-aantal, behalve als dat aantal niet veranderd is
// (dan blijft een handmatige verdeling over Bonfix-locaties staan).
function metBonfix(stap, invoer, anboAantal, locaties) {
  const bon = bonfixLocaties(stap)
  const zelfde = Math.abs((leesAantal(invoer.anboTotaal) || 0) - anboAantal) < 0.001
  if (!bon.length || zelfde) {
    return { ...invoer, anboTotaal: invoerVan(anboAantal), locaties }
  }
  const voorgesteld = bonfixTePakken(stap.totaalOpen, anboAantal, bon[0].stuksPerZak || 0).voorgesteld
  const nieuw = { ...locaties }
  bon.forEach((l, i) => {
    nieuw[l.sleutel] = i === 0 ? invoerVan(voorgesteld) : ''
  })
  return {
    anboTotaal: invoerVan(anboAantal),
    bonfixTotaal: invoerVan(voorgesteld),
    locaties: nieuw,
  }
}

export function pasLocatieInvoer(stap, invoer, locSleutel, waarde) {
  const basis = invoer || standaardPickInvoer(stap)
  const loc = (stap.locaties || []).find((l) => l.sleutel === locSleutel)
  if (!loc) return { ...basis, locaties: { ...basis.locaties, [locSleutel]: waarde } }

  const locs = loc.isBonfix ? bonfixLocaties(stap) : anboLocaties(stap)
  const eerste = locs[0]
  const locaties = { ...basis.locaties, [locSleutel]: waarde }

  // Een andere locatie dan de eerste houdt het totaal gelijk: het verschil
  // gaat van de eerste locatie af, zodat Bonfix niet mee verspringt.
  if (eerste && loc.sleutel !== eerste.sleutel) {
    const totaal = leesAantal(loc.isBonfix ? basis.bonfixTotaal : basis.anboTotaal)
    if (totaal != null) {
      const rest = somInvoer(
        locs.filter((l) => l.sleutel !== eerste.sleutel),
        locaties
      )
      locaties[eerste.sleutel] = invoerVan(rond3(totaal - rest))
    }
    return { ...basis, locaties }
  }

  if (loc.isBonfix) {
    return { ...basis, locaties, bonfixTotaal: invoerVan(somInvoer(locs, locaties)) }
  }
  return metBonfix(stap, basis, somInvoer(locs, locaties), locaties)
}

export function pasTotaalInvoer(stap, invoer, sectie, waarde) {
  const basis = invoer || standaardPickInvoer(stap)
  const n = leesAantal(waarde)
  const locs = sectie === 'bonfix' ? bonfixLocaties(stap) : anboLocaties(stap)
  if (n == null || !locs.length) {
    const veld = sectie === 'bonfix' ? 'bonfixTotaal' : 'anboTotaal'
    return { ...basis, [veld]: waarde }
  }
  const locaties = { ...basis.locaties }
  locs.forEach((l, i) => {
    locaties[l.sleutel] = i === 0 ? invoerVan(n) : ''
  })
  if (sectie === 'bonfix') return { ...basis, bonfixTotaal: invoerVan(n), locaties }
  return metBonfix(stap, basis, n, locaties)
}

export function vulLocatieInvoer(stap, invoer, locSleutel) {
  const basis = invoer || standaardPickInvoer(stap)
  const loc = (stap.locaties || []).find((l) => l.sleutel === locSleutel)
  if (!loc) return basis
  const bon = loc.isBonfix
  const locs = bon ? bonfixLocaties(stap) : anboLocaties(stap)
  const totaal = leesAantal(bon ? basis.bonfixTotaal : basis.anboTotaal) || 0
  const locaties = { ...basis.locaties }
  for (const l of locs) locaties[l.sleutel] = l.sleutel === locSleutel ? invoerVan(totaal) : ''
  if (bon) return { ...basis, locaties, bonfixTotaal: invoerVan(totaal) }
  return metBonfix(stap, basis, totaal, locaties)
}

export function controlePickInvoer(stap, invoer) {
  const basis = invoer || standaardPickInvoer(stap)
  for (const l of stap?.locaties || []) {
    const n = leesAantal(basis.locaties?.[l.sleutel])
    if (n == null) return `Vul een geldig aantal in bij locatie ${l.locatieCode}.`
    if (n < 0) return `Het aantal op ${l.locatieCode} kan niet negatief zijn. Er staat te veel op de andere locaties.`
  }
  return null
}

function verdelingStuk(regel, aantal) {
  return {
    orderId: regel.orderId || '',
    ordernummer: regel.ordernummer || '',
    regelId: regel.regelId || '',
    regelnummer: regel.regelnummer ?? '',
    aantal,
  }
}

// Gepickte aantallen per locatie, met de verdeling over orderregels (nooit meer dan open).
// Tekorten zijn wat er na het picken nog open blijft.
export function picksUitStappen(stappen, bevestigd) {
  const picks = []
  const tekorten = []

  for (const stap of stappen || []) {
    if (!stap.locaties?.length) {
      for (const regel of stap.vraag || []) {
        const tekort = rond3(regel.tekort || regel.aantal)
        if (tekort <= 1e-9) continue
        tekorten.push({
          ordernummer: regel.ordernummer || '',
          regelnummer: regel.regelnummer ?? '',
          artikelnummer: stap.artikelnummer || '',
          artikelnaam: stap.artikelnaam || '',
          tekort,
          nodig: rond3(regel.aantal),
          eenheid: stap.eenheid || '',
        })
      }
      continue
    }

    const invoer = bevestigd?.[stap.sleutel] || standaardPickInvoer(stap)
    const rest = (stap.vraag || []).map((v) => ({ ...v, rest: rond3(v.aantal) }))
    for (const loc of [...anboLocaties(stap), ...bonfixLocaties(stap)]) {
      const gelezen = leesAantal(invoer.locaties?.[loc.sleutel])
      const aantal = rond3(Math.max(0, gelezen || 0))
      let ruimte = aantal
      const verdeling = []
      for (const regel of rest) {
        if (ruimte <= 1e-9) break
        if (regel.rest <= 1e-9) continue
        const pak = rond3(Math.min(regel.rest, ruimte))
        if (pak <= 0) continue
        verdeling.push(verdelingStuk(regel, pak))
        regel.rest = rond3(regel.rest - pak)
        ruimte = rond3(ruimte - pak)
      }
      if (aantal > 1e-9 || Number(loc.voorgesteld) > 1e-9) {
        picks.push({
          locatieCode: loc.locatieCode || '',
          artikelnummer: loc.artikelnummer || stap.artikelnummer || '',
          artikelnaam: loc.artikelnaam || stap.artikelnaam || '',
          aantal,
          gevraagd: Number(loc.voorgesteld) || 0,
          eenheid: loc.eenheid || stap.eenheid || '',
          voorraadOpLocatie: Number(loc.voorraad) || 0,
          opLocatie: Number(loc.voorraad) || 0,
          ordernummers: stap.ordernummers || [],
          vervangt: loc.vervangt || '',
          verdeling,
          totaalOpen: Number(stap.totaalOpen) || 0,
        })
      }
    }
    for (const regel of rest) {
      if (regel.rest <= 1e-9) continue
      tekorten.push({
        ordernummer: regel.ordernummer || '',
        regelnummer: regel.regelnummer ?? '',
        artikelnummer: stap.artikelnummer || '',
        artikelnaam: stap.artikelnaam || '',
        tekort: regel.rest,
        nodig: rond3(regel.aantal),
        eenheid: stap.eenheid || '',
      })
    }
  }

  return { picks, tekorten }
}

// 1111-1 is de verzamellocatie. Die hoort niet als suggestie bij op voorraad zetten.
const VERZAMELCODES = new Set(['1111-1'])

export function isVerzamellocatie(code) {
  const normaal = String(code || '').trim().toUpperCase().replace(/\s+/g, '')
  return VERZAMELCODES.has(normaal)
}

const RECENT = 'fmid-recente-artikelen'

export function leesRecenteArtikelen() {
  try {
    const lijst = JSON.parse(localStorage.getItem(RECENT) || '[]')
    return Array.isArray(lijst) ? lijst.filter((a) => a?.artikelnummer) : []
  } catch {
    return []
  }
}

export function onthoudArtikel(artikel) {
  const nummer = String(artikel?.artikelnummer || '').trim()
  if (!nummer) return
  const item = {
    artikelnummer: nummer,
    artikelnaam: artikel.artikelnaam || artikel.naam || '',
    artikelId: artikel.artikelId || artikel.id || '',
  }
  const lijst = [item, ...leesRecenteArtikelen().filter((a) => a.artikelnummer !== nummer)].slice(0, 8)
  try {
    localStorage.setItem(RECENT, JSON.stringify(lijst))
  } catch {
    // Recent blijven dan alleen in dit scherm.
  }
}

function formuleVan(tekst) {
  return String(tekst ?? '')
    .trim()
    .replace(/,/g, '.')
    .replace(/[xX×]/g, '*')
    .replace(/\s+/g, '')
}

// 80x2, 80*2+20 en 80,5 worden een aantal. Een halve formule (80*) blijft leeg.
export function evalueerAantal(tekst) {
  const t = formuleVan(tekst)
  if (!t) return NaN
  if (!/^[\d+*/().-]+$/.test(t)) return NaN
  if (/^[+*/.]|[+*/.-]$|\*\*|\/\/|\(\)/.test(t)) return NaN
  try {
    const n = Function(`"use strict"; return (${t})`)()
    return typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 1000) / 1000 : NaN
  } catch {
    return NaN
  }
}

export function afrondingAantal(tekst) {
  const n = evalueerAantal(tekst)
  if (!String(tekst ?? '').trim() || !Number.isFinite(n)) return null
  const nieuw = String(n)
  return nieuw === String(tekst).trim() ? null : nieuw
}

export function enterSluitToetsenbord(e) {
  if (e.key !== 'Enter') return
  e.preventDefault()
  e.currentTarget.blur()
}

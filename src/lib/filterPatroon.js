// Filtertekst met * als jokerteken, in de geest van de Axapta-filters.
//   a*       begint met a
//   *a       eindigt op a
//   *a*      bevat a
//   a*-c*    van alles dat met a begint t/m alles dat met c begint
//   a*..c*   hetzelfde bereik, met .. in plaats van een streepje
//   a*,x*    begint met a, of begint met x
// Zonder * zoekt de tekst ergens in de waarde. Hoofdletters maken niet uit.
// Een streepje is alleen een bereik als beide kanten een * hebben, zodat een
// artikelnummer als AB-100 een gewone zoekterm blijft.

export function pastBijPatroon(waarde, invoer) {
  const filter = String(invoer || '').trim().toLowerCase()
  if (!filter) return true
  const delen = filter
    .split(',')
    .map((deel) => deel.trim())
    .filter(Boolean)
  if (delen.length === 0) return true
  const tekst = String(waarde ?? '').trim().toLowerCase()
  return delen.some((deel) => pastBijDeel(tekst, deel))
}

// Waar als minstens één van de waarden bij het filter past (bijv. klantnummer of naam).
export function pastBijEenVan(waarden, invoer) {
  const filter = String(invoer || '').trim()
  if (!filter) return true
  return waarden.some((waarde) => pastBijPatroon(waarde, filter))
}

function pastBijDeel(tekst, deel) {
  const bereik = splitsBereik(deel)
  if (bereik) return inBereik(tekst, bereik.van, bereik.tot)
  if (deel.includes('*')) return glob(tekst, deel)
  return tekst.includes(deel)
}

function splitsBereik(deel) {
  const tekst = deel.replace(/\*\s*-\s*/g, '*-').replace(/\s*\.\.\s*/g, '..')
  const punt = tekst.indexOf('..')
  if (punt >= 0) {
    const van = tekst.slice(0, punt).trim()
    const tot = tekst.slice(punt + 2).trim()
    if (van && tot) return { van, tot }
  }
  const m = tekst.match(/^(.*\*)-(.+)$/)
  if (m && m[2].includes('*')) return { van: m[1].trim(), tot: m[2].trim() }
  return null
}

function inBereik(tekst, van, tot) {
  const onder = ondergrens(van)
  const boven = bovengrens(tot)
  if (tekst < onder) return false
  if (boven.exclusief) return tekst < boven.waarde
  return tekst <= boven.waarde
}

// Begin van een bereik: a* en a betekenen allebei "vanaf a".
function ondergrens(patroon) {
  const ster = patroon.indexOf('*')
  if (ster === -1) return patroon
  return patroon.slice(0, ster)
}

// Eind van een bereik: c* loopt t/m alles dat met c begint, c is precies "c".
function bovengrens(patroon) {
  if (patroon.endsWith('*')) {
    const ster = patroon.indexOf('*')
    return { exclusief: true, waarde: opvolger(patroon.slice(0, ster)) }
  }
  if (!patroon.includes('*')) return { exclusief: false, waarde: patroon }
  return { exclusief: false, waarde: patroon.replaceAll('*', '') }
}

function opvolger(tekst) {
  if (!tekst) return '\uffff'
  const tekens = [...tekst]
  for (let i = tekens.length - 1; i >= 0; i -= 1) {
    const code = tekens[i].codePointAt(0)
    if (code < 0xffff) {
      tekens[i] = String.fromCodePoint(code + 1)
      return tekens.slice(0, i + 1).join('')
    }
  }
  return tekst + '\uffff'
}

function glob(tekst, patroon) {
  const escaped = patroon.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*')
  return new RegExp(`^${escaped}$`).test(tekst)
}

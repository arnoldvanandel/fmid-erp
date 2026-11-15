// Leest het tekeningnummer en de benaming uit het titelblok van een
// klanttekening (PDF met tekstlaag, zoals een export uit CAD). Bij een scan
// zonder tekst blijft alleen de bestandsnaam over. Het resultaat is een
// voorstel: de gebruiker controleert het in het venster Nieuwe calculatie.

const LABEL_BENAMING = /\b(benaming|omschrijving|description|title|titel|bezeichnung|benennung)\b/i
const LABEL_NUMMER =
  /(tek\.?\s*-?\s*n(umme)?r|tekeningn(umme)?r|drawing\s*(no|number|nr)|dwg\.?\s*(no|nr)|zeichnungs?\s*-?\s*n(umme)?r|part\s*(no|number)|artikeln(umme)?r|\bnummer\b)/i

// "022-0012#1 (1).pdf" -> "022-0012#1"; "0130353102-5 REV A.pdf" -> "0130353102-5 REV A"
export function schoonBestandsnaam(bestandsnaam) {
  return String(bestandsnaam || '')
    .replace(/\.pdf$/i, '')
    .replace(/\s*\(\d+\)\s*$/, '')
    .replace(/\s*-\s*(kopie|copy)\s*$/i, '')
    .trim()
}

// Revisie uit "… REV A", "… rev.2" of "nummer#1".
function splitsRevisie(tekst) {
  const t = String(tekst || '').trim()
  let m = t.match(/^(.*?)[\s_-]*\brev(?:isie|ision)?\.?[\s_-]*([A-Za-z0-9]{1,3})$/i)
  if (m && m[1].trim()) return { nummer: m[1].trim(), revisie: m[2].toUpperCase() }
  m = t.match(/^(.+)#([A-Za-z0-9]{1,3})$/)
  if (m) return { nummer: m[1].trim(), revisie: m[2].toUpperCase() }
  return { nummer: t, revisie: '' }
}

function isLabel(tekst) {
  return /:\s*$/.test(tekst) || (LABEL_BENAMING.test(tekst) && tekst.includes(':')) || /^[A-Z.\s]+:$/.test(tekst)
}

// Tekst achter het label in hetzelfde tekstdeel ("BENAMING: Vulbus").
function achterLabel(tekst, patroon) {
  const m = tekst.match(new RegExp(`${patroon.source}[^:]*:\\s*(.+)$`, 'i'))
  const waarde = m?.[m.length - 1]?.trim()
  return waarde && !/:\s*$/.test(waarde) && !/:/.test(waarde) ? waarde : ''
}

// Het dichtstbijzijnde tekstdeel onder (of rechts naast) een label. `y` loopt
// naar beneden op, zoals op het scherm.
function waardeBij(label, items, overslaan) {
  let beste = null
  for (const it of items) {
    if (it === label || overslaan(it)) continue
    const dy = it.y - label.y
    const dx = it.x - label.x
    const onder = dy > 2 && dy < 60 && dx > -15 && dx < 220
    const rechts = Math.abs(dy) <= 2 && dx > 0 && dx < 220
    if (!onder && !rechts) continue
    const afstand = Math.hypot(dx * 0.5, dy) + (rechts ? 0 : 5)
    if (!beste || afstand < beste.afstand) beste = { it, afstand }
  }
  return beste?.it || null
}

// `items`: [{ tekst, x, y }] van de eerste pagina. Geeft
// { klantArtikelnummer, revisie, omschrijving, bron } terug.
export function leesTitelblok(items, bestandsnaam = '') {
  const delen = (items || [])
    .map((it) => ({
      ...it,
      tekst: String(it.tekst || '')
        .replace(/\s+/g, ' ')
        .trim(),
    }))
    .filter((it) => it.tekst)
  const naam = schoonBestandsnaam(bestandsnaam)
  const plat = (t) => t.toLowerCase().replace(/\s+/g, '')

  // 1. Nummer: het langste tekstdeel waarmee de bestandsnaam begint. Staat het
  //    nummer én in de bestandsnaam én op de tekening, dan is het vrijwel zeker goed.
  let nummerItem = null
  let bron = ''
  if (naam) {
    const kandidaten = delen
      .filter((it) => it.tekst.length >= 4 && /\d/.test(it.tekst) && plat(naam).startsWith(plat(it.tekst)))
      .sort((a, b) => b.tekst.length - a.tekst.length)
    if (kandidaten.length) {
      nummerItem = kandidaten[0]
      bron = 'tekening en bestandsnaam'
    }
  }
  // 2. Anders: de waarde bij een label als "TEK.NUMMER:" of "Drawing no.".
  if (!nummerItem) {
    for (const label of delen.filter((it) => LABEL_NUMMER.test(it.tekst))) {
      const direct = achterLabel(label.tekst, LABEL_NUMMER)
      if (direct && /\d/.test(direct)) {
        nummerItem = { ...label, tekst: direct }
      } else {
        const waarde = waardeBij(label, delen, (it) => isLabel(it.tekst) || !/\d/.test(it.tekst) || it.tekst.length < 4)
        if (waarde) nummerItem = waarde
      }
      if (nummerItem) {
        bron = 'tekening'
        break
      }
    }
  }
  // 3. Anders alleen de bestandsnaam.
  let ruwNummer = nummerItem?.tekst || ''
  if (!ruwNummer && naam) {
    ruwNummer = naam
    bron = 'bestandsnaam'
  }
  let { nummer, revisie } = splitsRevisie(ruwNummer)
  if (!revisie && naam) revisie = splitsRevisie(naam).revisie

  // Benaming: bij het label "Benaming" (voorkeur) of "Omschrijving".
  let omschrijving = ''
  const labels = delen
    .filter((it) => LABEL_BENAMING.test(it.tekst))
    .sort(
      (a, b) =>
        Number(/benaming|title|titel|bezeichnung|benennung/i.test(b.tekst)) -
        Number(/benaming|title|titel|bezeichnung|benennung/i.test(a.tekst))
    )
  for (const label of labels) {
    const direct = achterLabel(label.tekst, LABEL_BENAMING)
    if (direct) {
      omschrijving = direct
      break
    }
    const waarde = waardeBij(
      label,
      delen,
      (it) =>
        it === nummerItem ||
        isLabel(it.tekst) ||
        it.tekst.length < 3 ||
        !/[A-Za-z]{2}/.test(it.tekst) ||
        /^[.\-_\s]+$/.test(it.tekst)
    )
    if (waarde) {
      omschrijving = waarde.tekst
      break
    }
  }

  return { klantArtikelnummer: nummer, revisie, omschrijving, bron }
}

// Leest de eerste pagina van een PDF-bestand. pdf.js wordt pas geladen als er
// echt een tekening wordt gelezen.
export async function leesTekening(file) {
  let items = []
  try {
    const [pdfjs, { default: workerUrl }] = await Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ])
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
    try {
      const pagina = await pdf.getPage(1)
      const viewport = pagina.getViewport({ scale: 1 })
      const inhoud = await pagina.getTextContent()
      items = inhoud.items
        .filter((it) => it.str?.trim())
        .map((it) => {
          const [x, y] = pdfjs.Util.transform(viewport.transform, it.transform).slice(4)
          return { tekst: it.str, x, y }
        })
    } finally {
      pdf.destroy()
    }
  } catch {
    // Onleesbare PDF: dan blijft de bestandsnaam over.
  }
  const resultaat = leesTitelblok(items, file.name)
  return { ...resultaat, tekst: items.map((it) => it.tekst).join(' '), heeftTekst: items.length > 0 }
}

import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'

// Maakt van een document op het FMID-briefpapier (InkooporderDocument,
// VerkoopDocument, ...) een A4-PDF. Gebruikt voor de mailbijlage, de knop
// "PDF downloaden" en "Afdrukken", zodat die drie altijd hetzelfde zijn.
//
// Het document wordt als één lange pagina getekend. Past het niet op één A4,
// dan wordt het tussen twee tabelregels geknipt; elke pagina krijgt de kop en
// voet van het briefpapier, vervolgpagina's ook de kopregel van de tabel, en
// de correspondentieregel staat alleen op de laatste pagina.
//
// Over het plaatje ligt onzichtbare tekst (zoals bij een gescande PDF met
// tekstherkenning), zodat de ontvanger kan knippen, plakken en zoeken.

const A4_B = 210
const A4_H = 297
const KOP = 35 // logo + bedrijfsgegevens (padding-top van .afdruk-pagina)
const VOET = 27 // groene band, foto en bankgegevens
const VOET_LAATST = 40 // idem plus correspondentieregel (padding-bottom)
const LUCHT = 4 // ruimte tussen inhoud en groene band op een vervolgpagina

// De standaardletter van de PDF kent geen typografische tekens; die worden
// anders "�" bij plakken.
const VERVANG = {
  '—': '-',
  '–': '-',
  '‘': "'",
  '’': "'",
  '“': '"',
  '”': '"',
  '…': '...',
  ' ': ' ',
}
const VERVANG_RE = /[—–‘’“”… ]/g

// Alle zichtbare tekst op de pagina, per regelstuk met de plek in mm.
// Woorden uit hetzelfde tekstblok op dezelfde regel worden samengevoegd, zodat
// spaties bij kopiëren behouden blijven.
function tekstOpPagina(pagina, mm) {
  const stukken = []
  const walker = document.createTreeWalker(pagina, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const tekst = node.nodeValue
    if (!tekst || !tekst.trim()) continue
    const stijl = getComputedStyle(node.parentElement)
    if (stijl.visibility === 'hidden') continue
    const pt = ((parseFloat(stijl.fontSize) || 10) * mm.perPx * 72) / 25.4
    let huidig = null
    for (const m of tekst.matchAll(/\S+/g)) {
      range.setStart(node, m.index)
      range.setEnd(node, m.index + m[0].length)
      const r = range.getClientRects()[0]
      if (!r || r.width === 0 || r.height === 0) continue
      const x1 = mm.x(r.left)
      const x2 = mm.x(r.right)
      const midden = mm.y((r.top + r.bottom) / 2)
      if (huidig && Math.abs(huidig.midden - midden) < 0.5) {
        huidig.tekst += ` ${m[0]}`
        huidig.x2 = x2
      } else {
        huidig = { tekst: m[0], x1, x2, midden, pt }
        stukken.push(huidig)
      }
    }
  }
  return stukken
}

// Waar de lange pagina in A4's geknipt wordt (alles in mm vanaf de bovenkant).
function bepaalPaginas(pagina, mm, hoogte) {
  if (hoogte <= A4_H + 0.5) return { enkel: true, paginas: [] }

  // Onderkant van de inhoud: laatste blok dat niet absoluut geplaatst is.
  const blokken = [...pagina.children].filter((el) => getComputedStyle(el).position !== 'absolute')
  const eindInhoud = Math.max(KOP, ...blokken.map((el) => mm.y(el.getBoundingClientRect().bottom)))

  // Plekken waar geknipt mag worden: onder een tabelregel of onder een blok.
  const knippen = [
    ...[...pagina.querySelectorAll('tbody tr, tfoot tr')].map((tr) => mm.y(tr.getBoundingClientRect().bottom)),
    ...blokken.map((el) => mm.y(el.getBoundingClientRect().bottom)),
  ].sort((a, b) => a - b)

  // Kopregel van de regeltabel, om op vervolgpagina's te herhalen.
  const tabel = pagina.querySelector('table.doc-regels')
  const thead = tabel?.querySelector('thead')
  const tbody = tabel?.querySelector('tbody')
  const tabelKop = thead && tbody
    ? {
        boven: mm.y(thead.getBoundingClientRect().top),
        onder: mm.y(thead.getBoundingClientRect().bottom),
        bodyBoven: mm.y(tbody.getBoundingClientRect().top),
        tabelOnder: mm.y(tabel.getBoundingClientRect().bottom),
      }
    : null

  const paginas = []
  let start = KOP
  while (paginas.length < 100) {
    const herhaal =
      paginas.length > 0 && tabelKop && start >= tabelKop.bodyBoven - 0.1 && start < tabelKop.tabelOnder - 0.5
    const kopHoogte = herhaal ? tabelKop.onder - tabelKop.boven : 0
    const ruimteLaatst = A4_H - VOET_LAATST - KOP - kopHoogte
    if (eindInhoud - start <= ruimteLaatst + 0.1) {
      paginas.push({ start, eind: eindInhoud, kop: herhaal })
      break
    }
    const ruimte = A4_H - VOET - LUCHT - KOP - kopHoogte
    const kandidaat = knippen.filter((k) => k > start + 1 && k <= start + ruimte).pop()
    const eind = kandidaat ?? start + ruimte
    paginas.push({ start, eind, kop: herhaal })
    start = eind
  }
  return { enkel: false, paginas, tabelKop }
}

function legTekstlaag(pdf, stukken, plaats) {
  pdf.setFont('helvetica', 'normal')
  for (const s of stukken) {
    const p = plaats(s.midden)
    if (!p) continue
    const tekst = s.tekst.replace(VERVANG_RE, (c) => VERVANG[c])
    pdf.setPage(p.pagina + 1)
    pdf.setFontSize(s.pt)
    const breedte = pdf.getTextWidth(tekst)
    pdf.text(tekst, s.x1, p.y, {
      baseline: 'middle',
      renderingMode: 'invisible',
      horizontalScale: breedte > 0 ? (s.x2 - s.x1) / breedte : 1,
    })
  }
}

// Geeft een jsPDF-document terug.
export async function maakDocumentPdf(gegevens, Document) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')])

  const container = document.createElement('div')
  container.style.cssText = 'position:fixed;left:-10000px;top:0;width:210mm;background:#fff;'
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    flushSync(() => root.render(createElement(Document, gegevens)))
    const pagina = container.querySelector('.afdruk-pagina')
    await Promise.all(
      [...pagina.querySelectorAll('img')].map((img) => (img.complete ? null : img.decode().catch(() => null)))
    )
    await document.fonts?.ready

    // Alles opmeten vóór html2canvas, zolang de pagina nog staat zoals hij getekend is.
    const basis = pagina.getBoundingClientRect()
    const perPx = A4_B / basis.width
    const mm = {
      perPx,
      x: (px) => (px - basis.left) * perPx,
      y: (px) => (px - basis.top) * perPx,
    }
    const hoogte = basis.height * perPx
    const tekst = tekstOpPagina(pagina, mm)
    const indeling = bepaalPaginas(pagina, mm, hoogte)

    const canvas = await html2canvas(pagina, { scale: 2, backgroundColor: '#ffffff', useCORS: true })
    const pxPerMm = canvas.width / A4_B
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
    const blad = document.createElement('canvas')
    blad.width = canvas.width
    blad.height = Math.round(A4_H * pxPerMm)
    const ctx = blad.getContext('2d')
    // Strook [van, tot] mm van de lange pagina op hoogte `naar` mm van het blad.
    const kopieer = (van, tot, naar) => {
      const h = Math.round((tot - van) * pxPerMm)
      if (h <= 0) return
      ctx.drawImage(canvas, 0, Math.round(van * pxPerMm), canvas.width, h, 0, Math.round(naar * pxPerMm), canvas.width, h)
    }
    const nieuwBlad = (i) => {
      if (i > 0) pdf.addPage()
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, blad.width, blad.height)
    }
    const plaatsBlad = () => pdf.addImage(blad.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, A4_B, A4_H)

    if (indeling.enkel) {
      nieuwBlad(0)
      kopieer(0, Math.min(hoogte, A4_H), 0)
      plaatsBlad()
      legTekstlaag(pdf, tekst, (y) => (y <= A4_H ? { pagina: 0, y } : null))
    } else {
      const { paginas, tabelKop } = indeling
      const laatste = paginas.length - 1
      paginas.forEach((p, i) => {
        nieuwBlad(i)
        kopieer(0, KOP, 0)
        let y = KOP
        if (p.kop) {
          kopieer(tabelKop.boven, tabelKop.onder, y)
          y += tabelKop.onder - tabelKop.boven
        }
        kopieer(p.start, p.eind, y)
        const voet = i === laatste ? VOET_LAATST : VOET
        kopieer(hoogte - voet, hoogte, A4_H - voet)
        plaatsBlad()
      })
      legTekstlaag(pdf, tekst, (y) => {
        if (y < KOP) return { pagina: 0, y }
        if (y > hoogte - VOET_LAATST) return { pagina: laatste, y: y - hoogte + A4_H }
        const i = paginas.findIndex((p) => y >= p.start && y < p.eind)
        if (i < 0) return null
        const p = paginas[i]
        const kopHoogte = p.kop ? tabelKop.onder - tabelKop.boven : 0
        return { pagina: i, y: KOP + kopHoogte + (y - p.start) }
      })
    }
    return pdf
  } finally {
    root.unmount()
    container.remove()
  }
}

export async function maakDocumentPdfBase64(gegevens, Document) {
  const pdf = await maakDocumentPdf(gegevens, Document)
  return pdf.output('datauristring').split(',')[1]
}

// Slaat de PDF op in Downloads.
export async function downloadDocumentPdf(gegevens, Document, bestandsnaam) {
  const pdf = await maakDocumentPdf(gegevens, Document)
  pdf.save(bestandsnaam.endsWith('.pdf') ? bestandsnaam : `${bestandsnaam}.pdf`)
}

// Drukt de PDF af via een verborgen frame, zodat het altijd precies A4 is
// (de printdialoog van de browser toont de PDF zelf, niet de webpagina).
export async function drukDocumentPdfAf(gegevens, Document) {
  const pdf = await maakDocumentPdf(gegevens, Document)
  const url = URL.createObjectURL(pdf.output('blob'))
  const frame = document.createElement('iframe')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;'
  frame.src = url
  document.body.appendChild(frame)
  await new Promise((klaar) => {
    frame.onload = klaar
  })
  try {
    frame.contentWindow.focus()
    frame.contentWindow.print()
  } catch {
    // Lukt afdrukken vanuit het frame niet, open de PDF dan in een nieuw tabblad.
    window.open(url, '_blank')
  }
  // Na een minuut opruimen; de printdialoog heeft de PDF dan al.
  setTimeout(() => {
    frame.remove()
    URL.revokeObjectURL(url)
  }, 60000)
}

import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import InkooporderDocument from '../pages/inkooporders/InkooporderDocument'
import { inkooporderEmailadressen, laadInkooporderVoorAfdruk, wijzigInkooporder } from './inkooporders'

// Rendert de A4-pagina buiten beeld en zet 'm om naar een PDF (base64).
// Zelfde opmaak als de afdrukpagina, dus wat de ontvanger krijgt is precies
// wat je via "PDF / afdrukken" ziet. `Document` is het component dat de pagina
// tekent (InkooporderDocument, VerkoopDocument, ...).
export async function maakPdfBase64(gegevens, Document = InkooporderDocument) {
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

    const canvas = await html2canvas(pagina, { scale: 2, backgroundColor: '#ffffff', useCORS: true })
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
    // Langer dan één A4 (veel regels): in stukken van een A4-hoogte over meerdere pagina's.
    const paginaHoogtePx = Math.round((canvas.width * 297) / 210)
    const stuk = document.createElement('canvas')
    stuk.width = canvas.width
    stuk.height = paginaHoogtePx
    const ctx = stuk.getContext('2d')
    for (let y = 0; y < canvas.height - 2; y += paginaHoogtePx) {
      if (y > 0) pdf.addPage()
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, stuk.width, stuk.height)
      ctx.drawImage(canvas, 0, -y)
      pdf.addImage(stuk.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, 210, 297)
    }
    return pdf.output('datauristring').split(',')[1]
  } finally {
    root.unmount()
    container.remove()
  }
}

// Standaardhandtekening voor uitgaande mail. Een gebruiker kan een eigen
// handtekening hebben (veld `handtekening` in users/{uid}); anders wordt deze
// gebruikt met de naam van de afzender.
export function standaardHandtekening(naam) {
  return [
    'Met vriendelijke groet / Best regards,',
    '',
    naam || 'F.M.I. Dussen B.V.',
    '',
    'F.M.I. Dussen B.V. / ANBO-Fittings',
    'Loswal 5',
    '4271 BA Dussen',
    'Tel: +31 (0)416 39 22 33',
    'Fax: +31 (0)416 39 21 26',
    'www.fmid.nl',
    'www.anbo-fittings.nl',
    '',
    'Op al onze transacties en werkzaamheden zijn uitsluitend onze leverings- en betalingsvoorwaarden van toepassing.',
    'Anders luidende voorwaarden worden door ons nimmer aanvaard. De voorwaarden kunt u bekijken op:',
    'www.fmid.nl/AlgemeneleveringsvoorwaardenFMID.pdf',
  ].join('\n')
}

function escapeHtml(tekst) {
  return tekst.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Lettertype van de mail, gelijk aan de handtekening in Outlook:
// Aptos (Hoofdtekst) 12 pt, met terugval voor ontvangers zonder Aptos.
export const MAIL_FONT = "font-family:Aptos,'Aptos (Body)',Calibri,Arial,sans-serif;font-size:12pt"

// Platte tekst -> eenvoudige HTML: regels behouden, webadressen en
// e-mailadressen klikbaar.
export function tekstNaarHtml(tekst) {
  return escapeHtml(tekst)
    .split('\n')
    .map((regel) =>
      regel
        .replace(/\b((?:https?:\/\/)?www\.[^\s<]+)/g, (url) => {
          const href = url.startsWith('http') ? url : `https://${url}`
          return `<a href="${href}" style="color:#3a4899">${url}</a>`
        })
        .replace(/([\w.+-]+@[\w-]+\.[\w.-]+)/g, '<a href="mailto:$1" style="color:#3a4899">$1</a>')
    )
    .join('<br>\n')
}

// Talen voor de inkooporder-mail, in te stellen per leverancier (veld `taal`).
export const MAIL_TALEN = { nl: 'Nederlands', de: 'Duits', en: 'Engels' }

// Onderwerp, aanhef en tekst per taal. Met een contactpersoon (veld "Uw
// referentie" op de order) wordt de aanhef persoonlijk; zonder naam algemeen.
const MAIL_TEKSTEN = {
  nl: {
    onderwerp: (nr) => `Inkooporder ${nr} - F.M.I. Dussen B.V.`,
    aanhef: (naam) => (naam ? `Beste ${naam},` : 'Geachte heer/mevrouw,'),
    tekst: (nr, ref) =>
      `In de bijlage vindt u onze inkooporder ${nr}.\n` +
      `Gelieve bij alle correspondentie te vermelden: ${ref}.`,
  },
  de: {
    onderwerp: (nr) => `Bestellung ${nr} - F.M.I. Dussen B.V.`,
    aanhef: (naam) => (naam ? `Guten Tag ${naam},` : 'Sehr geehrte Damen und Herren,'),
    tekst: (nr, ref) =>
      `anbei erhalten Sie unsere Bestellung ${nr}.\n` +
      `Bitte geben Sie bei jeglicher Korrespondenz folgende Referenz an: ${ref}.`,
  },
  en: {
    onderwerp: (nr) => `Purchase order ${nr} - F.M.I. Dussen B.V.`,
    aanhef: (naam) => (naam ? `Dear ${naam},` : 'Dear Sir or Madam,'),
    tekst: (nr, ref) =>
      `Please find attached our purchase order ${nr}.\n` +
      `Please quote the following reference in all correspondence: ${ref}.`,
  },
}

// Stelt het bericht op (onderwerp, tekst, HTML met handtekening en de PDF als
// bijlage) zonder het te versturen.
export async function maakInkooporderBericht({ gegevens, gebruiker, handtekening }) {
  const { order, leverancier } = gegevens
  const t = MAIL_TEKSTEN[leverancier?.taal] || MAIL_TEKSTEN.nl
  const referentie = `${order.leverancierscode} - ${order.ordernummer}`
  const tekst =
    `${t.aanhef(order.referentie?.trim())}\n\n` +
    `${t.tekst(order.ordernummer, referentie)}\n\n` +
    (handtekening?.trim() || standaardHandtekening(order.besteldDoor || gebruiker))

  return {
    subject: t.onderwerp(order.ordernummer),
    text: tekst,
    html: `<div style="${MAIL_FONT};color:#000">${tekstNaarHtml(tekst)}</div>`,
    attachments: [
      {
        filename: `Inkooporder ${order.ordernummer}.pdf`,
        content: await maakPdfBase64(gegevens),
        encoding: 'base64',
        contentType: 'application/pdf',
      },
    ],
  }
}

// Zet een mail met de inkooporder als PDF-bijlage klaar in de collectie
// `mail`. De Cloud Function `verstuurMail` (functions/index.js) pikt die op en
// verstuurt 'm via SMTP; het resultaat (verzonden/fout) schrijft de functie
// terug in het veld `delivery` van hetzelfde document.
//
// `ontvangers` is optioneel: een eigen lijst adressen voor deze ene mail (bijv.
// aangevuld in het verstuurvenster). Zonder lijst gaan we naar de adressen die
// bij de leverancier zijn ingesteld.
export async function mailInkooporder({
  inkooporderId,
  gebruiker,
  gebruikerEmail,
  handtekening,
  gegevens,
  ontvangers,
}) {
  if (!gegevens) gegevens = await laadInkooporderVoorAfdruk(inkooporderId)
  const { order, leverancier } = gegevens
  const aan = ontvangers
    ? [...new Set(ontvangers.map((e) => e.trim()).filter(Boolean))]
    : inkooporderEmailadressen(leverancier)
  if (aan.length === 0) {
    throw new Error(
      `Er is geen e-mailadres ingesteld bij leverancier ${order.leverancierscode}. ` +
        'Vul dit in bij Leveranciers → E-mailadressen voor inkooporders.'
    )
  }

  // De gebruiker die de order verstuurt krijgt een kopie (cc), tenzij die
  // al als ontvanger op de mail staat.
  const cc = gebruikerEmail && !aan.includes(gebruikerEmail) ? [gebruikerEmail] : []

  const ref = await addDoc(collection(db, 'mail'), {
    to: aan,
    cc,
    message: await maakInkooporderBericht({ gegevens, gebruiker, handtekening }),
    inkooporderId,
    verzondenDoor: gebruiker || '',
    datum: serverTimestamp(),
  })

  await wijzigInkooporder(inkooporderId, {
    gemaildNaar: aan,
    gemaildCc: cc,
    gemaildOp: serverTimestamp(),
    mailId: ref.id,
    ...(order.status === 'concept' ? { status: 'besteld' } : {}),
  })

  return { aan, cc, mailId: ref.id }
}

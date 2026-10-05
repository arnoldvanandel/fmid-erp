import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import InkooporderDocument from '../pages/inkooporders/InkooporderDocument'
import { inkooporderEmailadressen, laadInkooporderVoorAfdruk, wijzigInkooporder } from './inkooporders'

// Rendert de A4-pagina buiten beeld en zet 'm om naar een PDF (base64).
// Zelfde opmaak als de afdrukpagina, dus wat de leverancier krijgt is
// precies wat je via "PDF / afdrukken" ziet.
export async function maakPdfBase64(gegevens) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')])

  const container = document.createElement('div')
  container.style.cssText = 'position:fixed;left:-10000px;top:0;width:210mm;background:#fff;'
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    flushSync(() => root.render(createElement(InkooporderDocument, gegevens)))
    const pagina = container.querySelector('.afdruk-pagina')
    await Promise.all(
      [...pagina.querySelectorAll('img')].map((img) => (img.complete ? null : img.decode().catch(() => null)))
    )
    await document.fonts?.ready

    const canvas = await html2canvas(pagina, { scale: 2, backgroundColor: '#ffffff', useCORS: true })
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, 210, 297)
    return pdf.output('datauristring').split(',')[1]
  } finally {
    root.unmount()
    container.remove()
  }
}

// Zet een mail met de inkooporder als PDF-bijlage klaar in de collectie
// `mail`. De Cloud Function `verstuurMail` (functions/index.js) pikt die op en
// verstuurt 'm via SMTP; het resultaat (verzonden/fout) schrijft de functie
// terug in het veld `delivery` van hetzelfde document.
export async function mailInkooporder({ inkooporderId, gebruiker, gegevens }) {
  if (!gegevens) gegevens = await laadInkooporderVoorAfdruk(inkooporderId)
  const { order, leverancier } = gegevens
  const aan = inkooporderEmailadressen(leverancier)
  if (aan.length === 0) {
    throw new Error(
      `Er is geen e-mailadres ingesteld bij leverancier ${order.leverancierscode}. ` +
        'Vul dit in bij Leveranciers → E-mailadressen voor inkooporders.'
    )
  }

  const pdf = await maakPdfBase64(gegevens)
  const onderwerp = `Inkooporder ${order.ordernummer} - F.M.I. Dussen B.V.`
  const tekst =
    `Geachte heer/mevrouw${order.referentie ? ` ${order.referentie}` : ''},\n\n` +
    `In de bijlage vindt u onze inkooporder ${order.ordernummer}.\n` +
    `Gelieve bij alle correspondentie te vermelden: ${order.leverancierscode} - ${order.ordernummer}.\n\n` +
    `Met vriendelijke groet,\n\n${order.besteldDoor || gebruiker || ''}\nF.M.I. Dussen B.V.\n` +
    `Tel: +31 (0)416 39 22 33\ninfo@fmid.nl`

  const ref = await addDoc(collection(db, 'mail'), {
    to: aan,
    message: {
      subject: onderwerp,
      text: tekst,
      attachments: [
        {
          filename: `Inkooporder ${order.ordernummer}.pdf`,
          content: pdf,
          encoding: 'base64',
          contentType: 'application/pdf',
        },
      ],
    },
    inkooporderId,
    verzondenDoor: gebruiker || '',
    datum: serverTimestamp(),
  })

  await wijzigInkooporder(inkooporderId, {
    gemaildNaar: aan,
    gemaildOp: serverTimestamp(),
    mailId: ref.id,
    ...(order.status === 'concept' ? { status: 'besteld' } : {}),
  })

  return { aan, mailId: ref.id }
}

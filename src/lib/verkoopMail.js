import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import VerkoopDocument from '../pages/verkooporders/VerkoopDocument'
import { MAIL_FONT, maakPdfBase64, standaardHandtekening, tekstNaarHtml } from './inkooporderMail'

// Mailen van orderbevestiging, pakbon en factuur aan de klant. Zelfde werkwijze
// als de inkooporder (lib/inkooporderMail.js): een document in de collectie
// `mail`, dat de Cloud Function verstuurMail verstuurt.

const TITELS = {
  nl: { bevestiging: 'Orderbevestiging', pakbon: 'Pakbon', factuur: 'Factuur' },
  de: { bevestiging: 'Auftragsbestätigung', pakbon: 'Lieferschein', factuur: 'Rechnung' },
  en: { bevestiging: 'Order confirmation', pakbon: 'Packing slip', factuur: 'Invoice' },
}

const MAIL_TEKSTEN = {
  nl: {
    aanhef: (naam) => (naam ? `Beste ${naam},` : 'Geachte heer/mevrouw,'),
    bevestiging: (nr, ref) =>
      `Hartelijk dank voor uw order${ref ? ` ${ref}` : ''}. In de bijlage vindt u onze orderbevestiging ${nr}.\n` +
      'Wilt u deze controleren en ons laten weten als er iets niet klopt?',
    pakbon: (nr, ref) => `In de bijlage vindt u pakbon ${nr} bij uw order${ref ? ` ${ref}` : ''}.`,
    factuur: (nr, ref) => `In de bijlage vindt u factuur ${nr}${ref ? ` voor uw order ${ref}` : ''}.`,
  },
  de: {
    aanhef: (naam) => (naam ? `Guten Tag ${naam},` : 'Sehr geehrte Damen und Herren,'),
    bevestiging: (nr, ref) =>
      `vielen Dank für Ihren Auftrag${ref ? ` ${ref}` : ''}. Anbei erhalten Sie unsere Auftragsbestätigung ${nr}.\n` +
      'Bitte prüfen Sie diese und teilen Sie uns eventuelle Abweichungen mit.',
    pakbon: (nr, ref) => `anbei erhalten Sie den Lieferschein ${nr} zu Ihrem Auftrag${ref ? ` ${ref}` : ''}.`,
    factuur: (nr, ref) => `anbei erhalten Sie die Rechnung ${nr}${ref ? ` zu Ihrem Auftrag ${ref}` : ''}.`,
  },
  en: {
    aanhef: (naam) => (naam ? `Dear ${naam},` : 'Dear Sir or Madam,'),
    bevestiging: (nr, ref) =>
      `Thank you for your order${ref ? ` ${ref}` : ''}. Please find attached our order confirmation ${nr}.\n` +
      'Kindly check it and let us know if anything is incorrect.',
    pakbon: (nr, ref) => `Please find attached packing slip ${nr} for your order${ref ? ` ${ref}` : ''}.`,
    factuur: (nr, ref) => `Please find attached invoice ${nr}${ref ? ` for your order ${ref}` : ''}.`,
  },
}

export function documentNummer(gegevens) {
  const { soort, order, document: d } = gegevens
  return soort === 'factuur' ? d.factuurnummer : soort === 'pakbon' ? d.pakbonnummer : order.ordernummer
}

export function documentTitel(gegevens) {
  const taal = gegevens.document?.taal || gegevens.order?.taal || 'nl'
  return `${(TITELS[taal] || TITELS.nl)[gegevens.soort]} ${documentNummer(gegevens)}`
}

async function maakBericht({ gegevens, gebruiker, handtekening }) {
  const { soort, order } = gegevens
  const taal = gegevens.document?.taal || order?.taal || 'nl'
  const t = MAIL_TEKSTEN[taal] || MAIL_TEKSTEN.nl
  const nummer = documentNummer(gegevens)
  const titel = documentTitel(gegevens)
  const tekst =
    `${t.aanhef(order?.contactpersoon?.trim())}\n\n` +
    `${t[soort](nummer, (gegevens.document?.referentie ?? order?.referentie)?.trim())}\n\n` +
    (handtekening?.trim() || standaardHandtekening(order?.verkoper || gebruiker))

  return {
    subject: `${titel} - F.M.I. Dussen B.V.`,
    text: tekst,
    html: `<div style="${MAIL_FONT};color:#000">${tekstNaarHtml(tekst)}</div>`,
    attachments: [
      {
        filename: `${titel}.pdf`,
        content: await maakPdfBase64(gegevens, VerkoopDocument),
        encoding: 'base64',
        contentType: 'application/pdf',
      },
    ],
  }
}

// Mailt een orderbevestiging (gegevens uit laadVerkooporderVoorAfdruk) of een
// pakbon/factuur (gegevens uit laadDocumentVoorAfdruk) naar `ontvangers`.
// Na een orderbevestiging gaat een concept-order naar status "bevestigd".
export async function mailVerkoopDocument({ gegevens, ontvangers, gebruiker, gebruikerEmail, handtekening }) {
  const aan = [...new Set(ontvangers.map((e) => e.trim()).filter(Boolean))]
  if (aan.length === 0) throw new Error('Vul minimaal één e-mailadres in.')
  const cc = gebruikerEmail && !aan.includes(gebruikerEmail) ? [gebruikerEmail] : []
  const { soort, order, document: d } = gegevens

  const ref = await addDoc(collection(db, 'mail'), {
    to: aan,
    cc,
    message: await maakBericht({ gegevens, gebruiker, handtekening }),
    verkooporderId: order?.id || d?.verkooporderId || '',
    ...(soort === 'pakbon' ? { pakbonId: d.id } : {}),
    ...(soort === 'factuur' ? { factuurId: d.id } : {}),
    verzondenDoor: gebruiker || '',
    datum: serverTimestamp(),
  })

  const mailvelden = { gemaildNaar: aan, gemaildCc: cc, gemaildOp: serverTimestamp(), mailId: ref.id }
  if (soort === 'bevestiging') {
    await updateDoc(doc(db, 'verkooporders', order.id), {
      ...mailvelden,
      ...(order.status === 'concept' ? { status: 'bevestigd' } : {}),
    })
  } else {
    await updateDoc(doc(db, soort === 'factuur' ? 'facturen' : 'pakbonnen', d.id), mailvelden)
  }
  return { aan, cc, mailId: ref.id }
}

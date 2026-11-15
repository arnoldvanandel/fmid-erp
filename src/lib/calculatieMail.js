import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import AanbiedingDocument, { AANBIEDING_TITEL } from '../pages/calculaties/AanbiedingDocument'
import { MAIL_FONT, maakPdfBase64, standaardHandtekening, tekstNaarHtml } from './inkooporderMail'

// Mailen van de aanbieding aan de klant. Zelfde werkwijze als de andere
// documenten (lib/verkoopMail.js): een document in de collectie `mail`, dat de
// Cloud Function verstuurMail verstuurt, met de aanbieding als PDF-bijlage.

const MAIL_TEKSTEN = {
  nl: {
    aanhef: (naam) => (naam ? `Beste ${naam},` : 'Geachte heer/mevrouw,'),
    tekst: (nr, ref, artikel) =>
      `Hartelijk dank voor uw aanvraag${ref ? ` ${ref}` : ''}. In de bijlage vindt u onze aanbieding ${nr}${artikel ? ` voor ${artikel}` : ''}.\n` +
      'Heeft u vragen of opmerkingen, dan horen wij dat graag.',
  },
  de: {
    aanhef: (naam) => (naam ? `Guten Tag ${naam},` : 'Sehr geehrte Damen und Herren,'),
    tekst: (nr, ref, artikel) =>
      `vielen Dank für Ihre Anfrage${ref ? ` ${ref}` : ''}. Anbei erhalten Sie unser Angebot ${nr}${artikel ? ` für ${artikel}` : ''}.\n` +
      'Für Rückfragen stehen wir Ihnen gerne zur Verfügung.',
  },
  en: {
    aanhef: (naam) => (naam ? `Dear ${naam},` : 'Dear Sir or Madam,'),
    tekst: (nr, ref, artikel) =>
      `Thank you for your enquiry${ref ? ` ${ref}` : ''}. Please find attached our quotation ${nr}${artikel ? ` for ${artikel}` : ''}.\n` +
      'Should you have any questions, please do not hesitate to contact us.',
  },
}

function taalVan(gegevens) {
  const taal = gegevens.calculatie?.taal || gegevens.klant?.taal
  return MAIL_TEKSTEN[taal] ? taal : 'nl'
}

export function aanbiedingTitel(gegevens) {
  return `${AANBIEDING_TITEL[taalVan(gegevens)]} ${gegevens.calculatie.calculatienummer}`
}

// De tekst die in het mailvenster wordt voorgesteld; de gebruiker kan hem
// daar nog aanpassen voordat de mail weggaat.
export function aanbiedingMailTekst({ gegevens, gebruiker, handtekening }) {
  const c = gegevens.calculatie
  const t = MAIL_TEKSTEN[taalVan(gegevens)]
  return (
    `${t.aanhef(c.contactpersoon?.trim())}\n\n` +
    `${t.tekst(c.calculatienummer, c.referentie?.trim(), c.klantArtikelnummer || c.omschrijving)}\n\n` +
    (handtekening?.trim() || standaardHandtekening(c.behandeldDoor || gebruiker))
  )
}

// Mailt de aanbieding (gegevens uit laadCalculatieVoorAfdruk) naar `ontvangers`.
// Daarna staat de calculatie op "verstuurd", met wie hem wanneer kreeg.
export async function mailAanbieding({ gegevens, ontvangers, tekst, gebruiker, gebruikerEmail, handtekening }) {
  const aan = [...new Set(ontvangers.map((e) => e.trim()).filter(Boolean))]
  if (aan.length === 0) throw new Error('Vul minimaal één e-mailadres in.')
  const cc = gebruikerEmail && !aan.includes(gebruikerEmail) ? [gebruikerEmail] : []
  const c = gegevens.calculatie
  const titel = aanbiedingTitel(gegevens)
  const bericht = tekst?.trim() || aanbiedingMailTekst({ gegevens, gebruiker, handtekening })

  const ref = await addDoc(collection(db, 'mail'), {
    to: aan,
    cc,
    message: {
      subject: `${titel} - F.M.I. Dussen B.V.`,
      text: bericht,
      html: `<div style="${MAIL_FONT};color:#000">${tekstNaarHtml(bericht)}</div>`,
      attachments: [
        {
          filename: `${titel}.pdf`,
          content: await maakPdfBase64(gegevens, AanbiedingDocument),
          encoding: 'base64',
          contentType: 'application/pdf',
        },
      ],
    },
    soort: 'aanbieding',
    calculatieId: c.id,
    verzondenDoor: gebruiker || '',
    datum: serverTimestamp(),
  })

  await updateDoc(doc(db, 'calculaties', c.id), {
    gemaildNaar: aan,
    gemaildCc: cc,
    gemaildOp: serverTimestamp(),
    mailId: ref.id,
    mailTekst: bericht,
    ...(c.status === 'concept' ? { status: 'verstuurd' } : {}),
  })
  return { aan, cc, mailId: ref.id }
}

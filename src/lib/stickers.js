// Stickers bestellen bij Bonfix.
//
// BON-artikelen (bijv. "BON105 15-15") worden bij een toeleverancier zoals
// Avres gemaakt en verpakt. Voor elke order daar moeten bij Bonfix stickers
// besteld worden, die Bonfix rechtstreeks naar die toeleverancier stuurt.
// Bonfix kent de artikelen onder een eigen nummer (Bonfix-nummer, bijv. 53505)
// en een eigen code ("A105 15-15"); die code volgt uit ons artikelnummer.
import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { haalArtikelenOp } from './artikelZoeken'
import { MAIL_FONT, standaardHandtekening, tekstNaarHtml } from './inkooporderMail'
import { wijzigInkooporder } from './inkooporders'

export const BONFIX = { naam: 'Mike', email: 'Westerop@bonfix.nl' }

export function isBonArtikel(artikelnummer) {
  return /^BON/i.test(String(artikelnummer || '').trim())
}

// "BON105 15-15" -> "A105 15-15"
export function bonfixCode(artikelnummer) {
  return 'A' + String(artikelnummer).trim().slice(3)
}

// Een paar stickers extra voor misdrukken: +20, naar boven afgerond op 10.
export function aantalStickers(aantal) {
  return Math.ceil(((Number(aantal) || 0) + 20) / 10) * 10
}

// Stickerregels voor de BON-artikelen van een inkooporder, met het
// Bonfix-nummer uit het artikel.
export async function stickerRegels(orderregels) {
  const bon = orderregels.filter((r) => isBonArtikel(r.artikelnummer))
  const artikelen = await haalArtikelenOp(bon.map((r) => r.artikelId))
  return bon.map((r) => ({
    artikelnummer: r.artikelnummer,
    bonfixNummer: artikelen[r.artikelId]?.bonfixNummer || '',
    bonfixCode: bonfixCode(r.artikelnummer),
    aantal: aantalStickers(r.aantal),
    eenheid: r.eenheid || 'Stuks',
  }))
}

function escapeHtml(tekst) {
  return String(tekst).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Afleveradres van de stickers: de toeleverancier (de leverancier van de
// inkooporder). Het laatst gebruikte adres staat bij de leverancier in
// `stickerAfleveradres`, want het adres in de stamgegevens is soms een postbus.
export function standaardAfleveradres(leverancier) {
  if (leverancier?.stickerAfleveradres) return leverancier.stickerAfleveradres
  return [
    leverancier?.naam,
    leverancier?.straat,
    [leverancier?.postcode, leverancier?.plaats].filter(Boolean).join(' '),
    leverancier?.contactpersoon ? `T.a.v. ${leverancier.contactpersoon}.` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export function maakStickerBericht({ regels, zakjes, afleveradres, leverancier, order, gebruiker, handtekening }) {
  const naar = leverancier?.naam || 'de toeleverancier'
  const vraag = `Zouden jullie de volgende stickers${zakjes ? ' en een doos zakjes' : ''} naar ${naar} kunnen sturen?`
  const slot = [`Deze items staan al bij ${naar}.`, '', 'Het adres is:', afleveradres.trim()].join('\n')
  const groet = handtekening?.trim() || standaardHandtekening(order.besteldDoor || gebruiker)

  const kolommen = ['Bonfix nummer', 'Artikelnummer', 'Hoeveelheid', 'Eenheid']
  const cel = 'border:1px solid #999;padding:3px 10px'
  const tabel =
    `<table style="border-collapse:collapse;${MAIL_FONT}">` +
    `<tr>${kolommen.map((k) => `<th style="${cel};text-align:left;background:#eceefa">${k}</th>`).join('')}</tr>` +
    regels
      .map(
        (r) =>
          `<tr><td style="${cel}">${escapeHtml(r.bonfixNummer)}</td><td style="${cel}">${escapeHtml(r.bonfixCode)}</td>` +
          `<td style="${cel};text-align:right">${escapeHtml(r.aantal)}</td><td style="${cel}">${escapeHtml(r.eenheid)}</td></tr>`
      )
      .join('') +
    '</table>'
  const tabelTekst = [kolommen.join('\t'), ...regels.map((r) => [r.bonfixNummer, r.bonfixCode, r.aantal, r.eenheid].join('\t'))].join('\n')

  const begin = `Dag ${BONFIX.naam},\n\n${vraag}`
  return {
    subject: 'Stickers',
    text: `${begin}\n\n${tabelTekst}\n\n${slot}\n\n${groet}`,
    html:
      `<div style="${MAIL_FONT};color:#000">${tekstNaarHtml(begin)}<br><br>${tabel}<br>` +
      `${tekstNaarHtml(slot)}<br><br>${tekstNaarHtml(groet)}</div>`,
  }
}

// Zet de mail klaar voor de Cloud Function verstuurMail en legt op de
// inkooporder vast dat de stickers besteld zijn.
export async function mailStickers({
  gegevens,
  regels,
  zakjes,
  afleveradres,
  ontvangers,
  gebruiker,
  gebruikerEmail,
  handtekening,
}) {
  const { order, leverancier } = gegevens
  const aan = [...new Set(ontvangers.map((e) => e.trim()).filter(Boolean))]
  const cc = gebruikerEmail && !aan.includes(gebruikerEmail) ? [gebruikerEmail] : []

  const ref = await addDoc(collection(db, 'mail'), {
    to: aan,
    cc,
    message: maakStickerBericht({ regels, zakjes, afleveradres, leverancier, order, gebruiker, handtekening }),
    inkooporderId: order.id,
    soort: 'stickers',
    verzondenDoor: gebruiker || '',
    datum: serverTimestamp(),
  })

  await wijzigInkooporder(order.id, {
    stickersBesteldOp: serverTimestamp(),
    stickersBesteldDoor: gebruiker || '',
    stickersBesteldNaar: aan,
    stickersBesteldCc: cc,
    stickersMailId: ref.id,
  })
  if (leverancier?.id && afleveradres.trim() !== (leverancier.stickerAfleveradres || '')) {
    await updateDoc(doc(db, 'leveranciers', leverancier.id), { stickerAfleveradres: afleveradres.trim() })
  }
}

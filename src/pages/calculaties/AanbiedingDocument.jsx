import { formatNumber, formatPrijs } from '../../lib/format'
import { geldigTot } from '../../lib/calculaties'
import { datumLang } from '../inkooporders/bedrijf'
import Briefpapier from '../inkooporders/Briefpapier'
import { Veld, eenheid, landRegel, leveringTekst } from '../inkooporders/documentDelen'
import '../inkooporders/afdruk.css'

// Teksten op de aanbieding, in de taal van de klant.
const T = {
  nl: {
    titel: 'Aanbieding',
    tav: 't.a.v.',
    datum: 'Datum',
    klant: 'Klantnr.',
    uwReferentie: 'Uw referentie',
    behandeldDoor: 'Behandeld door',
    levering: 'Levering',
    levertijd: 'Levertijd',
    betaling: 'Betaling',
    betalingTekst: (d) => `${d} dagen na factuurdatum`,
    geldigTot: 'Geldig tot',
    valuta: 'Valuta',
    pos: 'Pos.',
    artikel: 'Artikelnr.',
    omschrijving: 'Omschrijving',
    uwArtikel: 'Uw art.nr.',
    rev: 'rev.',
    aantal: 'Aantal',
    eenheid: 'Eenh.',
    prijs: 'Prijs per stuk',
    bedrag: 'Bedrag',
    totaal: 'Totaal excl. BTW',
    inleiding: 'Hartelijk dank voor uw aanvraag. Wij bieden u graag het volgende aan:',
    prijzenExcl: 'Prijzen zijn exclusief BTW.',
    opmerkingen: 'Opmerkingen',
    slot: 'Wij vertrouwen erop u een passende aanbieding te hebben gedaan en zien uw reactie graag tegemoet.',
    correspondentie: 'Gelieve bij alle correspondentie te vermelden:',
    voorwaarden:
      'Op al onze transacties zijn uitsluitend onze leverings- en betalingsvoorwaarden van toepassing (www.fmid.nl).',
  },
  de: {
    titel: 'Angebot',
    tav: 'z. Hd.',
    datum: 'Datum',
    klant: 'Kunden-Nr.',
    uwReferentie: 'Ihre Referenz',
    behandeldDoor: 'Bearbeitet von',
    levering: 'Lieferbedingung',
    levertijd: 'Lieferzeit',
    betaling: 'Zahlung',
    betalingTekst: (d) => `${d} Tage nach Rechnungsdatum`,
    geldigTot: 'Gültig bis',
    valuta: 'Währung',
    pos: 'Pos.',
    artikel: 'Artikel-Nr.',
    omschrijving: 'Bezeichnung',
    uwArtikel: 'Ihre Art.-Nr.',
    rev: 'Rev.',
    aantal: 'Menge',
    eenheid: 'Einh.',
    prijs: 'Preis pro Stück',
    bedrag: 'Betrag',
    totaal: 'Gesamtbetrag netto',
    inleiding: 'Vielen Dank für Ihre Anfrage. Gerne bieten wir Ihnen wie folgt an:',
    prijzenExcl: 'Alle Preise verstehen sich zuzüglich MwSt.',
    opmerkingen: 'Bemerkungen',
    slot: 'Wir hoffen, Ihnen ein passendes Angebot unterbreitet zu haben, und freuen uns auf Ihre Rückmeldung.',
    correspondentie: 'Bitte bei jeglicher Korrespondenz angeben:',
    voorwaarden: 'Für alle Geschäfte gelten ausschließlich unsere Liefer- und Zahlungsbedingungen (www.fmid.nl).',
  },
  en: {
    titel: 'Quotation',
    tav: 'Attn.',
    datum: 'Date',
    klant: 'Customer no.',
    uwReferentie: 'Your reference',
    behandeldDoor: 'Handled by',
    levering: 'Delivery terms',
    levertijd: 'Lead time',
    betaling: 'Payment',
    betalingTekst: (d) => `${d} days from invoice date`,
    geldigTot: 'Valid until',
    valuta: 'Currency',
    pos: 'Pos.',
    artikel: 'Item no.',
    omschrijving: 'Description',
    uwArtikel: 'Your item no.',
    rev: 'rev.',
    aantal: 'Qty',
    eenheid: 'Unit',
    prijs: 'Price per piece',
    bedrag: 'Amount',
    totaal: 'Total excl. VAT',
    inleiding: 'Thank you for your enquiry. We are pleased to quote as follows:',
    prijzenExcl: 'All prices are exclusive of VAT.',
    opmerkingen: 'Remarks',
    slot: 'We trust this quotation meets your requirements and look forward to your reply.',
    correspondentie: 'Please quote in all correspondence:',
    voorwaarden: 'All our transactions are subject exclusively to our terms of delivery and payment (www.fmid.nl).',
  },
}

export const AANBIEDING_TITEL = { nl: T.nl.titel, de: T.de.titel, en: T.en.titel }

// Komt een artikel vaker voor (een staffel, of een calculatie met meerdere
// aantallen), dan zijn de regels alternatieven en is een totaal zinloos.
function heeftTotaal(regels) {
  const nummers = regels.map((r) => r.artikelnummer || '')
  return regels.length > 0 && new Set(nummers).size === nummers.length
}

function aantal(value) {
  return formatNumber(value, Number.isInteger(Number(value)) ? 0 : 2)
}

// De A4-pagina van een aanbieding, in dezelfde opmaak als de andere documenten.
// Wordt gebruikt voor de afdrukpagina en voor de PDF-bijlage bij de mail
// (lib/calculatieMail.js). De regels komen uit documentRegels: bij een
// calculatie elk aantal met zijn eigen stuksprijs, bij een aanbieding met
// artikelen de artikelen zoals ingevuld.
export default function AanbiedingDocument({ calculatie: c, klant, regels }) {
  const taal = T[c?.taal || klant?.taal] ? c?.taal || klant?.taal : 'nl'
  const t = T[taal]
  const valuta = c.valuta || 'EUR'
  const adres = c.adres || {}
  const plaatsregel = [adres.postcode, adres.plaats?.toUpperCase()].filter(Boolean).join(' ')
  const termijn = c.betalingstermijn

  return (
    <Briefpapier>
      <div className="doc-kop">
        <div className="doc-titelblok">
          <h1 className="doc-titel">{t.titel}</h1>
          <div className="doc-nummer">{c.calculatienummer}</div>
          <div className="doc-datum">{datumLang(c.calculatiedatum)}</div>
        </div>
        <div className="doc-adres">
          <div className="doc-adres-naam">{adres.naam || c.klantNaam}</div>
          {c.contactpersoon && (
            <div>
              {t.tav} {c.contactpersoon}
            </div>
          )}
          {adres.straat && <div>{adres.straat}</div>}
          {plaatsregel && <div>{plaatsregel}</div>}
          {landRegel(adres.land, taal) && <div>{landRegel(adres.land, taal)}</div>}
        </div>
      </div>

      <div className="doc-gegevens">
        <Veld label={t.klant}>{c.klantcode}</Veld>
        <Veld label={t.uwReferentie}>{c.referentie}</Veld>
        <Veld label={t.behandeldDoor}>{c.behandeldDoor}</Veld>
        <Veld label={t.levering}>{leveringTekst(c.leveringsvoorwaarde)}</Veld>
        <Veld label={t.levertijd}>{c.levertijd}</Veld>
        <Veld label={t.betaling}>{termijn != null && termijn !== '' ? t.betalingTekst(termijn) : ''}</Veld>
        <Veld label={t.geldigTot}>{datumLang(geldigTot(c))}</Veld>
        <Veld label={t.valuta}>{valuta}</Veld>
      </div>

      <p className="doc-instructie">{t.inleiding}</p>

      <table className="doc-regels">
        <thead>
          <tr>
            <th className="doc-pos">{t.pos}</th>
            <th>{t.artikel}</th>
            <th>{t.omschrijving}</th>
            <th>{t.uwArtikel}</th>
            <th className="num">{t.aantal}</th>
            <th>{t.eenheid}</th>
            <th className="num">{t.prijs}</th>
            <th className="num">{t.bedrag}</th>
          </tr>
        </thead>
        <tbody>
          {regels.map((r, i) => (
            <tr key={i}>
              <td className="doc-pos">{(i + 1) * 10}</td>
              <td className="doc-artikelnummer doc-nowrap">{r.artikelnummer}</td>
              <td>{r.omschrijving}</td>
              <td className="doc-nowrap">
                {r.klantArtikelnummer}
                {r.revisie ? ` ${t.rev} ${r.revisie}` : ''}
              </td>
              <td className="num">{aantal(r.aantal)}</td>
              <td className="doc-nowrap">{eenheid(r.eenheid, taal)}</td>
              <td className="num">
                {valuta} {formatPrijs(r.prijs)}
              </td>
              <td className="num">
                {valuta} {formatNumber(r.bedrag, 2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {heeftTotaal(regels) && (
        <div className="doc-totalen">
          <div className="doc-totalen-eind">
            <span>{t.totaal}</span>
            <span>
              {valuta} {formatNumber(regels.reduce((som, r) => som + (Number(r.bedrag) || 0), 0), 2)}
            </span>
          </div>
        </div>
      )}

      <p className="doc-vermelding">{t.prijzenExcl}</p>

      {c.opmerkingen && (
        <div className="doc-opmerkingen">
          <div className="doc-label">{t.opmerkingen}</div>
          <div style={{ whiteSpace: 'pre-wrap' }}>{c.opmerkingen}</div>
        </div>
      )}

      <p className="doc-instructie">{t.slot}</p>

      <footer className="afdruk-voet">
        <div className="afdruk-correspondentie">
          <span>{t.correspondentie}</span>
          <strong>
            {c.klantcode} - {c.calculatienummer}
          </strong>
        </div>
        <div className="afdruk-kleine-letters">{t.voorwaarden}</div>
      </footer>
    </Briefpapier>
  )
}

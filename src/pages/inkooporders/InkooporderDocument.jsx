import { formatNumber, formatPrijs } from '../../lib/format'
import { LEVERINGSVOORWAARDEN } from '../../lib/stamgegevens'
import Briefpapier from './Briefpapier'
import { BEDRIJF, datumKort, datumLang } from './bedrijf'
import './afdruk.css'

// Voor bestaande imports elders.
export { BEDRIJF, datumKort, datumLang } from './bedrijf'

// Teksten op de inkooporder, in de taal van de leverancier (veld `taal`).
const T = {
  nl: {
    titel: 'Inkooporder',
    tav: 't.a.v.',
    besteldatum: 'Besteldatum',
    leverancier: 'Leveranciersnr.',
    offerte: 'Uw offerte',
    besteldDoor: 'Besteld door',
    leverdatum: 'Gewenste leverdatum',
    levering: 'Levering',
    betaling: 'Betaling',
    betalingTekst: (d) => `${d} dagen na factuurdatum`,
    valuta: 'Valuta',
    afleveradres: 'Afleveradres',
    pos: 'Pos.',
    artikel: 'Artikel',
    uwArtikel: 'Uw art.nr.',
    aantal: 'Aantal',
    eenheid: 'Eenh.',
    prijs: 'Prijs',
    bedrag: 'Bedrag',
    leverdatumKort: 'Leverdatum',
    regels: (n) => `${n} ${n === 1 ? 'regel' : 'regels'}`,
    totaal: 'Totaal excl. BTW',
    opmerkingen: 'Opmerkingen',
    instructie: (nr) =>
      `Wij verzoeken u deze bestelling te bevestigen en ons inkoopordernummer ${nr} te vermelden ` +
      'op orderbevestiging, pakbon en factuur.',
    correspondentie: 'Gelieve bij alle correspondentie te vermelden:',
    automatisch: 'Deze bestelling is automatisch aangemaakt en daarom niet voorzien van een handtekening.',
  },
  de: {
    titel: 'Bestellung',
    tav: 'z. Hd.',
    besteldatum: 'Bestelldatum',
    leverancier: 'Lieferanten-Nr.',
    offerte: 'Ihr Angebot',
    besteldDoor: 'Besteller',
    leverdatum: 'Gewünschter Liefertermin',
    levering: 'Lieferbedingung',
    betaling: 'Zahlung',
    betalingTekst: (d) => `${d} Tage nach Rechnungsdatum`,
    valuta: 'Währung',
    afleveradres: 'Lieferadresse',
    pos: 'Pos.',
    artikel: 'Artikel',
    uwArtikel: 'Ihre Art.-Nr.',
    aantal: 'Menge',
    eenheid: 'Einh.',
    prijs: 'Preis',
    bedrag: 'Betrag',
    leverdatumKort: 'Liefertermin',
    regels: (n) => `${n} ${n === 1 ? 'Position' : 'Positionen'}`,
    totaal: 'Summe netto',
    opmerkingen: 'Bemerkungen',
    instructie: (nr) =>
      `Bitte bestätigen Sie diese Bestellung und geben Sie unsere Bestellnummer ${nr} ` +
      'auf Auftragsbestätigung, Lieferschein und Rechnung an.',
    correspondentie: 'Bitte bei jeglicher Korrespondenz angeben:',
    automatisch: 'Diese Bestellung wurde automatisch erstellt und ist daher nicht unterschrieben.',
  },
  en: {
    titel: 'Purchase order',
    tav: 'Attn.',
    besteldatum: 'Order date',
    leverancier: 'Supplier no.',
    offerte: 'Your quotation',
    besteldDoor: 'Ordered by',
    leverdatum: 'Requested delivery',
    levering: 'Delivery terms',
    betaling: 'Payment',
    betalingTekst: (d) => `${d} days from invoice date`,
    valuta: 'Currency',
    afleveradres: 'Delivery address',
    pos: 'Pos.',
    artikel: 'Item',
    uwArtikel: 'Your item no.',
    aantal: 'Qty',
    eenheid: 'Unit',
    prijs: 'Price',
    bedrag: 'Amount',
    leverdatumKort: 'Delivery',
    regels: (n) => `${n} ${n === 1 ? 'line' : 'lines'}`,
    totaal: 'Total excl. VAT',
    opmerkingen: 'Remarks',
    instructie: (nr) =>
      `Please confirm this order and quote our purchase order number ${nr} ` +
      'on your order confirmation, delivery note and invoice.',
    correspondentie: 'Please quote in all correspondence:',
    automatisch: 'This order has been generated automatically and is therefore not signed.',
  },
}

// Eenheden en ons land in de taal van de leverancier.
const EENHEDEN = {
  de: { stuks: 'Stk.', meter: 'm', kg: 'kg', set: 'Satz' },
  en: { stuks: 'pcs', meter: 'm', kg: 'kg', set: 'set' },
}
const NEDERLAND = { nl: 'Nederland', de: 'Niederlande', en: 'the Netherlands' }

function eenheid(tekst, taal) {
  return EENHEDEN[taal]?.[String(tekst || '').toLowerCase()] || tekst
}

// "DAP" -> "DAP — Delivered at Place"; vrije tekst blijft zoals hij is.
function leveringTekst(levering) {
  const code = String(levering || '').trim()
  return LEVERINGSVOORWAARDEN[code.toUpperCase()] ? `${code.toUpperCase()} — ${LEVERINGSVOORWAARDEN[code.toUpperCase()]}` : code
}

function Veld({ label, children }) {
  return (
    <div className="io-veld">
      <div className="io-label">{label}</div>
      <div className="io-waarde">{children || '—'}</div>
    </div>
  )
}

// De A4-pagina van een inkooporder. Wordt gebruikt voor de afdrukpagina én
// voor de PDF-bijlage bij het mailen (zie lib/inkooporderMail.js).
export default function InkooporderDocument({ order, leverancier, regels }) {
  const taal = T[leverancier?.taal] ? leverancier.taal : 'nl'
  const t = T[taal]
  const plaatsregel = [leverancier?.postcode, leverancier?.plaats?.toUpperCase()].filter(Boolean).join(' ')
  const bedrag = (r) => Math.round((Number(r.aantal) || 0) * (Number(r.prijs) || 0) * 100) / 100
  const totaal = regels.reduce((sum, r) => sum + bedrag(r), 0)
  const valuta = leverancier?.valuta || 'EUR'
  const termijn = leverancier?.betalingstermijn
  const contact = order.referentie || leverancier?.contactpersoon

  return (
    <Briefpapier>
      <div className="io-kop">
        <div className="io-titelblok">
          <h1 className="io-titel">{t.titel}</h1>
          <div className="io-nummer">{order.ordernummer}</div>
          <div className="io-datum">{datumLang(order.besteldatum)}</div>
        </div>
        <div className="io-adres">
          <div className="io-adres-naam">{leverancier?.naam || order.leverancierNaam}</div>
          {contact && (
            <div>
              {t.tav} {contact}
            </div>
          )}
          {leverancier?.straat && <div>{leverancier.straat}</div>}
          {plaatsregel && <div>{plaatsregel}</div>}
          {leverancier?.land && !/^(nederland|the netherlands)$/i.test(leverancier.land) && (
            <div>{leverancier.land.toUpperCase()}</div>
          )}
        </div>
      </div>

      <div className="io-gegevens">
        <Veld label={t.besteldatum}>{datumLang(order.besteldatum)}</Veld>
        <Veld label={t.leverancier}>{order.leverancierscode}</Veld>
        <Veld label={t.offerte}>{order.offertenummer}</Veld>
        <Veld label={t.besteldDoor}>
          {order.besteldDoor}
          {order.besteldDoorEmail && <div className="io-klein">{order.besteldDoorEmail}</div>}
        </Veld>
        <Veld label={t.leverdatum}>{datumLang(order.verwachteLeverdatum)}</Veld>
        <Veld label={t.levering}>{leveringTekst(order.levering)}</Veld>
        <Veld label={t.betaling}>{termijn != null && termijn !== '' ? t.betalingTekst(termijn) : ''}</Veld>
        <Veld label={t.valuta}>{valuta}</Veld>
        <div className="io-veld io-veld-breed">
          <div className="io-label">{t.afleveradres}</div>
          <div className="io-waarde">
            {BEDRIJF.naam}, {BEDRIJF.adres.slice(0, 2).join(', ').replace(/\s{2,}/g, ' ')}, {NEDERLAND[taal]}
          </div>
        </div>
      </div>

      <table className="io-regels">
        <thead>
          <tr>
            <th className="io-pos">{t.pos}</th>
            <th>{t.artikel}</th>
            <th className="num">{t.aantal}</th>
            <th>{t.eenheid}</th>
            <th className="num">
              {t.prijs} ({valuta})
            </th>
            <th className="num">
              {t.bedrag} ({valuta})
            </th>
            <th className="num">{t.leverdatumKort}</th>
          </tr>
        </thead>
        <tbody>
          {regels.map((r, i) => (
            <tr key={r.id}>
              <td className="io-pos">{r.regelnummer || (i + 1) * 10}</td>
              <td>
                <div className="io-artikelnummer">{r.artikelnummer}</div>
                <div>{r.artikelnaam}</div>
                {r.leverancierArtikelnummer && (
                  <div className="io-klein">
                    {t.uwArtikel} {r.leverancierArtikelnummer}
                  </div>
                )}
              </td>
              <td className="num">{formatNumber(r.aantal, Number.isInteger(Number(r.aantal)) ? 0 : 2)}</td>
              <td>{eenheid(r.eenheid, taal)}</td>
              <td className="num">{formatPrijs(r.prijs)}</td>
              <td className="num">{formatNumber(bedrag(r), 2)}</td>
              <td className="num">{datumKort(r.leverdatum)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td></td>
            <td className="io-klein">{t.regels(regels.length)}</td>
            <td colSpan={3} className="num io-totaal-label">
              {t.totaal}
            </td>
            <td className="num io-totaal">
              {valuta} {formatNumber(totaal, 2)}
            </td>
            <td></td>
          </tr>
        </tfoot>
      </table>

      {order.opmerkingen && (
        <div className="io-opmerkingen">
          <div className="io-label">{t.opmerkingen}</div>
          <div>{order.opmerkingen}</div>
        </div>
      )}

      <p className="io-instructie">{t.instructie(order.ordernummer)}</p>

      <footer className="afdruk-voet">
        <div className="afdruk-correspondentie">
          <span>{t.correspondentie}</span>
          <strong>
            {order.leverancierscode} - {order.ordernummer}
          </strong>
        </div>
        <div className="afdruk-kleine-letters">{t.automatisch}</div>
      </footer>
    </Briefpapier>
  )
}

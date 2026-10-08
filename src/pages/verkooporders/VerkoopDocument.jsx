import { formatNumber, formatPrijs } from '../../lib/format'
import { adresLabel, berekenTotalen, btwPercentage, btwVermelding } from '../../lib/verkooporders'
import { BEDRIJF, datumKort, datumLang } from '../inkooporders/bedrijf'
import Briefpapier from '../inkooporders/Briefpapier'
import '../inkooporders/afdruk.css'

// Teksten op de documenten, in de taal van de klant (veld `taal`).
const T = {
  nl: {
    bevestiging: 'Orderbevestiging',
    pakbon: 'Pakbon',
    factuur: 'Factuur',
    uwReferentie: 'Uw referentie',
    contactpersoon: 'Contactpersoon',
    behandeldDoor: 'Behandeld door',
    klant: 'Klantnummer',
    ordernummer: 'Ordernummer',
    orderdatum: 'Orderdatum',
    pakbonnummer: 'Pakbonnummer',
    leverdatum: 'Leverdatum',
    factuurnummer: 'Factuurnummer',
    factuurdatum: 'Factuurdatum',
    vervaldatum: 'Vervaldatum',
    levering: 'Levering',
    leveringswijze: 'Verzendwijze',
    btwNummerKlant: 'Uw BTW-nummer',
    aantal: 'Aantal',
    artikel: ['Artikelnummer', 'Omschrijving', 'Uw artikelnummer'],
    prijs: 'Prijs',
    bedrag: 'Bedrag',
    btw: 'BTW',
    besteld: 'Besteld',
    nogTeLeveren: 'Nog te leveren',
    totaalExcl: 'Totaal excl. BTW',
    btwOver: (pct, grondslag) => `BTW ${pct}% over ${grondslag}`,
    totaalIncl: 'Totaal incl. BTW',
    afleveradres: 'Afleveradres',
    betaling: (dagen, nr) =>
      `Gelieve het totaalbedrag binnen ${dagen} dagen na factuurdatum over te maken onder vermelding van factuurnummer ${nr}.`,
    correspondentie: 'Gelieve bij alle correspondentie te vermelden:',
    ontvangen: 'Goederen in goede orde ontvangen (naam, datum, handtekening):',
    voorwaarden:
      'Op al onze transacties zijn uitsluitend onze leverings- en betalingsvoorwaarden van toepassing (www.fmid.nl).',
  },
  de: {
    bevestiging: 'Auftragsbestätigung',
    pakbon: 'Lieferschein',
    factuur: 'Rechnung',
    uwReferentie: 'Ihre Referenz',
    contactpersoon: 'Ansprechpartner',
    behandeldDoor: 'Bearbeitet von',
    klant: 'Kundennummer',
    ordernummer: 'Auftragsnummer',
    orderdatum: 'Auftragsdatum',
    pakbonnummer: 'Lieferscheinnummer',
    leverdatum: 'Lieferdatum',
    factuurnummer: 'Rechnungsnummer',
    factuurdatum: 'Rechnungsdatum',
    vervaldatum: 'Fällig am',
    levering: 'Lieferbedingung',
    leveringswijze: 'Versandart',
    btwNummerKlant: 'Ihre USt-IdNr.',
    aantal: 'Menge',
    artikel: ['Artikelnummer', 'Bezeichnung', 'Ihre Artikelnummer'],
    prijs: 'Preis',
    bedrag: 'Betrag',
    btw: 'MwSt.',
    besteld: 'Bestellt',
    nogTeLeveren: 'Rückstand',
    totaalExcl: 'Summe netto',
    btwOver: (pct, grondslag) => `MwSt. ${pct}% auf ${grondslag}`,
    totaalIncl: 'Gesamtbetrag',
    afleveradres: 'Lieferadresse',
    betaling: (dagen, nr) =>
      `Bitte überweisen Sie den Gesamtbetrag innerhalb von ${dagen} Tagen nach Rechnungsdatum unter Angabe der Rechnungsnummer ${nr}.`,
    correspondentie: 'Bitte bei jeglicher Korrespondenz angeben:',
    ontvangen: 'Ware in einwandfreiem Zustand erhalten (Name, Datum, Unterschrift):',
    voorwaarden: 'Für alle Geschäfte gelten ausschließlich unsere Liefer- und Zahlungsbedingungen (www.fmid.nl).',
  },
  en: {
    bevestiging: 'Order confirmation',
    pakbon: 'Packing slip',
    factuur: 'Invoice',
    uwReferentie: 'Your reference',
    contactpersoon: 'Contact',
    behandeldDoor: 'Handled by',
    klant: 'Customer number',
    ordernummer: 'Order number',
    orderdatum: 'Order date',
    pakbonnummer: 'Packing slip no.',
    leverdatum: 'Delivery date',
    factuurnummer: 'Invoice number',
    factuurdatum: 'Invoice date',
    vervaldatum: 'Due date',
    levering: 'Delivery terms',
    leveringswijze: 'Shipping method',
    btwNummerKlant: 'Your VAT number',
    aantal: 'Quantity',
    artikel: ['Item number', 'Description', 'Your item number'],
    prijs: 'Price',
    bedrag: 'Amount',
    btw: 'VAT',
    besteld: 'Ordered',
    nogTeLeveren: 'Backorder',
    totaalExcl: 'Total excl. VAT',
    btwOver: (pct, grondslag) => `VAT ${pct}% on ${grondslag}`,
    totaalIncl: 'Total incl. VAT',
    afleveradres: 'Delivery address',
    betaling: (dagen, nr) =>
      `Please pay the total amount within ${dagen} days of the invoice date, quoting invoice number ${nr}.`,
    correspondentie: 'Please quote in all correspondence:',
    ontvangen: 'Goods received in good order (name, date, signature):',
    voorwaarden: 'All our transactions are subject exclusively to our terms of delivery and payment (www.fmid.nl).',
  },
}

function bedrag(value) {
  return formatNumber(value, 2)
}

function Adres({ adres }) {
  if (!adres) return null
  const plaatsregel = [adres.postcode, adres.plaats?.toUpperCase()].filter(Boolean).join(' ')
  return (
    <>
      <div>{adres.naam}</div>
      {adres.straat && <div>{adres.straat}</div>}
      {plaatsregel && <div>{plaatsregel}</div>}
      {adres.land && !/^(nederland|the netherlands)$/i.test(adres.land) && <div>{adres.land.toUpperCase()}</div>}
    </>
  )
}

// De A4-pagina van een orderbevestiging, pakbon of factuur. Wordt gebruikt
// voor de afdrukpagina én voor de PDF-bijlage bij het mailen
// (zie lib/verkoopMail.js). `document` is de pakbon of factuur; bij een
// orderbevestiging is er alleen de order met regels.
export default function VerkoopDocument({ soort, order, klant, regels, document: d }) {
  const taal = d?.taal || order?.taal || klant?.taal || 'nl'
  const t = T[taal] || T.nl
  const valuta = d?.valuta || order?.valuta || 'EUR'
  const btwGroep = d?.btwGroep || order?.btwGroep || 'NL'

  const adres =
    soort === 'pakbon'
      ? d?.leveradres
      : soort === 'factuur'
        ? d?.factuuradres
        : order?.factuuradres || order?.leveradres
  // Bij een orderbevestiging met een apart leveradres: dat leveradres ook tonen.
  const afwijkendLeveradres =
    soort === 'bevestiging' &&
    order?.leveradres &&
    JSON.stringify(order.leveradres) !== JSON.stringify(adres) &&
    order.leveradres

  const prijsRegels =
    soort === 'factuur'
      ? regels
      : regels.map((r) => ({ ...r, btwPercentage: btwPercentage(r.btwGroep, btwGroep) }))
  const totalen = soort === 'factuur' ? d : berekenTotalen(prijsRegels)
  const nummer = soort === 'factuur' ? d.factuurnummer : soort === 'pakbon' ? d.pakbonnummer : order.ordernummer
  const vermelding = soort !== 'pakbon' ? btwVermelding(btwGroep, taal) : ''

  return (
    <Briefpapier>
      <div className="afdruk-adres">
        <Adres adres={adres} />
      </div>

      <h1 className="afdruk-titel">{t[soort]}</h1>

      <div className="afdruk-gegevens">
        <dl>
          <dt>{t.uwReferentie}</dt>
          <dd>{d?.referentie ?? order?.referentie}</dd>
          {soort === 'bevestiging' && (
            <>
              <dt>{t.contactpersoon}</dt>
              <dd>{order.contactpersoon}</dd>
              <dt>{t.behandeldDoor}</dt>
              <dd>{order.verkoper}</dd>
            </>
          )}
          <dt>{t.klant}</dt>
          <dd>{d?.klantcode || order?.klantcode}</dd>
          {soort === 'factuur' && d.btwNummer && (
            <>
              <dt>{t.btwNummerKlant}</dt>
              <dd>{d.btwNummer}</dd>
            </>
          )}
        </dl>
        <dl>
          <dt>
            <strong>{t[`${soort === 'bevestiging' ? 'order' : soort}nummer`]}</strong>
          </dt>
          <dd>
            <strong>{nummer}</strong>
          </dd>
          {soort !== 'bevestiging' && (
            <>
              <dt>{t.ordernummer}</dt>
              <dd>{d.ordernummer}</dd>
            </>
          )}
          {soort === 'bevestiging' && (
            <>
              <dt>{t.orderdatum}</dt>
              <dd>{datumLang(order.orderdatum)}</dd>
              <dt>{t.levering}</dt>
              <dd>{order.leveringsvoorwaarde}</dd>
            </>
          )}
          {soort === 'pakbon' && (
            <>
              <dt>{t.leverdatum}</dt>
              <dd>{datumLang(d.leverdatum)}</dd>
              {d.leveringswijze && (
                <>
                  <dt>{t.leveringswijze}</dt>
                  <dd>{d.leveringswijze}</dd>
                </>
              )}
            </>
          )}
          {soort === 'factuur' && (
            <>
              <dt>{t.factuurdatum}</dt>
              <dd>{datumLang(d.factuurdatum)}</dd>
              <dt>{t.vervaldatum}</dt>
              <dd>{datumLang(d.vervaldatum)}</dd>
            </>
          )}
        </dl>
      </div>

      {afwijkendLeveradres && (
        <div className="afdruk-leveradres">
          <strong>{t.afleveradres}:</strong> {adresLabel(afwijkendLeveradres)}
          {afwijkendLeveradres.land && `, ${afwijkendLeveradres.land}`}
        </div>
      )}

      <table className="afdruk-regels">
        <thead>
          <tr>
            <th className="num">{t.aantal}</th>
            <th></th>
            <th>
              {t.artikel[0]}
              <br />
              {t.artikel[1]}
              <br />
              {t.artikel[2]}
            </th>
            {soort === 'pakbon' ? (
              <>
                <th className="num">{t.besteld}</th>
                <th className="num">{t.nogTeLeveren}</th>
              </>
            ) : (
              <>
                <th className="num">
                  {t.prijs}
                  <br />
                  {valuta}
                </th>
                <th className="num">
                  {t.bedrag}
                  <br />
                  {valuta}
                </th>
                {soort === 'factuur' ? (
                  <th className="num">{t.btw}</th>
                ) : (
                  <th className="num">{t.leverdatum}</th>
                )}
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {prijsRegels.map((r) => (
            <tr key={r.regelId || r.id}>
              <td className="num">{formatNumber(r.aantal, Number.isInteger(Number(r.aantal)) ? 0 : 2)}</td>
              <td>{r.eenheid}</td>
              <td>
                <div>{r.artikelnummer}</div>
                <div>{r.artikelnaam}</div>
                {r.klantArtikelnummer && <div>{r.klantArtikelnummer}</div>}
              </td>
              {soort === 'pakbon' ? (
                <>
                  <td className="num">{formatNumber(r.besteld)}</td>
                  <td className="num">{r.nogTeLeveren ? formatNumber(r.nogTeLeveren) : ''}</td>
                </>
              ) : (
                <>
                  <td className="num">{formatPrijs(r.prijs)}</td>
                  <td className="num">{bedrag((Number(r.aantal) || 0) * (Number(r.prijs) || 0))}</td>
                  {soort === 'factuur' ? (
                    <td className="num">{r.btwPercentage}%</td>
                  ) : (
                    <td className="num">{datumKort(r.leverdatum)}</td>
                  )}
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {soort !== 'pakbon' && (
        <div className="afdruk-totalen">
          <div>
            <span>{t.totaalExcl}</span>
            <span>
              {valuta} {bedrag(totalen.netto)}
            </span>
          </div>
          {totalen.btw.map((b) => (
            <div key={b.percentage}>
              <span>{t.btwOver(b.percentage, `${valuta} ${bedrag(b.grondslag)}`)}</span>
              <span>
                {valuta} {bedrag(b.bedrag)}
              </span>
            </div>
          ))}
          <div className="afdruk-totalen-eind">
            <span>{t.totaalIncl}</span>
            <span>
              {valuta} {bedrag(totalen.totaal)}
            </span>
          </div>
        </div>
      )}

      {vermelding && <p className="afdruk-opmerkingen">{vermelding}</p>}
      {soort === 'bevestiging' && order.opmerkingen && <p className="afdruk-opmerkingen">{order.opmerkingen}</p>}
      {soort === 'factuur' && (
        <p className="afdruk-opmerkingen">
          {t.betaling(d.betalingstermijn, d.factuurnummer)}
          {BEDRIJF.iban && (
            <>
              <br />
              IBAN {BEDRIJF.iban}
              {BEDRIJF.bic && ` — BIC ${BEDRIJF.bic}`} — {BEDRIJF.naam}
            </>
          )}
        </p>
      )}
      {soort === 'pakbon' && <p className="afdruk-ontvangen">{t.ontvangen}</p>}

      <footer className="afdruk-voet">
        <div className="afdruk-correspondentie">
          <span>{t.correspondentie}</span>
          <strong>
            {d?.klantcode || order?.klantcode} - {nummer}
          </strong>
        </div>
        <div className="afdruk-kleine-letters">{t.voorwaarden}</div>
      </footer>
    </Briefpapier>
  )
}

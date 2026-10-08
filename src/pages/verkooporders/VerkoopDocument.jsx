import { formatNumber, formatPrijs } from '../../lib/format'
import { adresLabel, berekenTotalen, btwPercentage, btwVermelding } from '../../lib/verkooporders'
import { BEDRIJF, datumKort, datumLang } from '../inkooporders/bedrijf'
import Briefpapier from '../inkooporders/Briefpapier'
import { Veld, eenheid, landNaam, landRegel, leveringTekst } from '../inkooporders/documentDelen'
import '../inkooporders/afdruk.css'

// Teksten op de documenten, in de taal van de klant (veld `taal`).
const T = {
  nl: {
    bevestiging: 'Orderbevestiging',
    pakbon: 'Pakbon',
    factuur: 'Factuur',
    tav: 't.a.v.',
    uwReferentie: 'Uw referentie',
    behandeldDoor: 'Behandeld door',
    klant: 'Klantnr.',
    ordernummer: 'Ordernummer',
    orderdatum: 'Orderdatum',
    leverdatum: 'Leverdatum',
    gewensteLeverdatum: 'Gewenste leverdatum',
    factuurdatum: 'Factuurdatum',
    vervaldatum: 'Vervaldatum',
    levering: 'Levering',
    leveringswijze: 'Verzendwijze',
    betaling: 'Betaling',
    betalingTekst: (d) => `${d} dagen na factuurdatum`,
    valuta: 'Valuta',
    btwNummerKlant: 'Uw BTW-nummer',
    afleveradres: 'Afleveradres',
    pos: 'Pos.',
    artikel: 'Artikelnr.',
    omschrijving: 'Omschrijving',
    uwArtikel: 'Uw art.nr.',
    aantal: 'Aantal',
    geleverd: 'Geleverd',
    eenheid: 'Eenh.',
    prijs: 'Prijs',
    bedrag: 'Bedrag',
    btw: 'BTW',
    besteld: 'Besteld',
    nogTeLeveren: 'Nog te leveren',
    regels: (n) => `${n} ${n === 1 ? 'regel' : 'regels'}`,
    totaalExcl: 'Totaal excl. BTW',
    btwOver: (pct, grondslag) => `BTW ${pct}% over ${grondslag}`,
    totaalIncl: 'Totaal incl. BTW',
    opmerkingen: 'Opmerkingen',
    betalingInstructie: (dagen, nr) =>
      `Gelieve het totaalbedrag binnen ${dagen} dagen na factuurdatum over te maken onder vermelding van factuurnummer ${nr}.`,
    bevestigingInstructie: 'Wilt u deze orderbevestiging controleren en ons laten weten als er iets niet klopt?',
    correspondentie: 'Gelieve bij alle correspondentie te vermelden:',
    ontvangen: 'Goederen in goede orde ontvangen (naam, datum, handtekening):',
    voorwaarden:
      'Op al onze transacties zijn uitsluitend onze leverings- en betalingsvoorwaarden van toepassing (www.fmid.nl).',
  },
  de: {
    bevestiging: 'Auftragsbestätigung',
    pakbon: 'Lieferschein',
    factuur: 'Rechnung',
    tav: 'z. Hd.',
    uwReferentie: 'Ihre Referenz',
    behandeldDoor: 'Bearbeitet von',
    klant: 'Kunden-Nr.',
    ordernummer: 'Auftragsnummer',
    orderdatum: 'Auftragsdatum',
    leverdatum: 'Lieferdatum',
    gewensteLeverdatum: 'Liefertermin',
    factuurdatum: 'Rechnungsdatum',
    vervaldatum: 'Fällig am',
    levering: 'Lieferbedingung',
    leveringswijze: 'Versandart',
    betaling: 'Zahlung',
    betalingTekst: (d) => `${d} Tage nach Rechnungsdatum`,
    valuta: 'Währung',
    btwNummerKlant: 'Ihre USt-IdNr.',
    afleveradres: 'Lieferadresse',
    pos: 'Pos.',
    artikel: 'Artikel-Nr.',
    omschrijving: 'Bezeichnung',
    uwArtikel: 'Ihre Art.-Nr.',
    aantal: 'Menge',
    geleverd: 'Geliefert',
    eenheid: 'Einh.',
    prijs: 'Preis',
    bedrag: 'Betrag',
    btw: 'MwSt.',
    besteld: 'Bestellt',
    nogTeLeveren: 'Rückstand',
    regels: (n) => `${n} ${n === 1 ? 'Position' : 'Positionen'}`,
    totaalExcl: 'Summe netto',
    btwOver: (pct, grondslag) => `MwSt. ${pct}% auf ${grondslag}`,
    totaalIncl: 'Gesamtbetrag',
    opmerkingen: 'Bemerkungen',
    betalingInstructie: (dagen, nr) =>
      `Bitte überweisen Sie den Gesamtbetrag innerhalb von ${dagen} Tagen nach Rechnungsdatum unter Angabe der Rechnungsnummer ${nr}.`,
    bevestigingInstructie: 'Bitte prüfen Sie diese Auftragsbestätigung und teilen Sie uns eventuelle Abweichungen mit.',
    correspondentie: 'Bitte bei jeglicher Korrespondenz angeben:',
    ontvangen: 'Ware in einwandfreiem Zustand erhalten (Name, Datum, Unterschrift):',
    voorwaarden: 'Für alle Geschäfte gelten ausschließlich unsere Liefer- und Zahlungsbedingungen (www.fmid.nl).',
  },
  en: {
    bevestiging: 'Order confirmation',
    pakbon: 'Packing slip',
    factuur: 'Invoice',
    tav: 'Attn.',
    uwReferentie: 'Your reference',
    behandeldDoor: 'Handled by',
    klant: 'Customer no.',
    ordernummer: 'Order number',
    orderdatum: 'Order date',
    leverdatum: 'Delivery date',
    gewensteLeverdatum: 'Requested delivery',
    factuurdatum: 'Invoice date',
    vervaldatum: 'Due date',
    levering: 'Delivery terms',
    leveringswijze: 'Shipping method',
    betaling: 'Payment',
    betalingTekst: (d) => `${d} days from invoice date`,
    valuta: 'Currency',
    btwNummerKlant: 'Your VAT number',
    afleveradres: 'Delivery address',
    pos: 'Pos.',
    artikel: 'Item no.',
    omschrijving: 'Description',
    uwArtikel: 'Your item no.',
    aantal: 'Qty',
    geleverd: 'Delivered',
    eenheid: 'Unit',
    prijs: 'Price',
    bedrag: 'Amount',
    btw: 'VAT',
    besteld: 'Ordered',
    nogTeLeveren: 'Backorder',
    regels: (n) => `${n} ${n === 1 ? 'line' : 'lines'}`,
    totaalExcl: 'Total excl. VAT',
    btwOver: (pct, grondslag) => `VAT ${pct}% on ${grondslag}`,
    totaalIncl: 'Total incl. VAT',
    opmerkingen: 'Remarks',
    betalingInstructie: (dagen, nr) =>
      `Please pay the total amount within ${dagen} days of the invoice date, quoting invoice number ${nr}.`,
    bevestigingInstructie: 'Please check this order confirmation and let us know if anything is incorrect.',
    correspondentie: 'Please quote in all correspondence:',
    ontvangen: 'Goods received in good order (name, date, signature):',
    voorwaarden: 'All our transactions are subject exclusively to our terms of delivery and payment (www.fmid.nl).',
  },
}

function bedrag(value) {
  return formatNumber(value, 2)
}

function aantal(value) {
  return formatNumber(value, Number.isInteger(Number(value)) ? 0 : 2)
}

function Adres({ adres, tav, t, taal }) {
  if (!adres) return null
  const plaatsregel = [adres.postcode, adres.plaats?.toUpperCase()].filter(Boolean).join(' ')
  return (
    <div className="doc-adres">
      <div className="doc-adres-naam">{adres.naam}</div>
      {tav && (
        <div>
          {t.tav} {tav}
        </div>
      )}
      {adres.straat && <div>{adres.straat}</div>}
      {plaatsregel && <div>{plaatsregel}</div>}
      {landRegel(adres.land, taal) && <div>{landRegel(adres.land, taal)}</div>}
    </div>
  )
}

// De A4-pagina van een orderbevestiging, pakbon of factuur, in dezelfde opmaak
// als de inkooporder. Wordt gebruikt voor de afdrukpagina én voor de
// PDF-bijlage bij het mailen (zie lib/verkoopMail.js). `document` is de pakbon
// of factuur; bij een orderbevestiging is er alleen de order met regels.
export default function VerkoopDocument({ soort, order, klant, regels, document: d }) {
  const taal = T[d?.taal || order?.taal || klant?.taal] ? d?.taal || order?.taal || klant?.taal : 'nl'
  const t = T[taal]
  const valuta = d?.valuta || order?.valuta || 'EUR'
  const btwGroep = d?.btwGroep || order?.btwGroep || 'NL'
  const referentie = d?.referentie ?? order?.referentie
  const klantcode = d?.klantcode || order?.klantcode
  const contact = order?.contactpersoon || klant?.contactpersoon

  const adres =
    soort === 'pakbon' ? d?.leveradres : soort === 'factuur' ? d?.factuuradres : order?.factuuradres || order?.leveradres
  const leveradres = order?.leveradres

  const prijsRegels =
    soort === 'factuur' ? regels : regels.map((r) => ({ ...r, btwPercentage: btwPercentage(r.btwGroep, btwGroep) }))
  const totalen = soort === 'factuur' ? d : berekenTotalen(prijsRegels)
  const nummer = soort === 'factuur' ? d.factuurnummer : soort === 'pakbon' ? d.pakbonnummer : order.ordernummer
  const datum = soort === 'factuur' ? d.factuurdatum : soort === 'pakbon' ? d.leverdatum : order.orderdatum
  const vermelding = soort !== 'pakbon' ? btwVermelding(btwGroep, taal) : ''
  const termijn = d?.betalingstermijn ?? order?.betalingstermijn

  return (
    <Briefpapier>
      <div className="doc-kop">
        <div className="doc-titelblok">
          <h1 className="doc-titel">{t[soort]}</h1>
          <div className="doc-nummer">{nummer}</div>
          <div className="doc-datum">{datumLang(datum)}</div>
        </div>
        <Adres adres={adres} tav={soort !== 'pakbon' ? contact : ''} t={t} taal={taal} />
      </div>

      <div className="doc-gegevens">
        {soort === 'bevestiging' && (
          <>
            <Veld label={t.orderdatum}>{datumLang(order.orderdatum)}</Veld>
            <Veld label={t.klant}>{klantcode}</Veld>
            <Veld label={t.uwReferentie}>{referentie}</Veld>
            <Veld label={t.behandeldDoor}>{order.verkoper}</Veld>
            <Veld label={t.valuta}>{valuta}</Veld>
            <Veld label={t.gewensteLeverdatum}>{datumLang(order.gewensteLeverdatum)}</Veld>
            <Veld label={t.levering}>
              {[leveringTekst(order.leveringsvoorwaarde), order.leveringswijze].filter(Boolean).join(' · ')}
            </Veld>
            <Veld label={t.betaling}>{termijn != null && termijn !== '' ? t.betalingTekst(termijn) : ''}</Veld>
            <div className="doc-veld doc-veld-breed">
              <div className="doc-label">{t.afleveradres}</div>
              <div className="doc-waarde">
                {leveradres ? [adresLabel(leveradres), landNaam(leveradres.land, taal)].filter(Boolean).join(', ') : '—'}
              </div>
            </div>
          </>
        )}
        {soort === 'pakbon' && (
          <>
            <Veld label={t.leverdatum}>{datumLang(d.leverdatum)}</Veld>
            <Veld label={t.ordernummer}>{d.ordernummer}</Veld>
            <Veld label={t.klant}>{klantcode}</Veld>
            <Veld label={t.uwReferentie}>{referentie}</Veld>
            <Veld label={t.leveringswijze}>{d.leveringswijze}</Veld>
          </>
        )}
        {soort === 'factuur' && (
          <>
            <Veld label={t.factuurdatum}>{datumLang(d.factuurdatum)}</Veld>
            <Veld label={t.vervaldatum}>{datumLang(d.vervaldatum)}</Veld>
            <Veld label={t.ordernummer}>{d.ordernummer}</Veld>
            <Veld label={t.klant}>{klantcode}</Veld>
            <Veld label={t.uwReferentie}>{referentie}</Veld>
            <Veld label={t.betaling}>{t.betalingTekst(d.betalingstermijn)}</Veld>
            <Veld label={t.valuta}>{valuta}</Veld>
            <Veld label={t.btwNummerKlant}>{d.btwNummer}</Veld>
          </>
        )}
      </div>

      <table className="doc-regels">
        <thead>
          <tr>
            <th className="doc-pos">{t.pos}</th>
            <th>{t.artikel}</th>
            <th>{t.omschrijving}</th>
            <th>{t.uwArtikel}</th>
            {soort === 'pakbon' ? (
              <>
                <th className="num">{t.besteld}</th>
                <th className="num">{t.geleverd}</th>
                <th>{t.eenheid}</th>
                <th className="num">{t.nogTeLeveren}</th>
              </>
            ) : (
              <>
                <th className="num">{t.aantal}</th>
                <th>{t.eenheid}</th>
                <th className="num">{t.prijs}</th>
                <th className="num">{t.bedrag}</th>
                <th className="num">{soort === 'factuur' ? t.btw : t.leverdatum}</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {prijsRegels.map((r, i) => (
            <tr key={r.regelId || r.id}>
              <td className="doc-pos">{r.regelnummer || (i + 1) * 10}</td>
              <td className="doc-artikelnummer doc-nowrap">{r.artikelnummer}</td>
              <td>{r.artikelnaam}</td>
              <td className="doc-nowrap">{r.klantArtikelnummer}</td>
              {soort === 'pakbon' ? (
                <>
                  <td className="num">{aantal(r.besteld)}</td>
                  <td className="num doc-artikelnummer">{aantal(r.aantal)}</td>
                  <td className="doc-nowrap">{eenheid(r.eenheid, taal)}</td>
                  <td className="num">{r.nogTeLeveren ? aantal(r.nogTeLeveren) : ''}</td>
                </>
              ) : (
                <>
                  <td className="num">{aantal(r.aantal)}</td>
                  <td className="doc-nowrap">{eenheid(r.eenheid, taal)}</td>
                  <td className="num">{formatPrijs(r.prijs)}</td>
                  <td className="num">{bedrag((Number(r.aantal) || 0) * (Number(r.prijs) || 0))}</td>
                  <td className="num">{soort === 'factuur' ? `${r.btwPercentage}%` : datumKort(r.leverdatum)}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td></td>
            <td colSpan={3} className="doc-klein">
              {t.regels(prijsRegels.length)}
            </td>
            <td colSpan={soort === 'pakbon' ? 4 : 5}></td>
          </tr>
        </tfoot>
      </table>

      {soort !== 'pakbon' && (
        <div className="doc-totalen">
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
          <div className="doc-totalen-eind">
            <span>{t.totaalIncl}</span>
            <span>
              {valuta} {bedrag(totalen.totaal)}
            </span>
          </div>
        </div>
      )}

      {vermelding && <p className="doc-vermelding">{vermelding}</p>}

      {soort === 'bevestiging' && order.opmerkingen && (
        <div className="doc-opmerkingen">
          <div className="doc-label">{t.opmerkingen}</div>
          <div>{order.opmerkingen}</div>
        </div>
      )}

      {soort === 'bevestiging' && <p className="doc-instructie">{t.bevestigingInstructie}</p>}
      {soort === 'factuur' && (
        <p className="doc-instructie doc-betaling">
          {t.betalingInstructie(d.betalingstermijn, d.factuurnummer)}
          {BEDRIJF.iban && (
            <>
              <br />
              IBAN <strong>{BEDRIJF.iban}</strong>
              {BEDRIJF.bic && ` · BIC ${BEDRIJF.bic}`} · {BEDRIJF.naam}
            </>
          )}
        </p>
      )}
      {soort === 'pakbon' && <p className="doc-ontvangen">{t.ontvangen}</p>}

      <footer className="afdruk-voet">
        <div className="afdruk-correspondentie">
          <span>{t.correspondentie}</span>
          <strong>
            {klantcode} - {nummer}
          </strong>
        </div>
        <div className="afdruk-kleine-letters">{t.voorwaarden}</div>
      </footer>
    </Briefpapier>
  )
}

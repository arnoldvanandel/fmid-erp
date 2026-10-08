import { formatNumber } from '../../lib/format'
import './afdruk.css'

// Bedrijfsgegevens zoals ze op de Axapta-inkooporder stonden. Ook gebruikt
// door de verkoopdocumenten (orderbevestiging, pakbon, factuur).
export const BEDRIJF = {
  naam: 'F.M.I. Dussen B.V.',
  adres: ['Loswal 5', '4271 BA  Dussen', 'The Netherlands'],
  telefoon: '+31 (0)416 39 22 33',
  fax: '+31 (0)416 39 21 26',
  email: 'info@fmid.nl',
  website: 'www.fmid.nl',
  // Verplicht op een factuur. Nog in te vullen; lege velden worden niet getoond.
  btwNummer: '',
  kvkNummer: '',
  iban: '',
  bic: '',
}

// "2026-10-01" -> "1-10-2026" (kop) of "01-10-26" (regels), zoals op de oude order.
export function datumLang(iso) {
  if (!iso) return ''
  const [j, m, d] = iso.split('-')
  return `${Number(d)}-${Number(m)}-${j}`
}

export function datumKort(iso) {
  if (!iso) return ''
  const [j, m, d] = iso.split('-')
  return `${d}-${m}-${j.slice(2)}`
}

function prijs(value) {
  return formatNumber(value, 2)
}

// De A4-pagina van een inkooporder. Wordt gebruikt voor de afdrukpagina én
// voor de PDF-bijlage bij het mailen (zie lib/inkooporderMail.js).
export default function InkooporderDocument({ order, leverancier, regels }) {
  const plaatsregel = [leverancier?.postcode, leverancier?.plaats?.toUpperCase()].filter(Boolean).join(' ')
  const totaal = regels.reduce((sum, r) => sum + (Number(r.aantal) || 0) * (Number(r.prijs) || 0), 0)
  const valuta = leverancier?.valuta || 'EUR'

  return (
    <div className="afdruk-pagina">
      <header className="afdruk-kop">
        <img src="/fmid-logo.png" alt="FMID" className="afdruk-logo" />
        <div className="afdruk-bedrijf">
          <div>
            <strong>{BEDRIJF.naam}</strong>
            {BEDRIJF.adres.map((r) => (
              <div key={r}>{r}</div>
            ))}
          </div>
          <div>
            <div>Tel: {BEDRIJF.telefoon}</div>
            <div>Fax: {BEDRIJF.fax}</div>
            <div>{BEDRIJF.email}</div>
            <div>{BEDRIJF.website}</div>
          </div>
        </div>
      </header>

      <div className="afdruk-adres">
        <div>{leverancier?.naam || order.leverancierNaam}</div>
        {leverancier?.straat && <div>{leverancier.straat}</div>}
        {plaatsregel && <div>{plaatsregel}</div>}
        {leverancier?.land && !/^(nederland|the netherlands)$/i.test(leverancier.land) && (
          <div>{leverancier.land.toUpperCase()}</div>
        )}
      </div>

      <h1 className="afdruk-titel">Inkooporder</h1>

      <div className="afdruk-gegevens">
        <dl>
          <dt>Uw referentie</dt>
          <dd>{order.referentie}</dd>
          <dt>Besteld door</dt>
          <dd>{order.besteldDoor}</dd>
          <dt>Leverancier</dt>
          <dd>{order.leverancierscode}</dd>
        </dl>
        <dl>
          <dt>
            <strong>Inkoopordernr</strong>
          </dt>
          <dd>
            <strong>{order.ordernummer}</strong>
          </dd>
          <dt>Besteldatum</dt>
          <dd>{datumLang(order.besteldatum)}</dd>
          <dt>Levering</dt>
          <dd>{order.levering}</dd>
        </dl>
      </div>

      <table className="afdruk-regels">
        <thead>
          <tr>
            <th className="num">Aantal</th>
            <th></th>
            <th>
              Artikelnummer
              <br />
              Omschrijving
              <br />
              Artikelnummer leverancier
            </th>
            <th className="num">
              Netto prijs
              <br />
              {valuta}
            </th>
            <th className="num">Leverdatum</th>
          </tr>
        </thead>
        <tbody>
          {regels.map((r) => (
            <tr key={r.id}>
              <td className="num">{formatNumber(r.aantal)}</td>
              <td>{r.eenheid}</td>
              <td>
                <div>{r.artikelnummer}</div>
                <div>{r.artikelnaam}</div>
                {r.leverancierArtikelnummer && <div>{r.leverancierArtikelnummer}</div>}
              </td>
              <td className="num">{prijs(r.prijs)}</td>
              <td className="num">{datumKort(r.leverdatum)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {totaal > 0 && (
        <div className="afdruk-totaal">
          Totaal excl. btw: <strong>{valuta} {prijs(totaal)}</strong>
        </div>
      )}

      {order.opmerkingen && <p className="afdruk-opmerkingen">{order.opmerkingen}</p>}

      <footer className="afdruk-voet">
        <div className="afdruk-correspondentie">
          <span>Gelieve bij alle correspondentie te vermelden:</span>
          <strong>
            {order.leverancierscode} - {order.ordernummer}
          </strong>
        </div>
        <div className="afdruk-kleine-letters">
          Deze bestelling is automatisch aangemaakt en daarom niet voorzien van een handtekening
        </div>
      </footer>
    </div>
  )
}

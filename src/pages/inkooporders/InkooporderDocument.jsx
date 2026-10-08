import { formatNumber } from '../../lib/format'
import Briefpapier from './Briefpapier'
import { datumKort, datumLang } from './bedrijf'
import './afdruk.css'

// Voor bestaande imports elders.
export { BEDRIJF, datumKort, datumLang } from './bedrijf'

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
    <Briefpapier>
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
    </Briefpapier>
  )
}

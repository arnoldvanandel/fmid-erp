import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { formatDateTime, formatNumber } from '../../lib/format'
import { maakPicklijst } from '../../lib/picklijst'
import { adresLabel } from '../../lib/verkooporders'
import { datumLang } from '../inkooporders/bedrijf'
import { Veld, leveringTekst } from '../inkooporders/documentDelen'
import '../inkooporders/afdruk.css'

function aantal(v) {
  return formatNumber(v, Number.isInteger(Number(v)) ? 0 : 2)
}

// Picklijst voor het magazijn (intern, A4): wat er voor een verkooporder
// gepickt moet worden, per locatie op looproute, met vakjes om af te vinken.
// Boekt niets; de voorraad gaat pas af bij het maken van de pakbon.
export default function PicklijstAfdruk() {
  const { id } = useParams()
  const [lijst, setLijst] = useState(null)
  const [error, setError] = useState(null)
  const [gemaaktOp] = useState(() => new Date())

  useEffect(() => {
    let actief = true
    maakPicklijst(id)
      .then((l) => actief && setLijst(l))
      .catch((err) => actief && setError(err.message))
    return () => {
      actief = false
    }
  }, [id])

  useEffect(() => {
    if (lijst) document.title = `Picklijst ${lijst.order.ordernummer}`
  }, [lijst])

  if (error) {
    return (
      <div className="center-screen">
        <div className="banner banner-danger">{error}</div>
      </div>
    )
  }
  if (!lijst) {
    return (
      <div className="center-screen">
        <div className="spinner" />
      </div>
    )
  }

  const { order, picks, tekorten } = lijst
  const locaties = new Set(picks.map((p) => p.locatieCode)).size

  return (
    <div className="afdruk-scherm">
      <div className="afdruk-toolbar">
        <button className="btn btn-primary" onClick={() => window.print()}>
          Afdrukken / opslaan als PDF
        </button>
      </div>

      <div className="afdruk-pagina pick-pagina">
        <div className="doc-kop">
          <div className="doc-titelblok">
            <h1 className="doc-titel">Picklijst</h1>
            <div className="doc-nummer">{order.ordernummer}</div>
            <div className="doc-datum">Gemaakt {formatDateTime(gemaaktOp)}</div>
          </div>
          <img src="/fmid-logo.png" alt="FMID" className="pick-logo" />
        </div>

        <div className="doc-gegevens">
          <Veld label="Klant">
            {order.klantcode} — {order.klantNaam}
          </Veld>
          <Veld label="Uw referentie">{order.referentie}</Veld>
          <Veld label="Gewenste leverdatum">{datumLang(order.gewensteLeverdatum)}</Veld>
          <Veld label="Levering">
            {[leveringTekst(order.leveringsvoorwaarde), order.leveringswijze].filter(Boolean).join(' · ')}
          </Veld>
          <Veld label="Te picken">
            {picks.length} {picks.length === 1 ? 'pick' : 'picks'} · {locaties}{' '}
            {locaties === 1 ? 'locatie' : 'locaties'}
          </Veld>
          <div className="doc-veld doc-veld-breed" style={{ gridColumn: 'span 5' }}>
            <div className="doc-label">Afleveradres</div>
            <div className="doc-waarde">
              {order.leveradres ? [adresLabel(order.leveradres), order.leveradres.land].filter(Boolean).join(', ') : '—'}
            </div>
          </div>
        </div>

        {picks.length === 0 ? (
          <p className="doc-instructie">Er is niets te picken: alles is geleverd of niet op voorraad.</p>
        ) : (
          <table className="doc-regels pick-regels">
            <thead>
              <tr>
                <th className="pick-vink">✓</th>
                <th>Locatie</th>
                <th>Artikelnr.</th>
                <th>Omschrijving</th>
                <th className="num">Picken</th>
                <th>Eenh.</th>
                <th className="num">Op locatie</th>
                <th className="num">Gepickt</th>
                <th className="doc-pos">Pos.</th>
              </tr>
            </thead>
            <tbody>
              {picks.map((p) => (
                <tr key={p.sleutel}>
                  <td className="pick-vink">
                    <span className="pick-vakje" />
                  </td>
                  <td className="pick-locatie doc-nowrap">{p.locatieCode}</td>
                  <td className="doc-artikelnummer doc-nowrap">{p.artikelnummer}</td>
                  <td>{p.artikelnaam}</td>
                  <td className="num pick-aantal">{aantal(p.aantal)}</td>
                  <td className="doc-nowrap">{p.eenheid}</td>
                  <td className="num">{aantal(p.opLocatie)}</td>
                  <td className="num">
                    <span className="pick-invul" />
                  </td>
                  <td className="doc-pos">{p.regelnummer}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tekorten.length > 0 && (
          <>
            <h2 className="pick-kop">Niet (volledig) op voorraad</h2>
            <table className="doc-regels pick-tekort">
              <thead>
                <tr>
                  <th className="doc-pos">Pos.</th>
                  <th>Artikelnr.</th>
                  <th>Omschrijving</th>
                  <th className="num">Nog te leveren</th>
                  <th className="num">Tekort</th>
                  <th>Eenh.</th>
                </tr>
              </thead>
              <tbody>
                {tekorten.map((t) => (
                  <tr key={t.regelnummer}>
                    <td className="doc-pos">{t.regelnummer}</td>
                    <td className="doc-artikelnummer doc-nowrap">{t.artikelnummer}</td>
                    <td>{t.artikelnaam}</td>
                    <td className="num">{aantal(t.nodig)}</td>
                    <td className="num doc-artikelnummer">{aantal(t.tekort)}</td>
                    <td>{t.eenheid}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <div className="pick-aftekenen">
          <div>Gepickt door: ______________________</div>
          <div>Datum: ______________</div>
          <div>Colli / pallets: ________</div>
        </div>
        <p className="doc-instructie">
          Vink elke regel af en noteer bij afwijkingen het gepickte aantal. Geef de lijst daarna terug aan
          verkoop; de voorraad wordt afgeboekt bij het maken van de pakbon.
        </p>
      </div>
    </div>
  )
}

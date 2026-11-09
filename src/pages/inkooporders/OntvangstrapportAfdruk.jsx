import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { formatDateTime, formatNumber } from '../../lib/format'
import { laadOntvangstrapport, leesOpenSessieId, sluitOntvangstsessie } from '../../lib/ontvangstrapport'
import './afdruk.css'

function toon(n) {
  const x = Number(n)
  if (!Number.isFinite(x)) return '-'
  return formatNumber(x, Number.isInteger(x) ? 0 : 2)
}

// PDF van één inboeksessie: alleen wat in die sessie op voorraad is gezet.
export default function OntvangstrapportAfdruk() {
  const { id } = useParams()
  const [rapport, setRapport] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let actief = true
    laadOntvangstrapport(id)
      .then((r) => {
        if (!actief) return
        if (!r) setError('Dit ontvangstrapport is niet gevonden.')
        else setRapport(r)
      })
      .catch((err) => actief && setError(err.message))
    return () => {
      actief = false
    }
  }, [id])

  useEffect(() => {
    if (rapport) document.title = `Ontvangstrapport ${formatDateTime(rapport.gestartOp)}`
  }, [rapport])

  useEffect(() => {
    if (!rapport || rapport.afgeslotenOp || leesOpenSessieId() !== rapport.id) return
    sluitOntvangstsessie().catch(() => {})
  }, [rapport])

  if (error) {
    return (
      <div className="center-screen">
        <div className="banner banner-danger">{error}</div>
      </div>
    )
  }
  if (!rapport) {
    return (
      <div className="center-screen">
        <div className="spinner" />
      </div>
    )
  }

  const regels = rapport.regels || []

  return (
    <div className="afdruk-scherm">
      <div className="afdruk-toolbar" style={{ gap: 8 }}>
        <Link className="btn btn-secondary" to="/inkooporders/ontvangst/rapporten">
          Alle rapporten
        </Link>
        <Link className="btn btn-secondary" to="/inkooporders/ontvangst">
          Terug naar ontvangen
        </Link>
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>
          PDF
        </button>
      </div>

      <div className="afdruk-pagina pick-pagina">
        <div className="doc-kop">
          <div className="doc-titelblok">
            <h1 className="doc-titel">Binnengekomen goederen</h1>
            <div className="doc-nummer">{formatDateTime(rapport.gestartOp)}</div>
            {rapport.afgeslotenOp ? <div className="doc-datum">Afgesloten {formatDateTime(rapport.afgeslotenOp)}</div> : null}
          </div>
          <img src="/fmid-logo.png" alt="FMID" className="pick-logo" />
        </div>

        <p className="doc-instructie">
          Alleen deze inboeksessie, door {rapport.gebruiker || '—'}. {regels.length}{' '}
          {regels.length === 1 ? 'regel' : 'regels'}. Een volgende keer opnieuw inboeken komt op een nieuw rapport.
        </p>

        {regels.length === 0 ? (
          <p className="doc-instructie">In deze sessie is nog niets op voorraad gezet.</p>
        ) : (
          <table className="doc-regels pick-regels">
            <thead>
              <tr>
                <th>Tijd</th>
                <th>Artikelnr.</th>
                <th>Omschrijving</th>
                <th>Locatie</th>
                <th className="num">Aantal</th>
                <th>Eenh.</th>
                <th>Inkooporder</th>
              </tr>
            </thead>
            <tbody>
              {regels.map((r, i) => (
                <tr key={`${r.artikelnummer}-${r.ordernummer}-${i}`}>
                  <td className="doc-nowrap">{formatDateTime(r.geboektOp)}</td>
                  <td className="doc-artikelnummer doc-nowrap">{r.artikelnummer}</td>
                  <td>{r.artikelnaam}</td>
                  <td className="pick-locatie doc-nowrap">{r.locatieCode || '—'}</td>
                  <td className="num pick-aantal">{toon(r.aantal)}</td>
                  <td className="doc-nowrap">{r.eenheid}</td>
                  <td className="doc-nowrap">
                    {r.ordernummer || '—'}
                    {r.leverancier ? ` · ${r.leverancier}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

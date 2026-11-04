import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { formatDateTime, formatNumber } from '../../lib/format'
import { laadPickrapport } from '../../lib/pickrapport'
import '../inkooporders/afdruk.css'

function aantal(v) {
  return formatNumber(v, Number.isInteger(Number(v)) ? 0 : 2)
}

// Afdruk van wat er op de telefoon is gepikt. Boekt geen voorraad.
export default function PickrapportAfdruk() {
  const { klantId } = useParams()
  const [rapport, setRapport] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let actief = true
    laadPickrapport(klantId)
      .then((r) => {
        if (!actief) return
        if (!r) setError('Er is nog geen pickrapport. Loop de lijst eerst af op de telefoon.')
        else setRapport(r)
      })
      .catch((err) => actief && setError(err.message))
    return () => {
      actief = false
    }
  }, [klantId])

  useEffect(() => {
    if (rapport) document.title = `Pickrapport ${rapport.klantcode || ''}`
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
  const tekorten = rapport.tekorten || []

  return (
    <div className="afdruk-scherm">
      <div className="afdruk-toolbar" style={{ gap: 8 }}>
        <Link className="btn btn-secondary" to="/picklijsten">
          Terug
        </Link>
        <button className="btn btn-primary" onClick={() => window.print()}>
          PDF rapport
        </button>
      </div>

      <div className="afdruk-pagina pick-pagina">
        <div className="doc-kop">
          <div className="doc-titelblok">
            <h1 className="doc-titel">Pickrapport</h1>
            <div className="doc-nummer">
              {rapport.klantcode}
              {rapport.klantNaam ? ` — ${rapport.klantNaam}` : ''}
            </div>
            <div className="doc-datum">Gepickt {formatDateTime(rapport.gepicktOp)}</div>
          </div>
          <img src="/fmid-logo.png" alt="FMID" className="pick-logo" />
        </div>

        <p className="doc-instructie">
          Gepickt door {rapport.gebruiker || '—'}.
          {rapport.ordernummers?.length ? ` Orders: ${rapport.ordernummers.join(', ')}.` : ''} De voorraad
          wordt afgeboekt bij de pakbon.
        </p>

        {regels.length === 0 ? (
          <p className="doc-instructie">Er zijn geen regels gepikt.</p>
        ) : (
          <table className="doc-regels pick-regels">
            <thead>
              <tr>
                <th>Locatie</th>
                <th>Artikelnr.</th>
                <th>Omschrijving</th>
                <th className="num">Gepikt</th>
                <th>Eenh.</th>
                <th className="num">Blijft liggen</th>
                <th>Orders</th>
              </tr>
            </thead>
            <tbody>
              {regels.map((r, i) => (
                <tr key={`${r.artikelnummer}-${r.locatieCode}-${i}`}>
                  <td className="pick-locatie doc-nowrap">{r.locatieCode || '—'}</td>
                  <td className="doc-artikelnummer doc-nowrap">{r.artikelnummer}</td>
                  <td>
                    {r.artikelnaam}
                    {r.vervangt ? <div className="pick-vervangt">omboeken naar {r.vervangt}</div> : null}
                  </td>
                  <td className="num pick-aantal">{aantal(r.aantal)}</td>
                  <td className="doc-nowrap">{r.eenheid}</td>
                  <td className="num">{r.blijft == null ? '—' : aantal(r.blijft)}</td>
                  <td className="doc-nowrap">{(r.ordernummers || []).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tekorten.length > 0 && (
          <>
            <h2 className="pick-kop">Niet gepikt — niet op voorraad</h2>
            <table className="doc-regels pick-tekort">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Artikelnr.</th>
                  <th>Omschrijving</th>
                  <th className="num">Tekort</th>
                  <th>Eenh.</th>
                </tr>
              </thead>
              <tbody>
                {tekorten.map((t, i) => (
                  <tr key={`${t.ordernummer}-${t.artikelnummer}-${i}`}>
                    <td className="doc-nowrap">{t.ordernummer}</td>
                    <td className="doc-artikelnummer doc-nowrap">{t.artikelnummer}</td>
                    <td>{t.artikelnaam}</td>
                    <td className="num">{aantal(t.tekort)}</td>
                    <td>{t.eenheid}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { formatDateTime, formatNumber } from '../../lib/format'
import { dozenVanRapport, laadInpakrapport } from '../../lib/inpakrapport'
import '../inkooporders/afdruk.css'

function aantal(v) {
  return formatNumber(v, Number.isInteger(Number(v)) ? 0 : 2)
}

// Wat er in welke doos zit, en op welk verkooporder dat geleverd wordt.
export default function InpakrapportAfdruk() {
  const { klantId } = useParams()
  const [rapport, setRapport] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let actief = true
    laadInpakrapport(klantId)
      .then((r) => {
        if (!actief) return
        if (!r || !(r.regels || []).length) {
          setError('Er is nog geen inpakrapport. Pak de regels eerst in op de telefoon.')
        } else setRapport(r)
      })
      .catch((err) => actief && setError(err.message))
    return () => {
      actief = false
    }
  }, [klantId])

  useEffect(() => {
    if (rapport) document.title = `Inpakrapport ${rapport.klantcode || ''}`
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

  const dozen = dozenVanRapport(rapport.regels || [])

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
            <h1 className="doc-titel">Inpakrapport</h1>
            <div className="doc-nummer">
              {rapport.klantcode}
              {rapport.klantNaam ? ` — ${rapport.klantNaam}` : ''}
            </div>
            <div className="doc-datum">Ingepakt {formatDateTime(rapport.ingepaktOp)}</div>
          </div>
          <img src="/fmid-logo.png" alt="FMID" className="pick-logo" />
        </div>

        <p className="doc-instructie">
          Ingepakt door {rapport.gebruiker || '—'}. {dozen.length} {dozen.length === 1 ? 'doos' : 'dozen'}.
          De voorraad wordt afgeboekt bij de pakbon.
        </p>

        {dozen.map(([doos, regels]) => (
          <section key={doos}>
            <h2 className="inpak-doos-kop">Doos {doos}</h2>
            <table className="doc-regels pick-regels">
              <thead>
                <tr>
                  <th>Verkooporder</th>
                  <th>Artikelnr.</th>
                  <th>Omschrijving</th>
                  <th className="num">Aantal</th>
                  <th>Eenh.</th>
                </tr>
              </thead>
              <tbody>
                {regels.map((r, i) => (
                  <tr key={`${r.ordernummer}-${r.artikelnummer}-${i}`}>
                    <td className="doc-nowrap">{r.ordernummer}</td>
                    <td className="doc-artikelnummer doc-nowrap">{r.artikelnummer}</td>
                    <td>{r.artikelnaam}</td>
                    <td className="num pick-aantal">{aantal(r.aantal)}</td>
                    <td className="doc-nowrap">{r.eenheid}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </div>
  )
}

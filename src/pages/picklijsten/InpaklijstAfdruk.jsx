import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import PicklijstQrVenster from '../../components/PicklijstQrVenster'
import { formatDateTime, formatNumber } from '../../lib/format'
import { maakInpaklijst } from '../../lib/picklijst'
import '../inkooporders/afdruk.css'

function aantal(v) {
  return formatNumber(v, Number.isInteger(Number(v)) ? 0 : 2)
}

// Papieren inpaklijst: per orderregel een vak om het doosnummer te noteren.
export default function InpaklijstAfdruk() {
  const { klantId } = useParams()
  const [lijst, setLijst] = useState(null)
  const [error, setError] = useState(null)
  const [qrOpen, setQrOpen] = useState(false)
  const [gemaaktOp] = useState(() => new Date())

  useEffect(() => {
    let actief = true
    setError(null)
    maakInpaklijst(klantId)
      .then((l) => actief && setLijst(l))
      .catch((err) => actief && setError(err.message))
    return () => {
      actief = false
    }
  }, [klantId])

  useEffect(() => {
    if (lijst?.klant) document.title = `Inpaklijst ${lijst.klant.klantcode}`
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

  const lijnen = lijst.lijnen || []
  const pad = `/picklijsten/${klantId}/inpakken`
  const naam = [lijst.klant.klantcode, lijst.klant.naam].filter(Boolean).join(' — ')

  return (
    <div className="afdruk-scherm">
      <div className="afdruk-toolbar" style={{ gap: 8 }}>
        <Link className="btn btn-secondary" to="/picklijsten">
          Terug
        </Link>
        <button type="button" className="btn btn-secondary" onMouseDown={() => setQrOpen(true)}>
          Op telefoon
        </button>
        <button className="btn btn-primary" onClick={() => window.print()}>
          PDF inpaklijst
        </button>
      </div>

      {qrOpen && (
        <PicklijstQrVenster
          klant={lijst.klant}
          pad={pad}
          titel="Inpakken"
          inleiding={`Scan de code met de telefoon. Het inpakken van ${naam} opent dan.`}
          onClose={() => setQrOpen(false)}
        />
      )}

      <div className="afdruk-pagina pick-pagina">
        <div className="doc-kop">
          <div className="doc-titelblok">
            <h1 className="doc-titel">Inpaklijst</h1>
            <div className="doc-nummer">
              {lijst.klant.klantcode}
              {lijst.klant.naam ? ` — ${lijst.klant.naam}` : ''}
            </div>
            <div className="doc-datum">{formatDateTime(gemaaktOp)}</div>
          </div>
          <img src="/fmid-logo.png" alt="FMID" className="pick-logo" />
        </div>

        <p className="doc-instructie">
          {lijst.zonderPick
            ? 'Er is nog niets gepickt. Loop eerst de picklijst af. Alleen die regels kunnen ingepakt worden.'
            : 'Alleen wat gepickt is. Noteer per regel het doosnummer. Eén regel mag over meerdere dozen, en één doos mag regels van verschillende orders bevatten.'}
          {!lijst.zonderPick && lijst.orders?.length
            ? ` Orders: ${lijst.orders.map((o) => o.ordernummer).filter(Boolean).join(', ')}.`
            : ''}
        </p>

        {lijnen.length === 0 ? (
          <p className="doc-instructie">
            {lijst.zonderPick ? 'Geen gepickte regels.' : 'Er is niets gepickt om in te pakken.'}
          </p>
        ) : (
          <table className="doc-regels pick-regels">
            <thead>
              <tr>
                <th>Order</th>
                <th>Artikelnr.</th>
                <th>Omschrijving</th>
                <th className="num">Aantal</th>
                <th>Eenh.</th>
                <th>Doos</th>
              </tr>
            </thead>
            <tbody>
              {lijnen.map((l) => (
                <tr key={l.sleutel}>
                  <td className="doc-nowrap">{l.ordernummer}</td>
                  <td className="doc-artikelnummer doc-nowrap">{l.artikelnummer}</td>
                  <td>{l.artikelnaam}</td>
                  <td className="num pick-aantal">{aantal(l.aantal)}</td>
                  <td className="doc-nowrap">{l.eenheid}</td>
                  <td>
                    <span className="pick-invul" />
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

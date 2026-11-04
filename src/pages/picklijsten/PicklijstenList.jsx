import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCollection } from '../../hooks/useCollection'

// Startscherm: vul een klant in → genereer de gecombineerde picklijst.
export default function PicklijstenList() {
  const navigate = useNavigate()
  const { data: klanten, loading: loadingKlanten, error: errorKlanten } = useCollection('klanten', {
    orderByField: 'klantcode',
  })
  const { data: orders, loading: loadingOrders, error: errorOrders } = useCollection('verkooporders', {
    orderByField: 'ordernummer',
    orderDirection: 'desc',
  })
  const [zoek, setZoek] = useState('')
  const [gekozenId, setGekozenId] = useState('')
  const [fout, setFout] = useState(null)

  const openPerKlant = useMemo(() => {
    const map = {}
    for (const o of orders) {
      if (!o.klantId) continue
      if (o.status === 'geannuleerd' || o.status === 'geleverd') continue
      if (!map[o.klantId]) map[o.klantId] = { aantalOrders: 0, ordernummers: [] }
      map[o.klantId].aantalOrders += 1
      if (o.ordernummer) map[o.klantId].ordernummers.push(o.ordernummer)
    }
    return map
  }, [orders])

  const suggesties = useMemo(() => {
    const q = zoek.trim().toLowerCase()
    if (!q) return []
    return klanten
      .filter(
        (k) =>
          k.klantcode?.toLowerCase().includes(q) ||
          k.naam?.toLowerCase().includes(q) ||
          k.zoeknaam?.toLowerCase().includes(q)
      )
      .slice(0, 12)
  }, [klanten, zoek])

  const gekozen = useMemo(
    () => klanten.find((k) => k.id === gekozenId) || null,
    [klanten, gekozenId]
  )

  function kiesKlant(k) {
    setGekozenId(k.id)
    setZoek(`${k.klantcode} — ${k.naam || ''}`.trim())
    setFout(null)
  }

  function vindKlantUitZoek() {
    const q = zoek.trim().toLowerCase()
    if (!q) return null
    if (gekozen && `${gekozen.klantcode} — ${gekozen.naam || ''}`.trim().toLowerCase() === q) {
      return gekozen
    }
    // Exact klantnummer (bijv. 5013)
    const exact = klanten.find((k) => String(k.klantcode || '').trim().toLowerCase() === q)
    if (exact) return exact
    // Unieke suggestie
    if (suggesties.length === 1) return suggesties[0]
    return gekozen
  }

  function handleGenereer(e) {
    e.preventDefault()
    setFout(null)
    const k = vindKlantUitZoek()
    if (!k) {
      setFout('Kies een klant: typ het klantnummer (bijv. 5013) of kies uit de lijst.')
      return
    }
    navigate(`/picklijsten/${k.id}`)
  }

  const openRijen = useMemo(() => {
    return klanten
      .filter((k) => openPerKlant[k.id])
      .map((k) => ({
        ...k,
        aantalOrders: openPerKlant[k.id].aantalOrders,
        ordernummers: openPerKlant[k.id].ordernummers.slice(0, 5),
      }))
  }, [klanten, openPerKlant])

  const loading = loadingKlanten || loadingOrders
  const error = errorKlanten || errorOrders

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1>Picklijsten</h1>
          <div className="page-header-sub">
            Vul een klant in; alle open regels van die klant komen in één lijst op looproute
          </div>
        </div>
        <Link className="btn btn-secondary" to="/looproute">
          Looproute / afstanden
        </Link>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-pad">
          <form onSubmit={handleGenereer}>
            <div className="field">
              <label>Klant</label>
              <input
                type="text"
                value={zoek}
                onChange={(e) => {
                  setZoek(e.target.value)
                  setGekozenId('')
                  setFout(null)
                }}
                placeholder="Typ klantnummer of naam, bijv. 5013 of Bonhoff…"
                autoComplete="off"
                list="picklijst-klanten"
              />
              <datalist id="picklijst-klanten">
                {klanten.slice(0, 500).map((k) => (
                  <option key={k.id} value={`${k.klantcode} — ${k.naam || ''}`} />
                ))}
              </datalist>
              <p className="hint">Bijvoorbeeld 5013 voor Bonhoff. Daarna op “Picklijst maken”.</p>
            </div>

            {zoek.trim() && !gekozen && suggesties.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Naam</th>
                      <th className="num">Open orders</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {suggesties.map((k) => (
                      <tr key={k.id}>
                        <td>{k.klantcode}</td>
                        <td>{k.naam}</td>
                        <td className="num">{openPerKlant[k.id]?.aantalOrders || 0}</td>
                        <td style={{ textAlign: 'right' }}>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => kiesKlant(k)}>
                            Kiezen
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {(fout || error) && (
              <div className="banner banner-danger" style={{ marginBottom: 12 }}>
                {fout || error}
              </div>
            )}

            <button type="submit" className="btn btn-primary" disabled={loading}>
              Picklijst maken
            </button>
          </form>
        </div>
      </div>

      <div className="card">
        <div className="card-pad" style={{ paddingBottom: 8 }}>
          <strong>Klanten met open orders</strong>
          <p className="hint" style={{ marginTop: 4 }}>
            Snelkoppeling — of vul hierboven zelf een klantnummer in.
          </p>
        </div>
        {loading ? (
          <div className="empty-state">
            <div className="spinner" style={{ margin: '0 auto' }} />
          </div>
        ) : openRijen.length === 0 ? (
          <div className="empty-state">Geen open verkooporders om te picken.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Klant</th>
                  <th>Naam</th>
                  <th className="num">Open orders</th>
                  <th>Orders</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {openRijen.map((k) => (
                  <tr key={k.id}>
                    <td>{k.klantcode}</td>
                    <td>{k.naam}</td>
                    <td className="num">{k.aantalOrders}</td>
                    <td>
                      {k.ordernummers.join(', ')}
                      {k.aantalOrders > k.ordernummers.length ? '…' : ''}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => navigate(`/picklijsten/${k.id}`)}
                      >
                        Picklijst
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

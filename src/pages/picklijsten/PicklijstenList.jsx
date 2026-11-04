import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { PicklijstQr } from '../../components/PicklijstQrVenster'
import { useCollection } from '../../hooks/useCollection'

// Startscherm: vul een klant in → genereer de gecombineerde picklijst.
function openPicklijst(klantId) {
  window.open(`/picklijsten/${klantId}`, '_blank', 'noopener,noreferrer')
}

function openRapport(klantId) {
  window.open(`/picklijsten/${klantId}/rapport`, '_blank', 'noopener,noreferrer')
}

function openInpaklijst(klantId) {
  window.open(`/picklijsten/${klantId}/inpaklijst`, '_blank', 'noopener,noreferrer')
}

function openInpakrapport(klantId) {
  window.open(`/picklijsten/${klantId}/inpakrapport`, '_blank', 'noopener,noreferrer')
}

function qrVoor(klant, soort) {
  const naam = [klant.klantcode, klant.naam].filter(Boolean).join(' — ')
  if (soort === 'inpakken') {
    return {
      klant,
      soort,
      pad: `/picklijsten/${klant.id}/inpakken`,
      inleiding: `Scan de code met de telefoon. Het inpakken van ${naam} opent dan.`,
    }
  }
  return {
    klant,
    soort: 'picken',
    pad: `/picklijsten/${klant.id}/mobiel`,
    inleiding: `Scan de code met de telefoon. De picklijst van ${naam} opent dan.`,
  }
}

export default function PicklijstenList() {
  const { data: klanten, loading: loadingKlanten, error: errorKlanten } = useCollection('klanten', {
    orderByField: 'klantcode',
  })
  const { data: orders, loading: loadingOrders, error: errorOrders } = useCollection('verkooporders', {
    orderByField: 'ordernummer',
    orderDirection: 'desc',
  })
  const { data: rapporten, error: foutRapporten } = useCollection('pickrapporten')
  const { data: inpakrapporten, error: foutInpak } = useCollection('inpakrapporten')
  const [zoek, setZoek] = useState('')
  const [gekozenId, setGekozenId] = useState('')
  const [fout, setFout] = useState(null)
  const [qr, setQr] = useState(null)
  const qrRef = useRef(null)

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
    // Exact klantnummer (bijv. 5013) of de tekst uit de keuzelijst ("5013 — Bonfix").
    const exact = klanten.find((k) => String(k.klantcode || '').trim().toLowerCase() === q)
    if (exact) return exact
    const uitLijst = klanten.find((k) => `${k.klantcode} — ${k.naam || ''}`.trim().toLowerCase() === q)
    if (uitLijst) return uitLijst
    // Unieke suggestie
    if (suggesties.length === 1) return suggesties[0]
    return gekozen
  }

  function gekozenKlant() {
    const k = vindKlantUitZoek()
    if (!k) {
      setFout('Kies een klant: typ het klantnummer (bijv. 5013) of kies uit de lijst.')
      return null
    }
    setFout(null)
    return k
  }

  function toonQr(klant, soort) {
    setFout(null)
    setQr(qrVoor(klant, soort))
  }

  useEffect(() => {
    if (qr) qrRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [qr])

  function handleMobiel(e) {
    e.preventDefault()
    const k = gekozenKlant()
    if (k) toonQr(k, 'picken')
  }

  const rapportVan = useMemo(() => {
    const set = new Set()
    for (const r of rapporten) {
      if ((r.regels || []).length > 0) set.add(r.klantId || r.id)
    }
    return set
  }, [rapporten])

  const inpakVan = useMemo(() => {
    const set = new Set()
    for (const r of inpakrapporten) {
      if ((r.regels || []).length > 0) set.add(r.klantId || r.id)
    }
    return set
  }, [inpakrapporten])

  function handleAfdrukken() {
    const k = gekozenKlant()
    if (k) openPicklijst(k.id)
  }

  function handleInpakken() {
    const k = gekozenKlant()
    if (k) toonQr(k, 'inpakken')
  }

  function handleInpaklijst() {
    const k = gekozenKlant()
    if (k) openInpaklijst(k.id)
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
  const klantInVeld = vindKlantUitZoek()

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1>Picklijsten</h1>
          <div className="page-header-sub">
            Picken en daarna inpakken in dozen. Op telefoon via een QR-code, of als PDF.
          </div>
        </div>
        <Link className="btn btn-secondary" to="/looproute">
          Looproute / afstanden
        </Link>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-pad">
            <form onSubmit={handleMobiel}>
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
              <p className="hint">
                Bijvoorbeeld 5013 voor Bonhoff. Eerst picken, daarna inpakken: per regel de doos, aan het eind het rapport.
              </p>
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
            {(foutRapporten || foutInpak) && (
              <div className="banner banner-warning" style={{ marginBottom: 12 }}>
                Rapporten laden lukt niet. Vernieuw de pagina. {foutRapporten || foutInpak}
              </div>
            )}

            <div className="picklijst-acties">
              <button type="submit" className="btn btn-primary" disabled={loading}>
                Op telefoon
              </button>
              <button type="button" className="btn btn-secondary" disabled={loading} onClick={handleAfdrukken}>
                PDF picklijst
              </button>
              {klantInVeld && rapportVan.has(klantInVeld.id) && (
                <button type="button" className="btn btn-secondary" onClick={() => openRapport(klantInVeld.id)}>
                  PDF rapport
                </button>
              )}
            </div>
            <div className="picklijst-acties" style={{ marginTop: 8 }}>
              <button type="button" className="btn btn-secondary" disabled={loading} onClick={handleInpakken}>
                Inpakken
              </button>
              <button type="button" className="btn btn-secondary" disabled={loading} onClick={handleInpaklijst}>
                PDF inpaklijst
              </button>
              {klantInVeld && inpakVan.has(klantInVeld.id) && (
                <button type="button" className="btn btn-secondary" onClick={() => openInpakrapport(klantInVeld.id)}>
                  Inpakrapport
                </button>
              )}
            </div>
          </form>
        </div>
      </div>

      {qr && (
        <div className="card pick-qr-kaart" ref={qrRef}>
          <div className="card-pad">
            <h2 style={{ marginBottom: 8 }}>{qr.soort === 'inpakken' ? 'Inpakken' : 'Op telefoon'}</h2>
            <PicklijstQr klant={qr.klant} pad={qr.pad} inleiding={qr.inleiding} onClose={() => setQr(null)} />
          </div>
        </div>
      )}

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
                      <div className="picklijst-acties">
                        <button type="button" className="btn btn-primary btn-sm" onMouseDown={() => toonQr(k, 'picken')}>
                          Op telefoon
                        </button>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => openPicklijst(k.id)}>
                          PDF picklijst
                        </button>
                        {rapportVan.has(k.id) && (
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => openRapport(k.id)}>
                            PDF rapport
                          </button>
                        )}
                        <button type="button" className="btn btn-secondary btn-sm" onMouseDown={() => toonQr(k, 'inpakken')}>
                          Inpakken
                        </button>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => openInpaklijst(k.id)}>
                          PDF inpaklijst
                        </button>
                        {inpakVan.has(k.id) && (
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => openInpakrapport(k.id)}>
                            Inpakrapport
                          </button>
                        )}
                      </div>
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

import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useCollection } from '../../hooks/useCollection'
import { formatDateTime } from '../../lib/format'

export default function PickrapportenList() {
  const { data, loading, error } = useCollection('pickrapporten')
  const rapporten = useMemo(
    () =>
      [...data]
        .filter((r) => (r.regels || []).length > 0 || (r.tekorten || []).length > 0)
        .sort((a, b) => String(b.gepicktOp || '').localeCompare(String(a.gepicktOp || ''))),
    [data]
  )

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1>Pickrapporten</h1>
          <div className="page-header-sub">Eén rapport per keer dat een picklijst is afgerond</div>
        </div>
        <Link className="btn btn-secondary" to="/picklijsten">
          Picklijsten
        </Link>
      </div>

      <div className="card">
        {error && <div className="banner banner-danger">{error}</div>}
        {loading ? (
          <div className="empty-state">
            <div className="spinner" style={{ margin: '0 auto' }} />
          </div>
        ) : rapporten.length === 0 ? (
          <div className="empty-state">Er is nog geen pickrapport. Loop eerst een picklijst af op de telefoon.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Gepickt</th>
                  <th>Klant</th>
                  <th>Regels</th>
                  <th>Door</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rapporten.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {formatDateTime(r.gepicktOp)}
                      {r.gewijzigdOp ? <div className="hint">gewijzigd {formatDateTime(r.gewijzigdOp)}</div> : null}
                    </td>
                    <td>
                      {r.klantcode || '—'}
                      {r.klantNaam ? ` — ${r.klantNaam}` : ''}
                    </td>
                    <td>{(r.regels || []).length}</td>
                    <td>{r.gebruiker || '—'}</td>
                    <td>
                      <Link to={`/picklijsten/rapport/${r.id}`}>Openen</Link>
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

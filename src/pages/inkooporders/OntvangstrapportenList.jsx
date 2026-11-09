import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useCollection } from '../../hooks/useCollection'
import { formatDateTime } from '../../lib/format'

export default function OntvangstrapportenList() {
  const { data, loading, error } = useCollection('ontvangstrapporten')
  const rapporten = useMemo(
    () =>
      [...data]
        .filter((r) => (r.regels || []).length > 0)
        .sort((a, b) => String(b.gestartOp || '').localeCompare(String(a.gestartOp || ''))),
    [data]
  )

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1>Ontvangstrapporten</h1>
          <div className="page-header-sub">Eén rapport per keer dat er goederen zijn ingeboekt</div>
        </div>
        <Link className="btn btn-secondary" to="/inkooporders/ontvangst">
          Goederen ontvangen
        </Link>
      </div>

      <div className="card">
        {error && <div className="banner banner-danger">{error}</div>}
        {loading ? (
          <div className="empty-state">
            <div className="spinner" style={{ margin: '0 auto' }} />
          </div>
        ) : rapporten.length === 0 ? (
          <div className="empty-state">Er is nog geen ontvangstrapport. Boek eerst goederen op de telefoon.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Sessie</th>
                  <th>Regels</th>
                  <th>Door</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rapporten.map((r) => (
                  <tr key={r.id}>
                    <td>{formatDateTime(r.gestartOp)}</td>
                    <td>{(r.regels || []).length}</td>
                    <td>{r.gebruiker || '—'}</td>
                    <td>{r.afgeslotenOp ? 'Afgesloten' : 'Open'}</td>
                    <td>
                      <Link to={`/inkooporders/ontvangst/rapport/${r.id}`}>PDF</Link>
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

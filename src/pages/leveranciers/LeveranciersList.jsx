import { useMemo, useState } from 'react'
import { useCollection } from '../../hooks/useCollection'
import Modal from '../../components/Modal'
import LeverancierForm from './LeverancierForm'

export default function LeveranciersList() {
  const { data: leveranciers, loading, error } = useCollection('leveranciers', {
    orderByField: 'leverancierscode',
  })
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(null)
  const [showNieuw, setShowNieuw] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return leveranciers
    return leveranciers.filter(
      (l) =>
        l.leverancierscode?.toLowerCase().includes(q) ||
        l.naam?.toLowerCase().includes(q) ||
        l.plaats?.toLowerCase().includes(q)
    )
  }, [leveranciers, search])

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1>Leveranciers</h1>
          <div className="page-header-sub">{leveranciers.length} leveranciers</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNieuw(true)}>
          + Nieuwe leverancier
        </button>
      </div>

      <div className="card">
        <div className="card-pad" style={{ paddingBottom: 0 }}>
          <div className="data-table-toolbar">
            <input
              className="search-input"
              type="text"
              placeholder="Zoek op code, naam of plaats…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {error && <div className="banner banner-danger" style={{ margin: '0 20px 16px' }}>{error}</div>}

        {loading ? (
          <div className="empty-state"><div className="spinner" style={{ margin: '0 auto' }} /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">Geen leveranciers gevonden.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Naam</th>
                  <th>Contactpersoon</th>
                  <th>Telefoon</th>
                  <th>E-mail</th>
                  <th>Plaats</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((l) => (
                  <tr key={l.id} onClick={() => setEditing(l)}>
                    <td>{l.leverancierscode}</td>
                    <td>
                      {l.naam}
                      {l.geblokkeerd && (
                        <span className="badge badge-danger" style={{ marginLeft: 8 }}>
                          geblokkeerd
                        </span>
                      )}
                    </td>
                    <td>{l.contactpersoon || '-'}</td>
                    <td>{l.telefoon || '-'}</td>
                    <td>{l.email || '-'}</td>
                    <td>{l.plaats || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showNieuw && (
        <Modal title="Nieuwe leverancier" onClose={() => setShowNieuw(false)} width={640}>
          <LeverancierForm onDone={() => setShowNieuw(false)} />
        </Modal>
      )}

      {editing && (
        <Modal title={`Leverancier ${editing.leverancierscode}`} onClose={() => setEditing(null)} width={640}>
          <LeverancierForm leverancier={editing} onDone={() => setEditing(null)} />
        </Modal>
      )}
    </div>
  )
}

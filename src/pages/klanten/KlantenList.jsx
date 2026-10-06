import { useMemo, useState } from 'react'
import { useCollection } from '../../hooks/useCollection'
import Modal from '../../components/Modal'
import KlantForm from './KlantForm'

// Zelfde opzet als LeveranciersList.
export default function KlantenList() {
  const { data: klanten, loading, error } = useCollection('klanten', {
    orderByField: 'klantcode',
  })
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(null)
  const [showNieuw, setShowNieuw] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return klanten
    return klanten.filter(
      (k) =>
        k.klantcode?.toLowerCase().includes(q) ||
        k.naam?.toLowerCase().includes(q) ||
        k.zoeknaam?.toLowerCase().includes(q) ||
        k.plaats?.toLowerCase().includes(q)
    )
  }, [klanten, search])

  const aantalNakijken = klanten.filter((k) => k.adresControleren).length

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1>Klanten</h1>
          <div className="page-header-sub">
            {klanten.length} klanten
            {aantalNakijken > 0 && ` · ${aantalNakijken} met een adres om na te kijken`}
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNieuw(true)}>
          + Nieuwe klant
        </button>
      </div>

      <div className="card">
        <div className="card-pad" style={{ paddingBottom: 0 }}>
          <div className="data-table-toolbar">
            <input
              className="search-input"
              type="text"
              placeholder="Zoek op klantnummer, naam of plaats…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {error && <div className="banner banner-danger" style={{ margin: '0 20px 16px' }}>{error}</div>}

        {loading ? (
          <div className="empty-state"><div className="spinner" style={{ margin: '0 auto' }} /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">Geen klanten gevonden.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Naam</th>
                  <th>Telefoon</th>
                  <th>E-mail</th>
                  <th>Plaats</th>
                  <th>Land</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((k) => (
                  <tr key={k.id} onClick={() => setEditing(k)}>
                    <td>{k.klantcode}</td>
                    <td>
                      {k.naam}
                      {k.geblokkeerd && (
                        <span className="badge badge-danger" style={{ marginLeft: 8 }}>
                          geblokkeerd
                        </span>
                      )}
                      {k.adresControleren && (
                        <span className="badge badge-warning" style={{ marginLeft: 8 }}>
                          adres nakijken
                        </span>
                      )}
                    </td>
                    <td>{k.telefoon || '-'}</td>
                    <td>{k.email || '-'}</td>
                    <td>{k.plaats || '-'}</td>
                    <td>{k.land || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showNieuw && (
        <Modal title="Nieuwe klant" onClose={() => setShowNieuw(false)} width={640}>
          <KlantForm onDone={() => setShowNieuw(false)} />
        </Modal>
      )}

      {editing && (
        <Modal title={`Klant ${editing.klantcode}`} onClose={() => setEditing(null)} width={640}>
          <KlantForm klant={editing} onDone={() => setEditing(null)} />
        </Modal>
      )}
    </div>
  )
}

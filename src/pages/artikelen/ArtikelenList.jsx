import { useMemo, useState } from 'react'
import { useCollection } from '../../hooks/useCollection'
import { useVoorraadTotals } from '../../hooks/useVoorraadTotals'
import { formatCurrency, formatNumber } from '../../lib/format'
import Modal from '../../components/Modal'
import ArtikelForm from './ArtikelForm'

export default function ArtikelenList() {
  const { data: artikelen, loading, error } = useCollection('artikelen', {
    orderByField: 'artikelnummer',
  })
  const { totalenPerArtikel } = useVoorraadTotals()
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(null)
  const [showNieuw, setShowNieuw] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return artikelen
    return artikelen.filter(
      (a) => a.artikelnummer?.toLowerCase().includes(q) || a.naam?.toLowerCase().includes(q)
    )
  }, [artikelen, search])

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1>Artikelen</h1>
          <div className="page-header-sub">{artikelen.length} artikelen</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNieuw(true)}>
          + Nieuw artikel
        </button>
      </div>

      <div className="card">
        <div className="card-pad" style={{ paddingBottom: 0 }}>
          <div className="data-table-toolbar">
            <input
              className="search-input"
              type="text"
              placeholder="Zoek op artikelnummer of naam…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {error && <div className="banner banner-danger" style={{ margin: '0 20px 16px' }}>{error}</div>}

        {loading ? (
          <div className="empty-state"><div className="spinner" style={{ margin: '0 auto' }} /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">Geen artikelen gevonden.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Artikelnummer</th>
                  <th>Naam</th>
                  <th>Eenheid</th>
                  <th className="num">Inkoopprijs</th>
                  <th className="num">Verkoopprijs</th>
                  <th className="num">Voorraad</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => {
                  const totaal = totalenPerArtikel[a.id] || 0
                  const laag = totaal <= Number(a.minVoorraad || 0)
                  return (
                    <tr key={a.id} onClick={() => setEditing(a)}>
                      <td>{a.artikelnummer}</td>
                      <td>
                        {a.naam}
                        {a.geblokkeerd && (
                          <span className="badge badge-danger" style={{ marginLeft: 8 }}>
                            geblokkeerd
                          </span>
                        )}
                      </td>
                      <td>{a.eenheid}</td>
                      <td className="num">{formatCurrency(a.inkoopprijs)}</td>
                      <td className="num">{formatCurrency(a.verkoopprijs)}</td>
                      <td className="num">
                        {formatNumber(totaal)}
                        {laag && (
                          <span className="badge badge-warning" style={{ marginLeft: 8 }}>
                            laag
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showNieuw && (
        <Modal title="Nieuw artikel" onClose={() => setShowNieuw(false)} width={640}>
          <ArtikelForm onDone={() => setShowNieuw(false)} />
        </Modal>
      )}

      {editing && (
        <Modal title={`Artikel ${editing.artikelnummer}`} onClose={() => setEditing(null)} width={720}>
          <ArtikelForm artikel={editing} onDone={() => setEditing(null)} />
        </Modal>
      )}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useVoorraadTotals } from '../../hooks/useVoorraadTotals'
import { formatCurrency, formatNumber } from '../../lib/format'
import { telArtikelen, useArtikelZoeken } from '../../lib/artikelZoeken'
import Modal from '../../components/Modal'
import ArtikelForm from './ArtikelForm'

const PER_PAGINA = 100

// Prijzen uit Axapta gelden soms per 100 of 1000 stuks; toon dat erbij.
function prijsMetEenheid(prijs, hoeveelheid) {
  const n = Number(hoeveelheid) || 1
  return n === 1 ? formatCurrency(prijs) : `${formatCurrency(prijs)} / ${formatNumber(n)}`
}

export default function ArtikelenList() {
  const [search, setSearch] = useState('')
  const [max, setMax] = useState(PER_PAGINA)
  const [ververs, setVervers] = useState(0)
  const [totaal, setTotaal] = useState(null)
  const { artikelen, loading, error } = useArtikelZoeken(search, { max, ververs })
  const { totalenPerArtikel } = useVoorraadTotals()
  const [editing, setEditing] = useState(null)
  const [showNieuw, setShowNieuw] = useState(false)

  useEffect(() => {
    telArtikelen()
      .then(setTotaal)
      .catch(() => setTotaal(null))
  }, [ververs])

  // Nieuwe zoekterm: weer bij de eerste pagina beginnen.
  useEffect(() => setMax(PER_PAGINA), [search])

  function sluitEnVervers() {
    setEditing(null)
    setShowNieuw(false)
    setVervers((v) => v + 1)
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1>Artikelen</h1>
          <div className="page-header-sub">
            {totaal === null ? '…' : `${formatNumber(totaal)} artikelen`}
          </div>
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
            {search.trim() && !loading && (
              <span className="hint">
                {artikelen.length >= max ? `Eerste ${max} treffers` : `${artikelen.length} treffers`}
              </span>
            )}
          </div>
        </div>

        {error && <div className="banner banner-danger" style={{ margin: '0 20px 16px' }}>{error}</div>}

        {loading && artikelen.length === 0 ? (
          <div className="empty-state"><div className="spinner" style={{ margin: '0 auto' }} /></div>
        ) : artikelen.length === 0 ? (
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
                {artikelen.map((a) => {
                  const voorraad = totalenPerArtikel[a.id] || 0
                  const laag = Number(a.minVoorraad) > 0 && voorraad <= Number(a.minVoorraad)
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
                      <td className="num">{prijsMetEenheid(a.inkoopprijs, a.inkoopprijsHoeveelheid)}</td>
                      <td className="num">{prijsMetEenheid(a.verkoopprijs, a.verkoopprijsHoeveelheid)}</td>
                      <td className="num">
                        {formatNumber(voorraad)}
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

        {artikelen.length >= max && (
          <div className="card-pad" style={{ textAlign: 'center' }}>
            <button className="btn btn-secondary" disabled={loading} onClick={() => setMax((m) => m + PER_PAGINA)}>
              {loading ? 'Laden…' : `Meer tonen (${PER_PAGINA})`}
            </button>
          </div>
        )}
      </div>

      {showNieuw && (
        <Modal title="Nieuw artikel" onClose={() => setShowNieuw(false)} width={640}>
          <ArtikelForm onDone={sluitEnVervers} />
        </Modal>
      )}

      {editing && (
        <Modal title={`Artikel ${editing.artikelnummer}`} onClose={() => setEditing(null)} width={720}>
          <ArtikelForm artikel={editing} onDone={sluitEnVervers} />
        </Modal>
      )}
    </div>
  )
}

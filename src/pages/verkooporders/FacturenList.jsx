import { useMemo, useState } from 'react'
import { useCollection } from '../../hooks/useCollection'
import { formatDate, formatNumber } from '../../lib/format'
import { MailStatus } from '../../components/MailVenster'

// Overzicht van alle facturen. Openen gaat via de PDF; wijzigen kan niet,
// een factuur ligt vast zodra hij gemaakt is.
export default function FacturenList() {
  const { data: facturen, loading } = useCollection('facturen', { orderByField: 'datum', orderDirection: 'desc' })
  const [search, setSearch] = useState('')

  const gefilterd = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return facturen
    return facturen.filter(
      (f) =>
        f.factuurnummer?.toLowerCase().includes(q) ||
        f.ordernummer?.toLowerCase().includes(q) ||
        f.klantcode?.toLowerCase().includes(q) ||
        f.klantNaam?.toLowerCase().includes(q)
    )
  }, [facturen, search])

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1>Facturen</h1>
          <div className="page-header-sub">
            {facturen.length} facturen · nieuwe facturen maak je vanuit een verkooporder
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-pad" style={{ paddingBottom: 0 }}>
          <div className="data-table-toolbar">
            <input
              className="search-input"
              type="text"
              placeholder="Zoek op factuurnummer, ordernummer of klant…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        {loading ? (
          <div className="empty-state">
            <div className="spinner" style={{ margin: '0 auto' }} />
          </div>
        ) : gefilterd.length === 0 ? (
          <div className="empty-state">{facturen.length === 0 ? 'Nog geen facturen gemaakt.' : 'Geen facturen gevonden.'}</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Factuurnummer</th>
                  <th>Factuurdatum</th>
                  <th>Klant</th>
                  <th>Order</th>
                  <th>Vervaldatum</th>
                  <th className="num">Totaal incl. BTW</th>
                  <th>Mail</th>
                </tr>
              </thead>
              <tbody>
                {gefilterd.map((f) => (
                  <tr key={f.id} onClick={() => window.open(`/facturen/${f.id}/afdruk`, '_blank')}>
                    <td>{f.factuurnummer}</td>
                    <td>{formatDate(f.factuurdatum)}</td>
                    <td>
                      {f.klantcode} — {f.klantNaam}
                    </td>
                    <td>{f.ordernummer}</td>
                    <td>{formatDate(f.vervaldatum)}</td>
                    <td className="num">
                      {f.valuta && f.valuta !== 'EUR' ? `${f.valuta} ` : '€ '}
                      {formatNumber(f.totaal, 2)}
                    </td>
                    <td>{f.gemaildOp ? <MailStatus document={f} compact /> : <span className="hint">niet gemaild</span>}</td>
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

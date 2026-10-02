import { useState } from 'react'
import { useCollection } from '../../hooks/useCollection'
import { formatDateTime, formatNumber } from '../../lib/format'
import Modal from '../../components/Modal'
import ProductieorderForm from './ProductieorderForm'

const STATUS_LABEL = { open: 'Open', gereed: 'Gereed' }
const STATUS_BADGE = { open: 'badge-neutral', gereed: 'badge-success' }

export default function ProductieordersList() {
  const { data: orders, loading } = useCollection('productieorders', {
    orderByField: 'datum',
    orderDirection: 'desc',
  })
  const [showNieuw, setShowNieuw] = useState(false)

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1>Productieorders</h1>
          <div className="page-header-sub">Productieordernummer aanmaken voor een artikel en aantal</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNieuw(true)}>
          + Nieuwe productieorder
        </button>
      </div>

      <div className="card">
        {loading ? (
          <div className="empty-state"><div className="spinner" style={{ margin: '0 auto' }} /></div>
        ) : orders.length === 0 ? (
          <div className="empty-state">Nog geen productieorders aangemaakt.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ordernummer</th>
                  <th>Datum</th>
                  <th>Artikel</th>
                  <th className="num">Aantal</th>
                  <th>Status</th>
                  <th>Aangemaakt door</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} style={{ cursor: 'default' }}>
                    <td>{o.ordernummer}</td>
                    <td>{formatDateTime(o.datum)}</td>
                    <td>
                      {o.artikelnummer} — {o.artikelnaam}
                    </td>
                    <td className="num">
                      {formatNumber(o.aantal)} {o.eenheid}
                    </td>
                    <td>
                      <span className={'badge ' + (STATUS_BADGE[o.status] || 'badge-neutral')}>
                        {STATUS_LABEL[o.status] || o.status}
                      </span>
                    </td>
                    <td>{o.aangemaaktDoor || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showNieuw && (
        <Modal title="Nieuwe productieorder" onClose={() => setShowNieuw(false)}>
          <ProductieorderForm onDone={() => setShowNieuw(false)} />
        </Modal>
      )}
    </div>
  )
}

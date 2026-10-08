import { useMemo, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useCollection } from '../../hooks/useCollection'
import { formatDate, formatNumber } from '../../lib/format'
import { STATUS_BADGE, STATUS_LABEL, maakVerkooporder } from '../../lib/verkooporders'
import Modal from '../../components/Modal'
import VerkooporderForm from './VerkooporderForm'

// Zelfde opzet als InkoopordersList.
function NieuweVerkooporderForm({ onCreated, onCancel }) {
  const { profile } = useAuth()
  const { data: klanten, loading } = useCollection('klanten', { orderByField: 'klantcode' })
  const [zoek, setZoek] = useState('')
  const [klantId, setKlantId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const gefilterd = useMemo(() => {
    const q = zoek.trim().toLowerCase()
    const actief = klanten.filter((k) => !k.geblokkeerd)
    if (!q) return actief
    return actief.filter(
      (k) =>
        k.klantcode?.toLowerCase().includes(q) ||
        k.naam?.toLowerCase().includes(q) ||
        k.zoeknaam?.toLowerCase().includes(q) ||
        k.plaats?.toLowerCase().includes(q)
    )
  }, [klanten, zoek])
  const klant = klanten.find((k) => k.id === klantId)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (!klant) {
      setError('Kies een klant.')
      return
    }
    setSaving(true)
    try {
      const order = await maakVerkooporder({ klant, gebruiker: profile?.naam || profile?.email })
      onCreated(order)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <div className="banner banner-danger">{error}</div>}

      {!loading && klanten.length === 0 ? (
        <div className="banner banner-danger">
          Er zijn nog geen klanten aangemaakt. Voeg eerst een klant toe voordat je een verkooporder kunt aanmaken.
        </div>
      ) : (
        <>
          <div className="field">
            <label>Zoek klant</label>
            <input
              type="text"
              value={zoek}
              onChange={(e) => setZoek(e.target.value)}
              placeholder="Klantnummer, naam of plaats…"
              autoFocus
            />
          </div>
          <div className="field">
            <label>Klant</label>
            <select value={klantId} onChange={(e) => setKlantId(e.target.value)} size={8}>
              {gefilterd.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.klantcode} — {k.naam}
                  {k.plaats ? ` (${k.plaats})` : ''}
                </option>
              ))}
            </select>
            <span className="hint">Geblokkeerde klanten staan niet in de lijst.</span>
          </div>
        </>
      )}

      <div className="modal-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
          Annuleren
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving || !klant}>
          {saving ? 'Aanmaken…' : 'Aanmaken'}
        </button>
      </div>
    </form>
  )
}

export default function VerkoopordersList() {
  const { data: orders, loading } = useCollection('verkooporders', { orderByField: 'datum', orderDirection: 'desc' })
  const { data: regels } = useCollection('verkooporderregels')
  const [search, setSearch] = useState('')
  const [showNieuw, setShowNieuw] = useState(false)
  const [editing, setEditing] = useState(null)

  const totaalPerOrder = useMemo(() => {
    const map = {}
    for (const r of regels) {
      map[r.verkooporderId] = (map[r.verkooporderId] || 0) + (Number(r.aantal) || 0) * (Number(r.prijs) || 0)
    }
    return map
  }, [regels])

  const gefilterd = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return orders
    return orders.filter(
      (o) =>
        o.ordernummer?.toLowerCase().includes(q) ||
        o.klantcode?.toLowerCase().includes(q) ||
        o.klantNaam?.toLowerCase().includes(q) ||
        o.referentie?.toLowerCase().includes(q)
    )
  }, [orders, search])

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1>Verkooporders</h1>
          <div className="page-header-sub">{orders.length} verkooporders</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNieuw(true)}>
          + Nieuwe verkooporder
        </button>
      </div>

      <div className="card">
        <div className="card-pad" style={{ paddingBottom: 0 }}>
          <div className="data-table-toolbar">
            <input
              className="search-input"
              type="text"
              placeholder="Zoek op ordernummer, klant of referentie…"
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
          <div className="empty-state">{orders.length === 0 ? 'Nog geen verkooporders aangemaakt.' : 'Geen verkooporders gevonden.'}</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ordernummer</th>
                  <th>Orderdatum</th>
                  <th>Klant</th>
                  <th>Uw referentie</th>
                  <th>Status</th>
                  <th>Gewenste leverdatum</th>
                  <th className="num">Totaal excl. BTW</th>
                </tr>
              </thead>
              <tbody>
                {gefilterd.map((o) => (
                  <tr key={o.id} onClick={() => setEditing(o)}>
                    <td>{o.ordernummer}</td>
                    <td>{formatDate(o.orderdatum)}</td>
                    <td>
                      {o.klantcode} — {o.klantNaam}
                    </td>
                    <td>{o.referentie || '-'}</td>
                    <td>
                      <span className={'badge ' + (STATUS_BADGE[o.status] || 'badge-neutral')}>
                        {STATUS_LABEL[o.status] || o.status}
                      </span>
                    </td>
                    <td>{o.gewensteLeverdatum ? formatDate(o.gewensteLeverdatum) : '-'}</td>
                    <td className="num">
                      {o.valuta && o.valuta !== 'EUR' ? `${o.valuta} ` : '€ '}
                      {formatNumber(totaalPerOrder[o.id] || 0, 2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showNieuw && (
        <Modal title="Nieuwe verkooporder" onClose={() => setShowNieuw(false)}>
          <NieuweVerkooporderForm
            onCreated={(order) => {
              setShowNieuw(false)
              setEditing(order)
            }}
            onCancel={() => setShowNieuw(false)}
          />
        </Modal>
      )}

      {editing && (
        <Modal title={`Verkooporder ${editing.ordernummer}`} onClose={() => setEditing(null)} width={1180}>
          <VerkooporderForm verkooporder={editing} onDone={() => setEditing(null)} />
        </Modal>
      )}
    </div>
  )
}

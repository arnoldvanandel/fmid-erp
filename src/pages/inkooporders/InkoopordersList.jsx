import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useCollection } from '../../hooks/useCollection'
import { formatCurrency, formatDateTime } from '../../lib/format'
import { STATUS_LABEL, maakInkooporder } from '../../lib/inkooporders'
import { maakInkooporderUitSjabloon } from '../../lib/inkoopsjablonen'
import Modal from '../../components/Modal'
import InkooporderForm from './InkooporderForm'
import { OvergeslagenMelding } from './InkoopsjablonenList'

const STATUS_BADGE = {
  'deels ontvangen': 'badge-warning',
  concept: 'badge-neutral',
  besteld: 'badge-warning',
  ontvangen: 'badge-success',
  geannuleerd: 'badge-danger',
}

function NieuweInkooporderForm({ onCreated, onCancel }) {
  const { profile } = useAuth()
  const { data: leveranciers, loading } = useCollection('leveranciers', { orderByField: 'leverancierscode' })
  const { data: sjablonen } = useCollection('inkoopsjablonen', { orderByField: 'naam' })
  const [leverancierId, setLeverancierId] = useState('')
  const [sjabloonId, setSjabloonId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const leverancier = leveranciers.find((l) => l.id === leverancierId)
  const sjabloon = sjablonen.find((s) => s.id === sjabloonId)
  // Bij een gekozen leverancier alleen de sjablonen van die leverancier.
  const sjabloonKeuze = leverancierId ? sjablonen.filter((s) => s.leverancierId === leverancierId) : sjablonen

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (!leverancier && !sjabloon) {
      setError('Kies een leverancier of een sjabloon.')
      return
    }
    setSaving(true)
    try {
      if (sjabloon) {
        const { order, overgeslagen } = await maakInkooporderUitSjabloon({
          sjabloon,
          gebruiker: profile?.naam || profile?.email,
          gebruikerEmail: profile?.email,
        })
        onCreated(order, overgeslagen)
        return
      }
      const order = await maakInkooporder({
        leverancier,
        gebruiker: profile?.naam || profile?.email,
        gebruikerEmail: profile?.email,
      })
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

      {!loading && leveranciers.length === 0 ? (
        <div className="banner banner-danger">
          Er zijn nog geen leveranciers aangemaakt. Voeg eerst een leverancier toe voordat je een
          inkooporder kunt aanmaken.
        </div>
      ) : (
        <div className="field">
          <label>Leverancier</label>
          <select
            value={leverancierId}
            onChange={(e) => {
              setLeverancierId(e.target.value)
              setSjabloonId('')
            }}
          >
            <option value="">Kies leverancier…</option>
            {leveranciers.map((l) => (
              <option key={l.id} value={l.id}>
                {l.leverancierscode} — {l.naam}
              </option>
            ))}
          </select>
        </div>
      )}

      {sjablonen.length > 0 && (
        <div className="field">
          <label>Uit sjabloon (optioneel)</label>
          <select
            value={sjabloonId}
            onChange={(e) => {
              const s = sjablonen.find((x) => x.id === e.target.value)
              setSjabloonId(e.target.value)
              if (s) setLeverancierId(s.leverancierId)
            }}
          >
            <option value="">Lege inkooporder</option>
            {sjabloonKeuze.map((s) => (
              <option key={s.id} value={s.id}>
                {s.naam} ({s.leverancierscode}, {(s.regels || []).length} {(s.regels || []).length === 1 ? 'regel' : 'regels'})
              </option>
            ))}
          </select>
          <div className="hint">
            Met een sjabloon krijgt de order meteen de vaste regels, met de actuele inkoopprijzen. Beheer:{' '}
            <Link to="/inkoopsjablonen">Inkoopsjablonen</Link>.
          </div>
        </div>
      )}

      <div className="modal-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
          Annuleren
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving || leveranciers.length === 0}>
          {saving ? 'Aanmaken…' : 'Aanmaken'}
        </button>
      </div>
    </form>
  )
}

export default function InkoopordersList() {
  const { data: orders, loading } = useCollection('inkooporders', {
    orderByField: 'datum',
    orderDirection: 'desc',
  })
  const { data: regels } = useCollection('inkooporderregels')
  const [showNieuw, setShowNieuw] = useState(false)
  const [editing, setEditing] = useState(null)
  const [overgeslagen, setOvergeslagen] = useState(null)

  const totaalPerOrder = useMemo(() => {
    const map = {}
    for (const r of regels) {
      map[r.inkooporderId] = (map[r.inkooporderId] || 0) + (Number(r.aantal) || 0) * (Number(r.prijs) || 0)
    }
    return map
  }, [regels])

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1>Inkooporders</h1>
          <div className="page-header-sub">{orders.length} inkooporders</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link className="btn btn-secondary" to="/inkoopsjablonen">
            Sjablonen
          </Link>
          <button className="btn btn-primary" onClick={() => setShowNieuw(true)}>
            + Nieuwe inkooporder
          </button>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="empty-state"><div className="spinner" style={{ margin: '0 auto' }} /></div>
        ) : orders.length === 0 ? (
          <div className="empty-state">Nog geen inkooporders aangemaakt.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ordernummer</th>
                  <th>Datum</th>
                  <th>Leverancier</th>
                  <th>Status</th>
                  <th>Verwachte leverdatum</th>
                  <th className="num">Totaalbedrag</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} onClick={() => setEditing(o)}>
                    <td>{o.ordernummer}</td>
                    <td>{formatDateTime(o.datum)}</td>
                    <td>
                      {o.leverancierscode} — {o.leverancierNaam}
                    </td>
                    <td>
                      <span className={'badge ' + (STATUS_BADGE[o.status] || 'badge-neutral')}>
                        {STATUS_LABEL[o.status] || o.status}
                      </span>
                    </td>
                    <td>{o.verwachteLeverdatum || '-'}</td>
                    <td className="num">{formatCurrency(totaalPerOrder[o.id] || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showNieuw && (
        <Modal title="Nieuwe inkooporder" onClose={() => setShowNieuw(false)}>
          <NieuweInkooporderForm
            onCreated={(order, nietOvergenomen) => {
              setShowNieuw(false)
              setOvergeslagen(nietOvergenomen || null)
              setEditing(order)
            }}
            onCancel={() => setShowNieuw(false)}
          />
        </Modal>
      )}

      {editing && (
        <Modal
          title={`Inkooporder ${editing.ordernummer}`}
          onClose={() => {
            setEditing(null)
            setOvergeslagen(null)
          }}
          width={1120}
        >
          <OvergeslagenMelding overgeslagen={overgeslagen} />
          <InkooporderForm
            inkooporder={editing}
            onDone={() => {
              setEditing(null)
              setOvergeslagen(null)
            }}
          />
        </Modal>
      )}
    </div>
  )
}

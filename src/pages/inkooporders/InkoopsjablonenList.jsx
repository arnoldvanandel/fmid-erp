import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useCollection } from '../../hooks/useCollection'
import { formatDateTime } from '../../lib/format'
import { maakInkooporderUitSjabloon } from '../../lib/inkoopsjablonen'
import Modal from '../../components/Modal'
import InkooporderForm from './InkooporderForm'
import SjabloonForm from './SjabloonForm'

// Melding bij een order uit een sjabloon waarvan artikelen niet meer bestaan.
export function OvergeslagenMelding({ overgeslagen }) {
  if (!overgeslagen?.length) return null
  return (
    <div className="banner banner-warning">
      Niet overgenomen uit het sjabloon (artikel bestaat niet meer): {overgeslagen.join(', ')}
    </div>
  )
}

export default function InkoopsjablonenList() {
  const { profile } = useAuth()
  const { data: sjablonen, loading } = useCollection('inkoopsjablonen', { orderByField: 'naam' })
  const [editing, setEditing] = useState(null)
  const [bezig, setBezig] = useState(null)
  const [error, setError] = useState(null)
  // Net aangemaakte inkooporder: { order, overgeslagen }
  const [nieuweOrder, setNieuweOrder] = useState(null)

  async function maakOrder(sjabloon) {
    setError(null)
    setBezig(sjabloon.id)
    try {
      const resultaat = await maakInkooporderUitSjabloon({
        sjabloon,
        gebruiker: profile?.naam || profile?.email,
        gebruikerEmail: profile?.email,
      })
      setEditing(null)
      setNieuweOrder(resultaat)
    } catch (err) {
      setError(err.message)
    } finally {
      setBezig(null)
    }
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1>Inkoopsjablonen</h1>
          <div className="page-header-sub">
            {sjablonen.length} sjablonen · een sjabloon maak je bij een inkooporder met "Opslaan als sjabloon"
          </div>
        </div>
        <Link className="btn btn-secondary" to="/inkooporders">
          Naar inkooporders
        </Link>
      </div>

      {error && <div className="banner banner-danger">{error}</div>}

      <div className="card">
        {loading ? (
          <div className="empty-state"><div className="spinner" style={{ margin: '0 auto' }} /></div>
        ) : sjablonen.length === 0 ? (
          <div className="empty-state">
            Nog geen sjablonen. Open een inkooporder en kies "Opslaan als sjabloon".
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Naam</th>
                  <th>Leverancier</th>
                  <th className="num">Regels</th>
                  <th>Aangemaakt</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sjablonen.map((s) => (
                  <tr key={s.id} onClick={() => setEditing(s)}>
                    <td>{s.naam}</td>
                    <td>
                      {s.leverancierscode} — {s.leverancierNaam}
                    </td>
                    <td className="num">{(s.regels || []).length}</td>
                    <td>
                      {formatDateTime(s.datum)}
                      {s.aangemaaktDoor ? ` · ${s.aangemaaktDoor}` : ''}
                    </td>
                    <td className="num">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={bezig !== null || !(s.regels || []).length}
                        onClick={(e) => {
                          e.stopPropagation()
                          maakOrder(s)
                        }}
                      >
                        {bezig === s.id ? 'Aanmaken…' : 'Inkooporder maken'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <Modal title={`Sjabloon ${editing.naam}`} onClose={() => setEditing(null)} width={1000}>
          <SjabloonForm sjabloon={editing} onMaakOrder={maakOrder} onDone={() => setEditing(null)} />
        </Modal>
      )}

      {nieuweOrder && (
        <Modal
          title={`Inkooporder ${nieuweOrder.order.ordernummer}`}
          onClose={() => setNieuweOrder(null)}
          width={1120}
        >
          <OvergeslagenMelding overgeslagen={nieuweOrder.overgeslagen} />
          <InkooporderForm inkooporder={nieuweOrder.order} onDone={() => setNieuweOrder(null)} />
        </Modal>
      )}
    </div>
  )
}

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { TelefoonQr } from '../../components/PicklijstQrVenster'
import { useCollection } from '../../hooks/useCollection'
import { formatDate, formatNumber } from '../../lib/format'
import { pastBijEenVan, pastBijPatroon } from '../../lib/filterPatroon'
import { STATUS_LABEL } from '../../lib/inkooporders'
import Modal from '../../components/Modal'
import InkooporderForm from './InkooporderForm'

const STATUS_BADGE = {
  'deels ontvangen': 'badge-warning',
  concept: 'badge-neutral',
  besteld: 'badge-warning',
  ontvangen: 'badge-success',
  geannuleerd: 'badge-danger',
}

const KOLOMMEN = [
  { id: 'ordernummer', label: 'Ordernummer' },
  { id: 'besteldatum', label: 'Besteldatum' },
  { id: 'leverancier', label: 'Leverancier' },
  { id: 'referentie', label: 'Uw referentie' },
  { id: 'artikelnummer', label: 'Artikelnummer' },
  { id: 'artikelnaam', label: 'Omschrijving' },
  { id: 'besteld', label: 'Besteld', num: true },
  { id: 'ontvangen', label: 'Ontvangen', num: true },
  { id: 'open', label: 'Open', num: true },
  { id: 'leverdatum', label: 'Leverdatum' },
  { id: 'status', label: 'Status' },
]

function tekstSleutel(rij, kolom) {
  if (kolom === 'leverancier') return `${rij.leverancierscode || ''} ${rij.leverancierNaam || ''}`
  if (kolom === 'status') return STATUS_LABEL[rij.status] || rij.status || ''
  return rij[kolom] || ''
}

function vergelijk(a, b, kolom) {
  if (kolom === 'besteld' || kolom === 'ontvangen' || kolom === 'open') {
    return (Number(a[kolom]) || 0) - (Number(b[kolom]) || 0)
  }
  return String(tekstSleutel(a, kolom)).localeCompare(String(tekstSleutel(b, kolom)), 'nl', {
    numeric: true,
    sensitivity: 'base',
  })
}

function vergelijkRijen(a, b, sortering) {
  if (sortering.kolom === 'leverdatum' || sortering.kolom === 'besteldatum') {
    const leegA = !a[sortering.kolom]
    const leegB = !b[sortering.kolom]
    if (leegA !== leegB) return leegA ? 1 : -1
  }
  const uit = vergelijk(a, b, sortering.kolom)
  if (uit !== 0) return sortering.richting === 'desc' ? -uit : uit
  return (
    String(a.artikelnummer || '').localeCompare(String(b.artikelnummer || ''), 'nl', {
      numeric: true,
      sensitivity: 'base',
    }) ||
    String(a.ordernummer || '').localeCompare(String(b.ordernummer || ''), 'nl', { numeric: true }) ||
    (Number(a.regelnummer) || 0) - (Number(b.regelnummer) || 0)
  )
}

export default function OpenstaandeInkooporders() {
  const { data: orders, loading: ladenOrders, error: foutOrders } = useCollection('inkooporders')
  const { data: regels, loading: ladenRegels, error: foutRegels } = useCollection('inkooporderregels')
  const [artikelFilter, setArtikelFilter] = useState('')
  const [leverancierFilter, setLeverancierFilter] = useState('')
  const [sortering, setSortering] = useState({ kolom: 'artikelnummer', richting: 'asc' })
  const [editing, setEditing] = useState(null)
  const [qrOpen, setQrOpen] = useState(false)

  const openRegels = useMemo(() => {
    const orderById = Object.fromEntries(orders.map((o) => [o.id, o]))
    return regels
      .map((r) => {
        const order = orderById[r.inkooporderId]
        if (!order || order.status === 'geannuleerd') return null
        const besteld = Number(r.aantal) || 0
        const ontvangen = Number(r.ontvangen) || 0
        const open = Math.max(0, besteld - ontvangen)
        if (open <= 1e-9) return null
        return {
          id: r.id,
          order,
          regelnummer: r.regelnummer,
          ordernummer: order.ordernummer || '',
          besteldatum: order.besteldatum || '',
          leverancierscode: order.leverancierscode || '',
          leverancierNaam: order.leverancierNaam || '',
          referentie: order.referentie || '',
          artikelnummer: r.artikelnummer || '',
          artikelnaam: r.artikelnaam || '',
          besteld,
          ontvangen,
          open,
          eenheid: r.eenheid || '',
          leverdatum: r.leverdatum || order.verwachteLeverdatum || '',
          status: order.status || '',
        }
      })
      .filter(Boolean)
  }, [orders, regels])

  const gefilterd = useMemo(() => {
    const lijst = openRegels.filter(
      (r) =>
        pastBijPatroon(r.artikelnummer, artikelFilter) &&
        pastBijEenVan([r.leverancierscode, r.leverancierNaam], leverancierFilter)
    )
    return [...lijst].sort((a, b) => vergelijkRijen(a, b, sortering))
  }, [openRegels, artikelFilter, leverancierFilter, sortering])

  const aantalOrders = useMemo(() => new Set(gefilterd.map((r) => r.order.id)).size, [gefilterd])
  const laden = ladenOrders || ladenRegels
  const fout = foutOrders || foutRegels

  function sorteerOp(kolom) {
    setSortering((huidig) =>
      huidig.kolom === kolom
        ? { kolom, richting: huidig.richting === 'asc' ? 'desc' : 'asc' }
        : { kolom, richting: 'asc' }
    )
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1>Openstaande inkooporders</h1>
          <div className="page-header-sub">
            {laden
              ? 'Laden…'
              : `${formatNumber(gefilterd.length)} openstaande ${gefilterd.length === 1 ? 'regel' : 'regels'} in ${formatNumber(aantalOrders)} ${aantalOrders === 1 ? 'order' : 'orders'}`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link className="btn btn-secondary" to="/inkooporders/ontvangst/rapporten">
            PDF rapport
          </Link>
          <button type="button" className="btn btn-primary" onClick={() => setQrOpen(true)}>
            Goederen ontvangen
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-pad" style={{ paddingBottom: 0 }}>
          <div className="field-row">
            <div className="field">
              <label htmlFor="filter-inkoop-artikel">Artikelnummer</label>
              <input
                id="filter-inkoop-artikel"
                type="text"
                value={artikelFilter}
                onChange={(e) => setArtikelFilter(e.target.value)}
                placeholder="bijv. a* of a*-c*"
              />
            </div>
            <div className="field">
              <label htmlFor="filter-inkoop-leverancier">Leverancier</label>
              <input
                id="filter-inkoop-leverancier"
                type="text"
                value={leverancierFilter}
                onChange={(e) => setLeverancierFilter(e.target.value)}
                placeholder="leverancierscode of naam, bijv. k*"
              />
            </div>
            <div className="field" style={{ gridColumn: '1 / -1', marginTop: -8 }}>
              <span className="hint">
                * is een jokerteken. a* toont alles dat met een a begint, a*-c* alles van a t/m c. Een komma
                scheidt meerdere filters, bijvoorbeeld a*, x*.
              </span>
            </div>
          </div>
        </div>

        {fout && (
          <div className="banner banner-danger" style={{ margin: '0 20px 16px' }}>
            {fout}
          </div>
        )}

        {laden ? (
          <div className="empty-state">
            <div className="spinner" style={{ margin: '0 auto' }} />
          </div>
        ) : gefilterd.length === 0 ? (
          <div className="empty-state">
            {openRegels.length === 0
              ? 'Geen openstaande inkooporderregels.'
              : 'Geen regels die aan het filter voldoen.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  {KOLOMMEN.map((kolom) => (
                    <th
                      key={kolom.id}
                      className={kolom.num ? 'num' : undefined}
                      aria-sort={
                        sortering.kolom === kolom.id
                          ? sortering.richting === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : 'none'
                      }
                    >
                      <button type="button" className="sorteer" onClick={() => sorteerOp(kolom.id)}>
                        {kolom.label}
                        {sortering.kolom === kolom.id ? (sortering.richting === 'asc' ? ' ↑' : ' ↓') : ''}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gefilterd.map((r) => (
                  <tr key={r.id} onClick={() => setEditing(r.order)}>
                    <td>{r.ordernummer}</td>
                    <td>{r.besteldatum ? formatDate(r.besteldatum) : '-'}</td>
                    <td>
                      {r.leverancierscode}
                      {r.leverancierNaam ? ` — ${r.leverancierNaam}` : ''}
                    </td>
                    <td>{r.referentie || '-'}</td>
                    <td>{r.artikelnummer}</td>
                    <td>{r.artikelnaam}</td>
                    <td className="num">
                      {formatNumber(r.besteld)}
                      {r.eenheid ? ` ${r.eenheid}` : ''}
                    </td>
                    <td className="num">{formatNumber(r.ontvangen)}</td>
                    <td className="num">{formatNumber(r.open)}</td>
                    <td>{r.leverdatum ? formatDate(r.leverdatum) : '-'}</td>
                    <td>
                      <span className={'badge ' + (STATUS_BADGE[r.status] || 'badge-neutral')}>
                        {STATUS_LABEL[r.status] || r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {qrOpen && (
        <Modal title="Goederen ontvangen" onClose={() => setQrOpen(false)} width={440}>
          <TelefoonQr
            pad="/inkooporders/ontvangst"
            tekst="Scan de code met de telefoon. Kies daarna een artikel uit de openstaande inkooporders."
            alt="QR-code om goederen te ontvangen"
          />
          <p style={{ marginTop: 12 }}>
            <Link to="/inkooporders/ontvangst">Open op dit apparaat</Link>
          </p>
        </Modal>
      )}

      {editing && (
        <Modal title={`Inkooporder ${editing.ordernummer}`} onClose={() => setEditing(null)} width={1120}>
          <InkooporderForm inkooporder={editing} onDone={() => setEditing(null)} />
        </Modal>
      )}
    </div>
  )
}

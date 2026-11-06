import { useState } from 'react'
import { useOpenInkoopVoorArtikel } from '../../hooks/useOpenInkoopVoorArtikel'
import { formatDate, formatNumber } from '../../lib/format'
import { STATUS_LABEL } from '../../lib/inkooporders'
import ArtikelKiezer from '../../components/ArtikelKiezer'
import Modal from '../../components/Modal'
import InkooporderForm from './InkooporderForm'

const STATUS_BADGE = {
  'deels ontvangen': 'badge-warning',
  concept: 'badge-neutral',
  besteld: 'badge-warning',
  ontvangen: 'badge-success',
  geannuleerd: 'badge-danger',
}

// Kies een artikel en zie op welke inkooporders er nog iets van openstaat
// (nog te ontvangen). Klik op een regel om die inkooporder te openen.
export default function OpenPerArtikel() {
  const [tekst, setTekst] = useState('')
  const [artikel, setArtikel] = useState(null)
  const [openOrder, setOpenOrder] = useState(null)
  const { regels, totaal, loading, error } = useOpenInkoopVoorArtikel(artikel?.id)
  const eenheid = artikel?.eenheid ? ` ${artikel.eenheid}` : ''

  return (
    <div>
      <div className="field">
        <label>Artikel</label>
        <ArtikelKiezer
          value={tekst}
          onChange={setTekst}
          onKies={setArtikel}
          placeholder="Typ een artikelnummer of naam…"
          autoFocus
        />
        <span className="hint">
          {artikel ? `${artikel.artikelnummer} — ${artikel.naam}` : 'Kies een artikel uit de lijst om de openstaande inkooporders te zien.'}
        </span>
      </div>

      {error && <div className="banner banner-danger">{error}</div>}

      {artikel && (
        <>
          <h3 style={{ margin: '14px 0 8px' }}>
            Nog te ontvangen: <strong>{loading ? '…' : formatNumber(totaal)}</strong>
            {eenheid}
          </h3>
          {loading ? (
            <div className="empty-state">
              <div className="spinner" style={{ margin: '0 auto' }} />
            </div>
          ) : regels.length === 0 ? (
            <div className="empty-state">Er staat niets open op een inkooporder.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Leverancier</th>
                    <th className="num">Besteld</th>
                    <th className="num">Ontvangen</th>
                    <th className="num">Open</th>
                    <th>Leverdatum</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {regels.map((r) => (
                    <tr key={r.id} onClick={() => setOpenOrder(r.order)}>
                      <td>{r.ordernummer}</td>
                      <td>
                        {r.leverancierscode}
                        {r.leverancierNaam ? ` — ${r.leverancierNaam}` : ''}
                      </td>
                      <td className="num">{formatNumber(r.besteld)}</td>
                      <td className="num">{formatNumber(r.ontvangen)}</td>
                      <td className="num">
                        <strong>{formatNumber(r.open)}</strong>
                      </td>
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
        </>
      )}

      {openOrder && (
        <Modal title={`Inkooporder ${openOrder.ordernummer}`} onClose={() => setOpenOrder(null)} width={1120}>
          <InkooporderForm inkooporder={openOrder} onDone={() => setOpenOrder(null)} />
        </Modal>
      )}
    </div>
  )
}

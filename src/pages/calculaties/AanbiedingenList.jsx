import { useMemo, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useCollection } from '../../hooks/useCollection'
import { formatDate, formatPrijs } from '../../lib/format'
import {
  STATUS_BADGE,
  STATUS_LABEL,
  isArtikelAanbieding,
  maakArtikelAanbieding,
} from '../../lib/calculaties'
import Modal from '../../components/Modal'
import CalculatieForm from './CalculatieForm'
import ArtikelAanbiedingForm from './ArtikelAanbiedingForm'
import KlantKiezerVenster from './KlantKiezerVenster'

function prijsTekst(c) {
  const regels = c.regels || []
  if (regels.length === 0) return '-'
  const valuta = c.valuta && c.valuta !== 'EUR' ? `${c.valuta} ` : '€ '
  const prijzen = regels.map((r) => Number(r.prijs) || 0)
  const laag = Math.min(...prijzen)
  const hoog = Math.max(...prijzen)
  return laag === hoog ? `${valuta}${formatPrijs(laag)}` : `${valuta}${formatPrijs(laag)} – ${formatPrijs(hoog)}`
}

export default function AanbiedingenList() {
  const { profile } = useAuth()
  const { data: calculaties, loading } = useCollection('calculaties', { orderByField: 'datum', orderDirection: 'desc' })
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [editing, setEditing] = useState(null)
  const [showNieuw, setShowNieuw] = useState(false)
  const [aanmaken, setAanmaken] = useState(false)
  const [lijstFout, setLijstFout] = useState(null)

  // Nieuwe aanbieding: alleen de klant kiezen, de rest in het formulier.
  async function maakAanbiedingVoor(klant) {
    setLijstFout(null)
    setAanmaken(true)
    try {
      const aanbieding = await maakArtikelAanbieding({ klant, gebruiker: profile?.naam || profile?.email })
      setShowNieuw(false)
      setEditing(aanbieding)
    } catch (err) {
      setShowNieuw(false)
      setLijstFout(err.message)
    } finally {
      setAanmaken(false)
    }
  }

  const gefilterd = useMemo(() => {
    const q = search.trim().toLowerCase()
    return calculaties.filter(
      (c) =>
        (!status || c.status === status) &&
        (!q ||
          c.calculatienummer?.toLowerCase().includes(q) ||
          c.klantcode?.toLowerCase().includes(q) ||
          c.klantNaam?.toLowerCase().includes(q) ||
          c.artikelnummer?.toLowerCase().includes(q) ||
          c.klantArtikelnummer?.toLowerCase().includes(q) ||
          c.artikelRegels?.some(
            (r) => r.klantArtikelnummer?.toLowerCase().includes(q) || r.omschrijving?.toLowerCase().includes(q)
          ) ||
          c.omschrijving?.toLowerCase().includes(q) ||
          c.referentie?.toLowerCase().includes(q))
    )
  }, [calculaties, search, status])

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1>Aanbiedingen</h1>
          <div className="page-header-sub">{calculaties.length} {calculaties.length === 1 ? 'aanbieding' : 'aanbiedingen'}</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNieuw(true)}>
          + Nieuwe aanbieding
        </button>
      </div>

      {lijstFout && <div className="banner banner-danger">{lijstFout}</div>}

      <div className="card">
        <div className="card-pad" style={{ paddingBottom: 0 }}>
          <div className="data-table-toolbar" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              className="search-input"
              type="text"
              placeholder="Zoek op nummer, klant, artikel of referentie…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              style={{ width: 'auto' }}
              aria-label="Status"
            >
              <option value="">Alle statussen</option>
              {Object.entries(STATUS_LABEL).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {loading ? (
          <div className="empty-state">
            <div className="spinner" style={{ margin: '0 auto' }} />
          </div>
        ) : gefilterd.length === 0 ? (
          <div className="empty-state">
            {calculaties.length === 0 ? 'Nog geen aanbiedingen gemaakt.' : 'Geen aanbiedingen gevonden.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nummer</th>
                  <th>Datum</th>
                  <th>Klant</th>
                  <th>Artikel</th>
                  <th>Omschrijving</th>
                  <th>Aantallen</th>
                  <th className="num">Prijs per stuk</th>
                  <th>Status</th>
                  <th>Gemaild</th>
                </tr>
              </thead>
              <tbody>
                {gefilterd.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => setEditing(c)}
                  >
                    <td>{c.calculatienummer}</td>
                    <td>{formatDate(c.calculatiedatum)}</td>
                    <td>
                      {c.klantcode} — {c.klantNaam}
                    </td>
                    <td>
                      {c.artikelnummer}
                    </td>
                    <td>{c.omschrijving}</td>
                    <td>{(c.aantallen || []).join(', ') || '-'}</td>
                    <td className="num">{prijsTekst(c)}</td>
                    <td>
                      <span className={'badge ' + (STATUS_BADGE[c.status] || 'badge-neutral')}>
                        {STATUS_LABEL[c.status] || c.status}
                      </span>
                    </td>
                    <td>{c.gemaildOp ? formatDate(c.gemaildOp) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showNieuw && (
        <KlantKiezerVenster
          titel="Nieuwe aanbieding"
          knop={aanmaken ? 'Aanmaken…' : 'Aanmaken'}
          bezig={aanmaken}
          uitleg="Daarna voeg je artikelen toe en maak je per artikel een calculatie. Geblokkeerde klanten staan niet in de lijst."
          onKies={maakAanbiedingVoor}
          onAnnuleren={() => setShowNieuw(false)}
        />
      )}

      {editing &&
        (isArtikelAanbieding(editing) ? (
          <Modal title={`Aanbieding ${editing.calculatienummer}`} onClose={() => setEditing(null)} width={1100}>
            <ArtikelAanbiedingForm aanbieding={editing} onDone={() => setEditing(null)} />
          </Modal>
        ) : (
          // Calculatie van voor de aanbiedingen: één artikel per document.
          <Modal title={`Calculatie ${editing.calculatienummer}`} onClose={() => setEditing(null)} width={1100}>
            <CalculatieForm calculatie={editing} onDone={() => setEditing(null)} />
          </Modal>
        ))}
    </div>
  )
}

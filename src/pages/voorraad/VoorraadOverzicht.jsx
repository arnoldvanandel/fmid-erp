import { useMemo, useState } from 'react'
import { useCollection } from '../../hooks/useCollection'
import { useVoorraadTotals } from '../../hooks/useVoorraadTotals'
import { formatDateTime, formatNumber } from '../../lib/format'
import Modal from '../../components/Modal'
import MutatieForm from './MutatieForm'

const TYPE_LABEL = { in: 'In', uit: 'Uit', correctie: 'Correctie' }
const TYPE_BADGE = { in: 'badge-success', uit: 'badge-danger', correctie: 'badge-neutral' }

export default function VoorraadOverzicht() {
  const { data: artikelen, loading: loadingArtikelen } = useCollection('artikelen', {
    orderByField: 'artikelnummer',
  })
  const { data: mutaties, loading: loadingMutaties } = useCollection('voorraadmutaties', {
    orderByField: 'datum',
    orderDirection: 'desc',
  })
  const { totalenPerArtikel, standenPerArtikel } = useVoorraadTotals()

  const [search, setSearch] = useState('')
  const [alleenLaag, setAlleenLaag] = useState(false)
  const [mutatieVoor, setMutatieVoor] = useState(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return artikelen.filter((a) => {
      if (
        q &&
        !a.artikelnummer?.toLowerCase().includes(q) &&
        !a.naam?.toLowerCase().includes(q) &&
        !a.zoeknaam?.toLowerCase().includes(q)
      ) {
        return false
      }
      const totaal = totalenPerArtikel[a.id] || 0
      if (alleenLaag && !(totaal <= Number(a.minVoorraad || 0))) return false
      return true
    })
  }, [artikelen, search, alleenLaag, totalenPerArtikel])

  const laagAantal = artikelen.filter(
    (a) => (totalenPerArtikel[a.id] || 0) <= Number(a.minVoorraad || 0)
  ).length
  const voorraadWaarde = artikelen.reduce(
    (sum, a) => sum + (totalenPerArtikel[a.id] || 0) * (Number(a.inkoopprijs) || 0),
    0
  )

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1>Voorraad</h1>
          <div className="page-header-sub">Actuele voorraadstand per locatie en mutaties</div>
        </div>
      </div>

      <div className="stat-row">
        <div className="card stat-card">
          <div className="label">Aantal artikelen</div>
          <div className="value">{artikelen.length}</div>
        </div>
        <div className="card stat-card">
          <div className="label">Laag in voorraad</div>
          <div className="value" style={{ color: laagAantal > 0 ? 'var(--color-warning)' : undefined }}>
            {laagAantal}
          </div>
        </div>
        <div className="card stat-card">
          <div className="label">Voorraadwaarde (inkoop)</div>
          <div className="value">
            {voorraadWaarde.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' })}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-pad" style={{ paddingBottom: 0 }}>
          <div className="data-table-toolbar">
            <input
              className="search-input"
              type="text"
              placeholder="Zoek op artikelnummer, naam of zoeknaam…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={alleenLaag}
                onChange={(e) => setAlleenLaag(e.target.checked)}
                style={{ width: 'auto' }}
              />
              Alleen lage voorraad
            </label>
          </div>
        </div>

        {loadingArtikelen ? (
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
                  <th>Locaties</th>
                  <th className="num">Totale voorraad</th>
                  <th className="num">Min. voorraad</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => {
                  const totaal = totalenPerArtikel[a.id] || 0
                  const standen = standenPerArtikel[a.id] || []
                  const laag = totaal <= Number(a.minVoorraad || 0)
                  return (
                    <tr key={a.id}>
                      <td>{a.artikelnummer}</td>
                      <td>{a.naam}</td>
                      <td>
                        {standen.length === 0
                          ? '-'
                          : standen.map((s) => `${s.locatieCode}: ${formatNumber(s.aantal)}`).join(', ')}
                      </td>
                      <td className="num">
                        {formatNumber(totaal)} {a.eenheid}
                        {laag && (
                          <span className="badge badge-warning" style={{ marginLeft: 8 }}>
                            laag
                          </span>
                        )}
                      </td>
                      <td className="num">{formatNumber(a.minVoorraad || 0)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => setMutatieVoor(a)}>
                          Mutatie boeken
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-pad" style={{ paddingBottom: 12 }}>
          <h2>Recente mutaties</h2>
        </div>
        {loadingMutaties ? (
          <div className="empty-state"><div className="spinner" style={{ margin: '0 auto' }} /></div>
        ) : mutaties.length === 0 ? (
          <div className="empty-state">Nog geen mutaties geboekt.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Artikel</th>
                  <th>Locatie</th>
                  <th>Type</th>
                  <th className="num">Van</th>
                  <th className="num">Naar</th>
                  <th>Reden</th>
                  <th>Door</th>
                </tr>
              </thead>
              <tbody>
                {mutaties.slice(0, 50).map((m) => (
                  <tr key={m.id} style={{ cursor: 'default' }}>
                    <td>{formatDateTime(m.datum)}</td>
                    <td>
                      {m.artikelnummer} — {m.artikelnaam}
                    </td>
                    <td>{m.locatieCode || '-'}</td>
                    <td>
                      <span className={'badge ' + (TYPE_BADGE[m.type] || 'badge-neutral')}>
                        {TYPE_LABEL[m.type] || m.type}
                      </span>
                    </td>
                    <td className="num">{formatNumber(m.voorraadVoor)}</td>
                    <td className="num">{formatNumber(m.voorraadNa)}</td>
                    <td>{m.reden || '-'}</td>
                    <td>{m.gebruiker || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {mutatieVoor && (
        <Modal title="Voorraadmutatie boeken" onClose={() => setMutatieVoor(null)}>
          <MutatieForm
            artikel={mutatieVoor}
            standen={standenPerArtikel[mutatieVoor.id] || []}
            onDone={() => setMutatieVoor(null)}
          />
        </Modal>
      )}
    </div>
  )
}

import { useMemo, useRef, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useCollection } from '../../hooks/useCollection'
import Modal from '../../components/Modal'
import { importeerVoorschriften, leesVoorschriftenUitExcel } from '../../lib/verpakken'
import VoorschriftForm from './VoorschriftForm'
import './verpakken.css'

function getal(waarde) {
  if (waarde === null || waarde === undefined || waarde === '') return '—'
  return Number(waarde).toLocaleString('nl-NL', { maximumFractionDigits: 6 })
}

export default function Voorschriften() {
  const { profile, isAdmin } = useAuth()
  const gebruiker = profile?.naam || profile?.email || ''
  const { data, loading, error } = useCollection('verpakkingen', { orderByField: 'artikelnummer' })
  const [zoek, setZoek] = useState('')
  const [bewerken, setBewerken] = useState(null)
  const [importVraag, setImportVraag] = useState(null)
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState(null)
  const [melding, setMelding] = useState(null)
  const bestand = useRef(null)

  const lijst = useMemo(() => {
    const t = zoek.trim().toLowerCase()
    if (!t) return data
    return data.filter((v) =>
      [v.artikelnummer, v.artikelnummerKlant, v.soortDoos, v.opmerkingen].some((w) =>
        String(w || '').toLowerCase().includes(t)
      )
    )
  }, [data, zoek])

  async function kiesExcel(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setFout(null)
    setMelding(null)
    try {
      const { voorschriften, overgeslagen } = await leesVoorschriftenUitExcel(file)
      if (voorschriften.length === 0) throw new Error('Geen voorschriften gevonden in dit bestand.')
      const bestaand = new Set(data.map((v) => v.artikelnummer.toUpperCase()))
      const overschreven = voorschriften.filter((v) => bestaand.has(v.artikelnummer.toUpperCase())).length
      setImportVraag({ naam: file.name, voorschriften, overgeslagen, overschreven })
    } catch (err) {
      setFout(`Excel niet gelezen: ${err.message}`)
    }
  }

  async function importeer() {
    setBezig(true)
    try {
      await importeerVoorschriften(importVraag.voorschriften, gebruiker)
      setMelding(`${importVraag.voorschriften.length} voorschriften geïmporteerd uit ${importVraag.naam}.`)
      setImportVraag(null)
    } catch (err) {
      setFout(err.message)
    } finally {
      setBezig(false)
    }
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1>Verpakkingsvoorschriften</h1>
          <div className="page-header-sub">
            {loading ? '' : `${data.length} voorschriften · `}hoe een artikel verpakt en gewogen wordt
          </div>
        </div>
        <div className="verpak-knoppen">
          {isAdmin && (
            <>
              <button type="button" className="btn btn-secondary" onClick={() => bestand.current?.click()}>
                Importeren uit Excel
              </button>
              <input
                ref={bestand}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                hidden
                onChange={kiesExcel}
              />
            </>
          )}
          <button type="button" className="btn btn-primary" onClick={() => setBewerken({})}>
            + Nieuw voorschrift
          </button>
        </div>
      </div>

      {fout && <div className="banner banner-danger">{fout}</div>}
      {melding && <div className="banner banner-info">{melding}</div>}

      <div className="card">
        <div className="card-pad" style={{ paddingBottom: 0 }}>
          <div className="data-table-toolbar">
            <input
              className="search-input"
              type="text"
              placeholder="Zoek op artikelnummer, klantnummer, doos of opmerking…"
              value={zoek}
              onChange={(e) => setZoek(e.target.value)}
            />
          </div>
        </div>
        {error && <div className="banner banner-danger" style={{ margin: '0 20px 16px' }}>{error}</div>}
        {loading ? (
          <div className="empty-state">
            <div className="spinner" style={{ margin: '0 auto' }} />
          </div>
        ) : lijst.length === 0 ? (
          <div className="empty-state">
            {zoek.trim() ? 'Geen voorschriften gevonden.' : 'Nog geen voorschriften. Voeg er een toe of importeer de Excel.'}
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Artikelnummer</th>
                <th>Artikelnr. klant</th>
                <th>Soort doos</th>
                <th>Soort zak</th>
                <th className="num">Per doos</th>
                <th className="num">Gewicht/st. (kg)</th>
                <th className="num">Tarra (kg)</th>
                <th>Opmerkingen</th>
              </tr>
            </thead>
            <tbody>
              {lijst.map((v) => (
                <tr key={v.id} onClick={() => setBewerken(v)}>
                  <td>{v.artikelnummer}</td>
                  <td>{v.artikelnummerKlant || '—'}</td>
                  <td>{v.soortDoos || '—'}</td>
                  <td>{v.soortZak || '—'}</td>
                  <td className="num">{getal(v.aantalPerDoos)}</td>
                  <td className="num">{getal(v.gewichtPerProduct)}</td>
                  <td className="num">{getal(v.tarraDoos)}</td>
                  <td>{v.opmerkingen || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {bewerken && (
        <Modal
          title={bewerken.id ? `Voorschrift ${bewerken.artikelnummer}` : 'Nieuw verpakkingsvoorschrift'}
          onClose={() => setBewerken(null)}
          width={720}
        >
          <VoorschriftForm voorschrift={bewerken} onDone={() => setBewerken(null)} />
        </Modal>
      )}

      {importVraag && (
        <Modal title="Importeren uit Excel" onClose={() => !bezig && setImportVraag(null)} width={480}>
          <p>
            {importVraag.naam}: {importVraag.voorschriften.length} voorschriften.
          </p>
          {importVraag.overschreven > 0 && (
            <div className="banner banner-warning">
              {importVraag.overschreven} artikelen hebben al een voorschrift; die worden overschreven.
            </div>
          )}
          {importVraag.overgeslagen > 0 && (
            <p className="hint">
              {importVraag.overgeslagen} dubbele regels overgeslagen (de eerste regel per artikel telt).
            </p>
          )}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setImportVraag(null)} disabled={bezig}>
              Annuleren
            </button>
            <button type="button" className="btn btn-primary" onClick={importeer} disabled={bezig}>
              {bezig ? 'Importeren…' : 'Importeren'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

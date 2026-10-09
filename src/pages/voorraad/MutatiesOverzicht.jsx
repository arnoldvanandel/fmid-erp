import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BRON_LABEL, bronVan, useMutaties } from '../../hooks/useMutaties'
import { formatDateTime, formatNumber } from '../../lib/format'
import ArtikelKiezer from '../../components/ArtikelKiezer'
import LocatieKiezer from '../../components/LocatieKiezer'

export const TYPE_LABEL = { in: 'In', uit: 'Uit', correctie: 'Correctie' }
export const TYPE_BADGE = { in: 'badge-success', uit: 'badge-danger', correctie: 'badge-neutral' }

// Mutatie als +/- aantal; een correctie is het verschil met de oude stand.
export function mutatieAantal(m) {
  const verschil = (Number(m.voorraadNa) || 0) - (Number(m.voorraadVoor) || 0)
  return `${verschil > 0 ? '+' : ''}${formatNumber(verschil, Number.isInteger(verschil) ? 0 : 2)}`
}

function csvWaarde(v) {
  const t = String(v ?? '')
  return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
}

// CSV met puntkomma's, zodat Excel (NL) de kolommen direct goed opent.
function exporteer(mutaties) {
  const kop = ['Datum', 'Artikelnummer', 'Artikelnaam', 'Locatie', 'Soort', 'Mutatie', 'Voorraad voor', 'Voorraad na', 'Herkomst', 'Document', 'Relatie', 'Reden', 'Door']
  const rijen = mutaties.map((m) => [
    formatDateTime(m.datum),
    m.artikelnummer,
    m.artikelnaam,
    m.locatieCode,
    TYPE_LABEL[m.type] || m.type,
    String((Number(m.voorraadNa) || 0) - (Number(m.voorraadVoor) || 0)).replace('.', ','),
    String(m.voorraadVoor ?? '').replace('.', ','),
    String(m.voorraadNa ?? '').replace('.', ','),
    BRON_LABEL[bronVan(m)],
    m.bronNummer || '',
    m.relatie || '',
    m.reden || '',
    m.gebruiker || '',
  ])
  const tekst = '﻿' + [kop, ...rijen].map((r) => r.map(csvWaarde).join(';')).join('\r\n')
  const url = URL.createObjectURL(new Blob([tekst], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `voorraadmutaties-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// Alle voorraadmutaties met filters: artikel, locatie, soort, herkomst en periode.
export default function MutatiesOverzicht() {
  // Vanuit een artikel: /voorraad/mutaties?artikel=<artikelnummer>
  const [params] = useSearchParams()
  const [artikelnummer, setArtikelnummer] = useState(params.get('artikel') || '')
  const [artikel, setArtikel] = useState(null)
  const [locatieCode, setLocatieCode] = useState('')
  const [locatie, setLocatie] = useState(null)
  const [type, setType] = useState('')
  const [bron, setBron] = useState('')
  const [van, setVan] = useState('')
  const [tot, setTot] = useState('')

  const { mutaties, loading, error } = useMutaties({
    artikelId: artikel?.id,
    locatieId: locatie?.id,
    van,
    tot,
    type,
    bron,
    max: 500,
  })

  const onbekend = (artikelnummer.trim() && !artikel) || (locatieCode.trim() && !locatie)
  const totaalIn = mutaties.filter((m) => m.type === 'in').reduce((s, m) => s + (Number(m.aantal) || 0), 0)
  const totaalUit = mutaties.filter((m) => m.type === 'uit').reduce((s, m) => s + (Number(m.aantal) || 0), 0)

  function wisFilters() {
    setArtikelnummer('')
    setLocatieCode('')
    setType('')
    setBron('')
    setVan('')
    setTot('')
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1>Voorraadmutaties</h1>
          <div className="page-header-sub">
            Alle boekingen op de voorraad: handmatig, ontvangsten van inkooporders en pakbonnen
          </div>
        </div>
        <button className="btn btn-secondary" onClick={() => exporteer(mutaties)} disabled={mutaties.length === 0}>
          Exporteren (Excel)
        </button>
      </div>

      <div className="card">
        <div className="card-pad" style={{ paddingBottom: 4 }}>
          <div className="field-row">
            <div className="field">
              <label>Artikel</label>
              <ArtikelKiezer
                value={artikelnummer}
                onChange={setArtikelnummer}
                onKies={setArtikel}
                placeholder="Artikelnummer…"
              />
            </div>
            <div className="field">
              <label>Locatie</label>
              <LocatieKiezer value={locatieCode} onChange={setLocatieCode} onKies={setLocatie} placeholder="Locatiecode…" />
            </div>
            <div className="field">
              <label>Soort</label>
              <select value={type} onChange={(e) => setType(e.target.value)}>
                <option value="">Alle</option>
                {Object.entries(TYPE_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Herkomst</label>
              <select value={bron} onChange={(e) => setBron(e.target.value)}>
                <option value="">Alle</option>
                {Object.entries(BRON_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Van</label>
              <input type="date" value={van} onChange={(e) => setVan(e.target.value)} />
            </div>
            <div className="field">
              <label>Tot en met</label>
              <input type="date" value={tot} onChange={(e) => setTot(e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span className="hint">
              {loading
                ? 'Laden…'
                : `${formatNumber(mutaties.length)} ${mutaties.length === 1 ? 'mutatie' : 'mutaties'}${mutaties.length === 500 ? ' (maximaal 500; verfijn de filters)' : ''}` +
                  (artikel ? ` · in ${formatNumber(totaalIn, 2)} · uit ${formatNumber(totaalUit, 2)} ${artikel.eenheid || ''}` : '')}
            </span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={wisFilters}>
              Filters wissen
            </button>
          </div>
        </div>

        {error && <div className="banner banner-danger" style={{ margin: '0 20px 16px' }}>{error}</div>}
        {onbekend && (
          <div className="banner banner-warning" style={{ margin: '0 20px 16px' }}>
            Onbekend artikel of onbekende locatie; dat filter wordt niet toegepast.
          </div>
        )}

        {loading && mutaties.length === 0 ? (
          <div className="empty-state">
            <div className="spinner" style={{ margin: '0 auto' }} />
          </div>
        ) : mutaties.length === 0 ? (
          <div className="empty-state">Geen mutaties gevonden.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Artikel</th>
                  <th>Locatie</th>
                  <th>Soort</th>
                  <th className="num">Mutatie</th>
                  <th className="num">Van</th>
                  <th className="num">Naar</th>
                  <th>Herkomst</th>
                  <th>Reden</th>
                  <th>Door</th>
                </tr>
              </thead>
              <tbody>
                {mutaties.map((m) => (
                  <tr key={m.id} style={{ cursor: 'default' }}>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(m.datum)}</td>
                    <td>
                      {m.artikelnummer} — {m.artikelnaam}
                    </td>
                    <td>{m.locatieCode || '-'}</td>
                    <td>
                      <span className={'badge ' + (TYPE_BADGE[m.type] || 'badge-neutral')}>{TYPE_LABEL[m.type] || m.type}</span>
                    </td>
                    <td className="num">{mutatieAantal(m)}</td>
                    <td className="num">{formatNumber(m.voorraadVoor)}</td>
                    <td className="num">{formatNumber(m.voorraadNa)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {BRON_LABEL[bronVan(m)]}
                      {m.bronNummer && ` ${m.bronNummer}`}
                      {m.relatie && <div className="hint">{m.relatie}</div>}
                    </td>
                    <td>{m.reden || '-'}</td>
                    <td>{m.gebruiker || '-'}</td>
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

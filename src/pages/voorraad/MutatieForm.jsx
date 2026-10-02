import { useState } from 'react'
import { boekVoorraadMutatie } from '../../lib/voorraad'
import { useAuth } from '../../contexts/AuthContext'
import { useCollection } from '../../hooks/useCollection'
import { formatNumber } from '../../lib/format'

export default function MutatieForm({ artikel, standen, onDone }) {
  const { profile } = useAuth()
  const { data: locaties, loading: loadingLocaties } = useCollection('locaties', { orderByField: 'code' })
  const [locatieId, setLocatieId] = useState(standen?.[0]?.locatieId || '')
  const [type, setType] = useState('in')
  const [aantal, setAantal] = useState('')
  const [reden, setReden] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const standVanGekozenLocatie = standen?.find((s) => s.locatieId === locatieId)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (!locatieId) {
      setError('Kies een locatie.')
      return
    }
    setSaving(true)
    try {
      await boekVoorraadMutatie({
        artikelId: artikel.id,
        locatieId,
        type,
        aantal,
        reden,
        gebruiker: profile?.naam || profile?.email,
      })
      onDone?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <p className="page-header-sub" style={{ marginBottom: 4 }}>
        {artikel.artikelnummer} — {artikel.naam}
      </p>

      {standen && standen.length > 0 && (
        <table className="data-table" style={{ marginBottom: 16 }}>
          <thead>
            <tr>
              <th>Locatie</th>
              <th className="num">Voorraad</th>
            </tr>
          </thead>
          <tbody>
            {standen.map((s) => (
              <tr key={s.locatieId} style={{ cursor: 'default' }}>
                <td>{s.locatieCode}</td>
                <td className="num">
                  {formatNumber(s.aantal)} {artikel.eenheid}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <form onSubmit={handleSubmit}>
        {error && <div className="banner banner-danger">{error}</div>}

        {!loadingLocaties && locaties.length === 0 ? (
          <div className="banner banner-danger">
            Er zijn nog geen locaties aangemaakt. Voeg eerst een locatie toe via de pagina
            "Locaties" voordat je een mutatie kunt boeken.
          </div>
        ) : (
          <>
            <div className="field">
              <label>Locatie</label>
              <select value={locatieId} onChange={(e) => setLocatieId(e.target.value)}>
                <option value="">Kies locatie…</option>
                {locaties.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.code} {l.naam ? `— ${l.naam}` : ''}
                  </option>
                ))}
              </select>
              {standVanGekozenLocatie && (
                <span className="hint">
                  Huidige voorraad op deze locatie: {formatNumber(standVanGekozenLocatie.aantal)}{' '}
                  {artikel.eenheid}
                </span>
              )}
            </div>

            <div className="field">
              <label>Type mutatie</label>
              <select value={type} onChange={(e) => setType(e.target.value)}>
                <option value="in">Inboeken (ontvangst)</option>
                <option value="uit">Afboeken (uitgifte/verkoop)</option>
                <option value="correctie">Correctie (nieuwe telling)</option>
              </select>
            </div>

            <div className="field">
              <label>{type === 'correctie' ? 'Nieuwe voorraadstand' : 'Aantal'}</label>
              <input
                type="number"
                min="0"
                step="1"
                value={aantal}
                onChange={(e) => setAantal(e.target.value)}
                autoFocus
              />
            </div>

            <div className="field">
              <label>Reden / referentie</label>
              <input
                type="text"
                value={reden}
                onChange={(e) => setReden(e.target.value)}
                placeholder="bijv. ordernr., leverancier, telling"
              />
            </div>
          </>
        )}

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onDone} disabled={saving}>
            Annuleren
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving || locaties.length === 0}>
            {saving ? 'Boeken…' : 'Boeken'}
          </button>
        </div>
      </form>
    </div>
  )
}

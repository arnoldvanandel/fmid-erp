import { useMemo, useState } from 'react'
import { maakProductieorder } from '../../lib/productieorders'
import { useAuth } from '../../contexts/AuthContext'
import { useCollection } from '../../hooks/useCollection'

export default function ProductieorderForm({ onDone }) {
  const { profile } = useAuth()
  const { data: artikelen, loading: loadingArtikelen } = useCollection('artikelen', {
    orderByField: 'artikelnummer',
  })
  const [artikelId, setArtikelId] = useState('')
  const [aantal, setAantal] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const artikelenById = useMemo(() => {
    const map = {}
    for (const a of artikelen) map[a.id] = a
    return map
  }, [artikelen])

  const gekozenArtikel = artikelenById[artikelId]

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (!gekozenArtikel) {
      setError('Kies een artikel.')
      return
    }
    setSaving(true)
    try {
      await maakProductieorder({
        artikel: gekozenArtikel,
        aantal,
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
    <form onSubmit={handleSubmit}>
      {error && <div className="banner banner-danger">{error}</div>}

      {!loadingArtikelen && artikelen.length === 0 ? (
        <div className="banner banner-danger">
          Er zijn nog geen artikelen aangemaakt. Voeg eerst een artikel toe voordat je een
          productieorder kunt aanmaken.
        </div>
      ) : (
        <>
          <div className="field">
            <label>Artikel</label>
            <select value={artikelId} onChange={(e) => setArtikelId(e.target.value)}>
              <option value="">Kies artikel…</option>
              {artikelen.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.artikelnummer} — {a.naam}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Aantal</label>
            <input
              type="number"
              min="0"
              step="1"
              value={aantal}
              onChange={(e) => setAantal(e.target.value)}
              autoFocus
            />
            {gekozenArtikel?.eenheid && <span className="hint">{gekozenArtikel.eenheid}</span>}
          </div>
        </>
      )}

      <div className="modal-actions">
        <button type="button" className="btn btn-secondary" onClick={onDone} disabled={saving}>
          Annuleren
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving || artikelen.length === 0}>
          {saving ? 'Aanmaken…' : 'Aanmaken'}
        </button>
      </div>
    </form>
  )
}

import { useState } from 'react'
import { maakProductieorder } from '../../lib/productieorders'
import { useAuth } from '../../contexts/AuthContext'
import ArtikelKiezer from '../../components/ArtikelKiezer'

export default function ProductieorderForm({ onDone }) {
  const { profile } = useAuth()
  const [artikelTekst, setArtikelTekst] = useState('')
  const [gekozenArtikel, setGekozenArtikel] = useState(null)
  const [aantal, setAantal] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

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

      <div className="field">
        <label>Artikel</label>
        <ArtikelKiezer
          value={artikelTekst}
          onChange={setArtikelTekst}
          onKies={setGekozenArtikel}
          placeholder="Typ artikelnummer of naam…"
          autoFocus
        />
        {gekozenArtikel && <span className="hint">{gekozenArtikel.naam}</span>}
      </div>

      <div className="field">
        <label>Aantal</label>
        <input
          type="number"
          min="0"
          step="1"
          value={aantal}
          onChange={(e) => setAantal(e.target.value)}
        />
        {gekozenArtikel?.eenheid && <span className="hint">{gekozenArtikel.eenheid}</span>}
      </div>

      <div className="modal-actions">
        <button type="button" className="btn btn-secondary" onClick={onDone} disabled={saving}>
          Annuleren
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Aanmaken…' : 'Aanmaken'}
        </button>
      </div>
    </form>
  )
}

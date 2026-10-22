import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { formatNumber } from '../../lib/format'
import { haalArtikelOpNummer } from '../../lib/artikelZoeken'
import { nieuweSjabloonRegel, verwijderSjabloon, wijzigSjabloon } from '../../lib/inkoopsjablonen'
import ArtikelKiezer from '../../components/ArtikelKiezer'

// Bewerken van een inkoopsjabloon: naam, kopvelden en de vaste regels. Alles
// wordt pas bij "Opslaan" weggeschreven (het sjabloon is één document).
export default function SjabloonForm({ sjabloon, onMaakOrder, onDone }) {
  const { isAdmin, profile } = useAuth()
  const [naam, setNaam] = useState(sjabloon.naam || '')
  const [referentie, setReferentie] = useState(sjabloon.referentie || '')
  const [levering, setLevering] = useState(sjabloon.levering || '')
  const [opmerkingen, setOpmerkingen] = useState(sjabloon.opmerkingen || '')
  const [regels, setRegels] = useState(sjabloon.regels || [])
  const [nieuwNummer, setNieuwNummer] = useState('')
  const [nieuwArtikel, setNieuwArtikel] = useState(null)
  const [nieuwAantal, setNieuwAantal] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  function wijzigRegel(i, updates) {
    setRegels((lijst) => lijst.map((r, j) => (j === i ? { ...r, ...updates } : r)))
  }

  async function regelToevoegen() {
    setError(null)
    const artikel = nieuwArtikel || (await haalArtikelOpNummer(nieuwNummer))
    if (!artikel) {
      setError(nieuwNummer.trim() ? `Artikel "${nieuwNummer.trim()}" bestaat niet.` : 'Vul een artikelnummer in.')
      return
    }
    if (!(Number(nieuwAantal) > 0)) {
      setError('Hoeveelheid moet groter dan 0 zijn.')
      return
    }
    setRegels((lijst) => [...lijst, nieuweSjabloonRegel(artikel, Number(nieuwAantal))])
    setNieuwNummer('')
    setNieuwArtikel(null)
    setNieuwAantal('')
  }

  async function opslaan() {
    setError(null)
    if (regels.some((r) => !(Number(r.aantal) > 0))) {
      setError('Elke regel moet een hoeveelheid groter dan 0 hebben.')
      return false
    }
    setSaving(true)
    try {
      await wijzigSjabloon(
        sjabloon.id,
        {
          naam: naam.trim(),
          referentie: referentie.trim(),
          levering: levering.trim(),
          opmerkingen: opmerkingen.trim(),
          regels,
        },
        profile?.naam || profile?.email
      )
      return true
    } catch (err) {
      setError(err.message)
      return false
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm(`Sjabloon "${sjabloon.naam}" verwijderen?`)) return
    setSaving(true)
    try {
      await verwijderSjabloon(sjabloon.id)
      onDone?.()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div>
      {error && <div className="banner banner-danger">{error}</div>}

      <div className="field-row">
        <div className="field">
          <label>Naam sjabloon</label>
          <input type="text" value={naam} onChange={(e) => setNaam(e.target.value)} />
        </div>
        <div className="field">
          <label>Leverancier</label>
          <input type="text" value={`${sjabloon.leverancierscode} — ${sjabloon.leverancierNaam}`} disabled />
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label>Uw referentie</label>
          <input
            type="text"
            value={referentie}
            onChange={(e) => setReferentie(e.target.value)}
            placeholder="Leeg = contactpersoon leverancier"
          />
        </div>
        <div className="field">
          <label>Levering</label>
          <input
            type="text"
            value={levering}
            onChange={(e) => setLevering(e.target.value)}
            placeholder="Leeg = standaard van de leverancier"
          />
        </div>
      </div>
      <div className="field">
        <label>Opmerkingen (komen onder de regels op de inkooporder)</label>
        <textarea rows={2} value={opmerkingen} onChange={(e) => setOpmerkingen(e.target.value)} />
      </div>

      <h3 style={{ margin: '12px 0 8px' }}>Vaste regels</h3>
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Artikelnummer</th>
              <th>Artikelnaam</th>
              <th className="num">Hoeveelheid</th>
              <th>Eenheid</th>
              <th className="num">Laatste prijs</th>
              <th>Art.nr. leverancier</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {regels.map((r, i) => (
              <tr key={`${r.artikelId}-${i}`}>
                <td>{r.artikelnummer}</td>
                <td>{r.artikelnaam}</td>
                <td className="num">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    style={{ width: 90, textAlign: 'right' }}
                    value={r.aantal}
                    onChange={(e) => wijzigRegel(i, { aantal: e.target.value === '' ? '' : Number(e.target.value) })}
                  />
                </td>
                <td>{r.eenheid}</td>
                <td className="num">{formatNumber(r.prijs, 2)}</td>
                <td>
                  <input
                    type="text"
                    value={r.leverancierArtikelnummer || ''}
                    onChange={(e) => wijzigRegel(i, { leverancierArtikelnummer: e.target.value })}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    title="Regel uit het sjabloon halen"
                    onClick={() => setRegels((lijst) => lijst.filter((_, j) => j !== i))}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
            <tr>
              <td>
                <ArtikelKiezer
                  placeholder="Nieuw artikel…"
                  value={nieuwNummer}
                  onChange={setNieuwNummer}
                  onKies={setNieuwArtikel}
                />
              </td>
              <td>{nieuwArtikel?.naam || ''}</td>
              <td className="num">
                <input
                  type="number"
                  min="0"
                  step="any"
                  style={{ width: 90, textAlign: 'right' }}
                  value={nieuwAantal}
                  onChange={(e) => setNieuwAantal(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      regelToevoegen()
                    }
                  }}
                />
              </td>
              <td>{nieuwArtikel?.eenheid || ''}</td>
              <td colSpan={3}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={regelToevoegen}>
                  + Regel toevoegen
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="hint" style={{ marginTop: 6 }}>
        De prijs op een nieuwe inkooporder komt uit de actuele inkoopprijs of inkoopstaffel van het artikel. "Laatste
        prijs" is alleen ter informatie.
      </p>

      <div className="modal-actions" style={{ justifyContent: isAdmin ? 'space-between' : 'flex-end' }}>
        {isAdmin && (
          <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={saving}>
            Sjabloon verwijderen
          </button>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-secondary" onClick={onDone} disabled={saving}>
            Sluiten
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={saving || regels.length === 0}
            onClick={async () => {
              if (await opslaan()) {
                onMaakOrder?.({
                  ...sjabloon,
                  naam: naam.trim(),
                  referentie: referentie.trim(),
                  levering: levering.trim(),
                  opmerkingen: opmerkingen.trim(),
                  regels,
                })
              }
            }}
          >
            Opslaan en inkooporder maken
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={saving}
            onClick={async () => {
              if (await opslaan()) onDone?.()
            }}
          >
            {saving ? 'Opslaan…' : 'Opslaan'}
          </button>
        </div>
      </div>
    </div>
  )
}

import { useMemo, useState } from 'react'
import Modal from '../../components/Modal'
import { useCollection } from '../../hooks/useCollection'

// Een klant kiezen: voor een nieuwe aanbieding, of een andere klant voor een
// bestaande. Geblokkeerde klanten staan er niet in.
export default function KlantKiezerVenster({
  huidigeKlantId,
  onKies,
  onAnnuleren,
  titel = 'Andere klant kiezen',
  knop = 'Kiezen',
  bezig = false,
  uitleg = 'Naam, adres, contactpersoon en taal van de aanbieding worden die van de gekozen klant. Het artikelnummer blijft hetzelfde.',
}) {
  const { data: klanten, loading } = useCollection('klanten', { orderByField: 'klantcode' })
  const [zoek, setZoek] = useState('')
  const [klantId, setKlantId] = useState(huidigeKlantId || '')

  const gefilterd = useMemo(() => {
    const q = zoek.trim().toLowerCase()
    const actief = klanten.filter((k) => !k.geblokkeerd)
    if (!q) return actief
    return actief.filter(
      (k) =>
        k.klantcode?.toLowerCase().includes(q) ||
        k.naam?.toLowerCase().includes(q) ||
        k.zoeknaam?.toLowerCase().includes(q) ||
        k.plaats?.toLowerCase().includes(q)
    )
  }, [klanten, zoek])
  const klant = klanten.find((k) => k.id === klantId)

  function kies(e) {
    e.preventDefault()
    // Het venster staat via een portal binnen het calculatieformulier.
    e.stopPropagation()
    if (klant) onKies(klant)
  }

  return (
    <Modal title={titel} onClose={onAnnuleren} width={600}>
      <form onSubmit={kies}>
        <div className="field">
          <label>Zoek klant</label>
          <input
            type="text"
            value={zoek}
            onChange={(e) => setZoek(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              e.preventDefault()
              if (gefilterd.length === 1) setKlantId(gefilterd[0].id)
            }}
            placeholder="Klantnummer, naam of plaats…"
            autoFocus
          />
        </div>
        <div className="field">
          <label>Klant</label>
          <div className="klant-keuze" role="listbox" aria-label="Klant">
            {loading ? (
              <div className="hint" style={{ padding: '8px 10px' }}>
                Klanten laden…
              </div>
            ) : gefilterd.length === 0 ? (
              <div className="hint" style={{ padding: '8px 10px' }}>
                Geen klanten gevonden.
              </div>
            ) : (
              gefilterd.map((k) => (
                <button
                  type="button"
                  key={k.id}
                  role="option"
                  aria-selected={klantId === k.id}
                  className={klantId === k.id ? 'geselecteerd' : ''}
                  onClick={() => setKlantId(k.id)}
                  onDoubleClick={() => !bezig && onKies(k)}
                >
                  {k.klantcode} — {k.naam}
                  {k.plaats ? ` (${k.plaats})` : ''}
                </button>
              ))
            )}
          </div>
          <span className="hint">{uitleg}</span>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onAnnuleren}>
            Annuleren
          </button>
          <button type="submit" className="btn btn-primary" disabled={bezig || !klant || klant.id === huidigeKlantId}>
            {knop}
          </button>
        </div>
      </form>
    </Modal>
  )
}

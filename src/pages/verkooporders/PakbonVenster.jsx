import { useState } from 'react'
import { useCollection } from '../../hooks/useCollection'
import { formatNumber } from '../../lib/format'
import { maakPakbon } from '../../lib/verkooporders'
import Modal from '../../components/Modal'
import { GetalCel } from '../../components/RegelGrid'

// Pakbon maken: per regel hoeveel er nu geleverd wordt (standaard alles wat
// nog openstaat), en eventueel de voorraad afboeken van een locatie.
export default function PakbonVenster({ order, regels, gebruiker, onKlaar }) {
  const { data: locaties } = useCollection('locaties', { orderByField: 'code' })
  const open = regels.filter((r) => (Number(r.geleverd) || 0) < Number(r.aantal))
  const [aantallen, setAantallen] = useState(() =>
    Object.fromEntries(open.map((r) => [r.id, Number(r.aantal) - (Number(r.geleverd) || 0)]))
  )
  const [leverdatum, setLeverdatum] = useState(new Date().toISOString().slice(0, 10))
  const [locatieId, setLocatieId] = useState('')
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState(null)

  async function handleMaken() {
    setFout(null)
    for (const r of open) {
      const n = Number(aantallen[r.id]) || 0
      const rest = Number(r.aantal) - (Number(r.geleverd) || 0)
      if (n < 0 || n > rest) {
        setFout(`${r.artikelnummer}: je kunt maximaal ${formatNumber(rest)} leveren.`)
        return
      }
    }
    setBezig(true)
    try {
      const pakbon = await maakPakbon({ verkooporderId: order.id, aantallen, locatieId, leverdatum, gebruiker })
      onKlaar(pakbon)
    } catch (err) {
      setFout(err.message)
      setBezig(false)
    }
  }

  return (
    <Modal title={`Pakbon maken — ${order.ordernummer}`} onClose={bezig ? undefined : () => onKlaar(null)} width={760}>
      {fout && <div className="banner banner-danger">{fout}</div>}

      <div className="field-row">
        <div className="field">
          <label>Leverdatum</label>
          <input type="date" value={leverdatum} onChange={(e) => setLeverdatum(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 2 }}>
          <label>Voorraad afboeken van</label>
          <select value={locatieId} onChange={(e) => setLocatieId(e.target.value)}>
            <option value="">Niet afboeken</option>
            {locaties.map((l) => (
              <option key={l.id} value={l.id}>
                {l.code}
                {l.naam ? ` — ${l.naam}` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="regel-grid-wrap" style={{ marginBottom: 6 }}>
        <table className="regel-grid">
          <thead>
            <tr>
              <th>Artikelnummer</th>
              <th>Artikelnaam</th>
              <th className="num">Besteld</th>
              <th className="num">Al geleverd</th>
              <th className="num">Nu leveren</th>
            </tr>
          </thead>
          <tbody>
            {open.map((r, i) => (
              <tr key={r.id}>
                <td className="alleen-lezen">{r.artikelnummer}</td>
                <td className="alleen-lezen">{r.artikelnaam}</td>
                <td className="num alleen-lezen">{formatNumber(r.aantal)}</td>
                <td className="num alleen-lezen">{formatNumber(r.geleverd || 0)}</td>
                <td className="num">
                  <GetalCel
                    rij={i}
                    kolom="nu"
                    value={aantallen[r.id]}
                    decimalen={0}
                    maxDecimalen={2}
                    onCommit={(v) => setAantallen((a) => ({ ...a, [r.id]: v === '' ? 0 : v }))}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">
        Zet een aantal op 0 om die regel nu niet te leveren. Het restant blijft openstaan voor een volgende pakbon.
      </p>

      <div className="modal-actions">
        <button type="button" className="btn btn-secondary" onClick={() => onKlaar(null)} disabled={bezig}>
          Annuleren
        </button>
        <button type="button" className="btn btn-primary" onClick={handleMaken} disabled={bezig}>
          {bezig ? 'Pakbon maken…' : 'Pakbon maken'}
        </button>
      </div>
    </Modal>
  )
}

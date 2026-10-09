import { useEffect, useState } from 'react'
import { formatNumber } from '../../lib/format'
import { boekOntvangst, standaardLocaties } from '../../lib/inkooporders'
import Modal from '../../components/Modal'
import LocatieKiezer from '../../components/LocatieKiezer'
import { GetalCel } from '../../components/RegelGrid'

// Ontvangst boeken bij een inkooporder: per regel hoeveel er binnen is (standaard
// alles wat nog openstaat) en op welke locatie het komt te liggen. Voorstel voor de
// locatie: waar het artikel nu al ligt.
export default function OntvangstVenster({ order, regels, gebruiker, onKlaar }) {
  const open = regels.filter((r) => (Number(r.ontvangen) || 0) < Number(r.aantal))
  const [aantallen, setAantallen] = useState(() =>
    Object.fromEntries(open.map((r) => [r.id, Number(r.aantal) - (Number(r.ontvangen) || 0)]))
  )
  const [codes, setCodes] = useState({})
  const [locaties, setLocaties] = useState({})
  const [alleCode, setAlleCode] = useState('')
  const [pakbon, setPakbon] = useState('')
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState(null)

  useEffect(() => {
    standaardLocaties(open.map((r) => r.artikelId))
      .then((voorstel) =>
        setCodes((c) => ({
          ...Object.fromEntries(open.map((r) => [r.id, voorstel[r.artikelId]?.code || ''])),
          ...c,
        }))
      )
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function zetVoorAlle(code) {
    setAlleCode(code)
    if (code) setCodes(Object.fromEntries(open.map((r) => [r.id, code])))
  }

  async function handleBoeken() {
    setFout(null)
    const ontvangst = {}
    for (const r of open) {
      const n = Number(aantallen[r.id]) || 0
      if (n <= 0) continue
      const rest = Number(r.aantal) - (Number(r.ontvangen) || 0)
      if (n > rest) {
        setFout(`${r.artikelnummer}: er staat nog ${formatNumber(rest, 2)} open; meer ontvangen kan niet.`)
        return
      }
      const locatie = locaties[r.id]
      if (!locatie) {
        setFout(
          codes[r.id]?.trim()
            ? `${r.artikelnummer}: locatie "${codes[r.id].trim()}" bestaat niet.`
            : `${r.artikelnummer}: kies een locatie.`
        )
        return
      }
      ontvangst[r.id] = { aantal: n, locatieId: locatie.id }
    }
    setBezig(true)
    try {
      const resultaat = await boekOntvangst({ inkooporderId: order.id, ontvangst, pakbonLeverancier: pakbon, gebruiker })
      onKlaar(resultaat)
    } catch (err) {
      setFout(err.message)
      setBezig(false)
    }
  }

  return (
    <Modal title={`Ontvangst boeken — ${order.ordernummer}`} onClose={bezig ? undefined : () => onKlaar(null)} width={900}>
      {fout && <div className="banner banner-danger">{fout}</div>}

      <div className="field-row">
        <div className="field">
          <label>Pakbonnummer leverancier</label>
          <input type="text" value={pakbon} onChange={(e) => setPakbon(e.target.value)} placeholder="Optioneel" />
        </div>
        <div className="field">
          <label>Alles op locatie</label>
          <LocatieKiezer value={alleCode} onChange={zetVoorAlle} placeholder="Zelfde locatie voor alle regels" />
        </div>
      </div>

      <div className="regel-grid-wrap" style={{ marginBottom: 6 }}>
        <table className="regel-grid">
          <thead>
            <tr>
              <th>Artikelnummer</th>
              <th>Artikelnaam</th>
              <th className="num">Besteld</th>
              <th className="num">Al ontvangen</th>
              <th className="num">Nu ontvangen</th>
              <th>Eenheid</th>
              <th>Locatie</th>
            </tr>
          </thead>
          <tbody>
            {open.map((r, i) => (
              <tr key={r.id}>
                <td className="alleen-lezen">{r.artikelnummer}</td>
                <td className="alleen-lezen">{r.artikelnaam}</td>
                <td className="num alleen-lezen">{formatNumber(r.aantal, 2)}</td>
                <td className="num alleen-lezen">{formatNumber(r.ontvangen || 0, 2)}</td>
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
                <td className="alleen-lezen">{r.eenheid}</td>
                <td>
                  <LocatieKiezer
                    value={codes[r.id] || ''}
                    onChange={(code) => setCodes((c) => ({ ...c, [r.id]: code }))}
                    onKies={(l) => setLocaties((m) => ({ ...m, [r.id]: l }))}
                    placeholder="Locatie…"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">
        Zet een aantal op 0 om die regel nu niet te ontvangen; het restant blijft openstaan. De voorraad wordt op de
        gekozen locatie ingeboekt.
      </p>

      <div className="modal-actions">
        <button type="button" className="btn btn-secondary" onClick={() => onKlaar(null)} disabled={bezig}>
          Annuleren
        </button>
        <button type="button" className="btn btn-primary" onClick={handleBoeken} disabled={bezig}>
          {bezig ? 'Boeken…' : 'Ontvangst boeken'}
        </button>
      </div>
    </Modal>
  )
}

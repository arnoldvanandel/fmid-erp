import { useState } from 'react'
import { formatCurrency, formatNumber } from '../../lib/format'
import { berekenTotalen, btwPercentage, btwVermelding, maakFactuur } from '../../lib/verkooporders'
import { BEDRIJF } from '../inkooporders/InkooporderDocument'
import Modal from '../../components/Modal'
import { GetalCel } from '../../components/RegelGrid'

// Factuur maken: per regel hoeveel er nu gefactureerd wordt. Standaard wat al
// geleverd maar nog niet gefactureerd is; je kunt ook vooraf factureren.
export default function FactuurVenster({ order, regels, gebruiker, onKlaar }) {
  const open = regels.filter((r) => (Number(r.gefactureerd) || 0) < Number(r.aantal))
  const [aantallen, setAantallen] = useState(() =>
    Object.fromEntries(
      open.map((r) => [r.id, Math.max(0, (Number(r.geleverd) || 0) - (Number(r.gefactureerd) || 0))])
    )
  )
  const [factuurdatum, setFactuurdatum] = useState(new Date().toISOString().slice(0, 10))
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState(null)

  const totalen = berekenTotalen(
    open.map((r) => ({
      aantal: Number(aantallen[r.id]) || 0,
      prijs: r.prijs,
      btwPercentage: btwPercentage(r.btwGroep, order.btwGroep),
    }))
  )
  const vermelding = btwVermelding(order.btwGroep)
  const bedrijfsgegevensOntbreken = !BEDRIJF.btwNummer || !BEDRIJF.kvkNummer || !BEDRIJF.iban

  async function handleMaken() {
    setFout(null)
    for (const r of open) {
      const n = Number(aantallen[r.id]) || 0
      const rest = Number(r.aantal) - (Number(r.gefactureerd) || 0)
      if (n < 0 || n > rest) {
        setFout(`${r.artikelnummer}: je kunt maximaal ${formatNumber(rest)} factureren.`)
        return
      }
    }
    if (order.btwGroep === 'EU-IC' && !order.btwNummer) {
      setFout('Bij BTW verlegd (EU-IC) moet het BTW-nummer van de klant op de factuur. Vul het in bij de klant.')
      return
    }
    if (!confirm(`Factuur maken van ${formatCurrency(totalen.totaal)} incl. BTW? Een factuur kan daarna niet meer worden gewijzigd.`)) {
      return
    }
    setBezig(true)
    try {
      const factuur = await maakFactuur({ verkooporderId: order.id, aantallen, factuurdatum, gebruiker })
      onKlaar(factuur)
    } catch (err) {
      setFout(err.message)
      setBezig(false)
    }
  }

  return (
    <Modal title={`Factuur maken — ${order.ordernummer}`} onClose={bezig ? undefined : () => onKlaar(null)} width={820}>
      {fout && <div className="banner banner-danger">{fout}</div>}
      {bedrijfsgegevensOntbreken && (
        <div className="banner banner-warning">
          Het BTW-nummer, KvK-nummer en/of IBAN van FMID staan nog niet in de app en komen dus niet op de factuur.
          Laat ze invullen in BEDRIJF (src/pages/inkooporders/InkooporderDocument.jsx).
        </div>
      )}

      <div className="field-row">
        <div className="field" style={{ maxWidth: 200 }}>
          <label>Factuurdatum</label>
          <input type="date" value={factuurdatum} onChange={(e) => setFactuurdatum(e.target.value)} />
        </div>
        <div className="field">
          <label>Betalingstermijn</label>
          <input type="text" value={`${order.betalingstermijn ?? 0} dagen`} disabled />
        </div>
        <div className="field">
          <label>BTW-groep klant</label>
          <input type="text" value={order.btwGroep || 'NL'} disabled />
        </div>
      </div>

      <div className="regel-grid-wrap" style={{ marginBottom: 6 }}>
        <table className="regel-grid">
          <thead>
            <tr>
              <th>Artikelnummer</th>
              <th>Artikelnaam</th>
              <th className="num">Besteld</th>
              <th className="num">Geleverd</th>
              <th className="num">Gefactureerd</th>
              <th className="num">Nu factureren</th>
              <th className="num">Prijs</th>
              <th className="num">BTW</th>
            </tr>
          </thead>
          <tbody>
            {open.map((r, i) => (
              <tr key={r.id}>
                <td className="alleen-lezen">{r.artikelnummer}</td>
                <td className="alleen-lezen">{r.artikelnaam}</td>
                <td className="num alleen-lezen">{formatNumber(r.aantal)}</td>
                <td className="num alleen-lezen">{formatNumber(r.geleverd || 0)}</td>
                <td className="num alleen-lezen">{formatNumber(r.gefactureerd || 0)}</td>
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
                <td className="num alleen-lezen">{formatNumber(r.prijs, 2)}</td>
                <td className="num alleen-lezen">{btwPercentage(r.btwGroep, order.btwGroep)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ textAlign: 'right', margin: '8px 0' }}>
        Netto {formatCurrency(totalen.netto)} · BTW {formatCurrency(totalen.btwTotaal)} ·{' '}
        <strong>Totaal {formatCurrency(totalen.totaal)}</strong>
        {order.valuta && order.valuta !== 'EUR' && ` (bedragen in ${order.valuta})`}
      </p>
      {vermelding && <p className="hint">Op de factuur: {vermelding}</p>}

      <div className="modal-actions">
        <button type="button" className="btn btn-secondary" onClick={() => onKlaar(null)} disabled={bezig}>
          Annuleren
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleMaken}
          disabled={bezig || open.every((r) => !(Number(aantallen[r.id]) > 0))}
        >
          {bezig ? 'Factuur maken…' : 'Factuur maken'}
        </button>
      </div>
    </Modal>
  )
}

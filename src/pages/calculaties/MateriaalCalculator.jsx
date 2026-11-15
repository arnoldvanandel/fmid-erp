import { useState } from 'react'
import Modal from '../../components/Modal'
import { formatNumber } from '../../lib/format'
import {
  LEEG_MATERIAAL,
  MATERIALEN,
  PRIJS_PER,
  VORMEN,
  berekenMateriaal,
  materiaalOmschrijving,
} from '../../lib/materiaalCalculator'

function Regel({ label, children, sterk = false }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
        padding: '3px 0',
      }}
    >
      <span className={sterk ? '' : 'hint'} style={sterk ? { fontWeight: 600 } : { margin: 0 }}>
        {label}
      </span>
      <span
        style={{
          fontWeight: sterk ? 700 : 400,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {children}
      </span>
    </div>
  )
}

// Rekent de materiaalprijs per stuk uit en geeft hem terug aan de kostenregel.
// `waarde` is de eerder ingevulde invoer van deze regel (of niets).
export default function MateriaalCalculator({ waarde, onOvernemen, onAnnuleren }) {
  const [m, setM] = useState(() => ({ ...LEEG_MATERIAAL, ...(waarde || {}) }))
  const r = berekenMateriaal(m)
  const vorm = VORMEN[r.vorm]

  function set(veld, v) {
    setM((oud) => ({ ...oud, [veld]: v }))
  }

  function overnemen(e) {
    e.preventDefault()
    // Het venster staat (via een portal) binnen het calculatieformulier; zonder
    // dit zou React de submit ook aan dat formulier doorgeven.
    e.stopPropagation()
    if (r.ontbreekt) return
    onOvernemen({
      materiaal: {
        materiaal: r.materiaal,
        vorm: r.vorm,
        maat: r.maat,
        lengte: r.lengte,
        lengteToeslag: r.lengteToeslag,
        prijsPer: r.prijsPer,
        prijs: r.prijs,
        prijsToeslag: r.prijsToeslag,
      },
      omschrijving: materiaalOmschrijving(r),
      perStuk: Math.round(r.perStuk * 10000) / 10000,
    })
  }

  return (
    <Modal title="Materiaalcalculator" onClose={onAnnuleren} width={760}>
      <form onSubmit={overnemen}>
        <div className="field-row">
          <div className="field">
            <label>Soort materiaal</label>
            <select value={m.materiaal} onChange={(e) => set('materiaal', e.target.value)} autoFocus>
              {Object.entries(MATERIALEN).map(([id, mat]) => (
                <option key={id} value={id}>
                  {mat.label}
                </option>
              ))}
            </select>
            <span className="hint">Soortelijk gewicht {formatNumber(MATERIALEN[r.materiaal].dichtheid, 2)} kg/dm³</span>
          </div>
          <div className="field">
            <label>Vorm van de staf</label>
            <select value={m.vorm} onChange={(e) => set('vorm', e.target.value)}>
              {Object.entries(VORMEN).map(([id, v]) => (
                <option key={id} value={id}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>{vorm.maatLabel} (mm)</label>
            <input type="number" min="0" step="any" value={m.maat} onChange={(e) => set('maat', e.target.value)} />
            {r.vorm !== 'rond' && <span className="hint">Maat tussen twee platte zijden.</span>}
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label>Lengte product (mm)</label>
            <input type="number" min="0" step="any" value={m.lengte} onChange={(e) => set('lengte', e.target.value)} />
          </div>
          <div className="field">
            <label>Toeslag op de lengte (mm)</label>
            <input
              type="number"
              min="0"
              step="any"
              value={m.lengteToeslag}
              onChange={(e) => set('lengteToeslag', e.target.value)}
            />
            <span className="hint">Zaagsnede, afsteken, vlakken.</span>
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label>Materiaalprijs (€)</label>
            <input type="number" min="0" step="any" value={m.prijs} onChange={(e) => set('prijs', e.target.value)} />
          </div>
          <div className="field">
            <label>Prijs geldt</label>
            <select value={m.prijsPer} onChange={(e) => set('prijsPer', e.target.value)}>
              {Object.entries(PRIJS_PER).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Toeslag op de prijs (%)</label>
            <input
              type="number"
              min="0"
              step="any"
              value={m.prijsToeslag}
              onChange={(e) => set('prijsToeslag', e.target.value)}
            />
          </div>
        </div>

        <div className="card" style={{ padding: '10px 14px', marginTop: 4 }}>
          {r.maat > 0 && (
            <>
              <Regel label="Gewicht per meter">{formatNumber(r.kgPerMeter, 3)} kg/m</Regel>
              <Regel label="Gewicht per stuk">{formatNumber(r.kgPerStuk, 3)} kg</Regel>
            </>
          )}
          <Regel label="Lengte per stuk (product + toeslag)">{formatNumber(r.zaaglengte, 1)} mm</Regel>
          {r.prijsPer === 'kg' && r.maat > 0 && (
            <Regel label="Prijs per meter">€ {formatNumber(r.prijsPerMeter, 4)}</Regel>
          )}
          <Regel label="Materiaal per stuk, zonder toeslag">€ {formatNumber(r.kaal, 4)}</Regel>
          {r.prijsToeslag > 0 && (
            <Regel label={`Toeslag ${formatNumber(r.prijsToeslag, 1)}%`}>€ {formatNumber(r.perStuk - r.kaal, 4)}</Regel>
          )}
          <Regel label="Materiaal per stuk" sterk>
            € {formatNumber(r.perStuk, 4)}
          </Regel>
        </div>

        {r.ontbreekt && <p className="hint">{r.ontbreekt}</p>}

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onAnnuleren}>
            Annuleren
          </button>
          <button type="submit" className="btn btn-primary" disabled={!!r.ontbreekt}>
            Overnemen
          </button>
        </div>
      </form>
    </Modal>
  )
}

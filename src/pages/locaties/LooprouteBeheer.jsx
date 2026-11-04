import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCollection } from '../../hooks/useCollection'
import {
  afstandSleutel,
  bewaarLooproute,
  completeZoneMatrix,
  laadLooproute,
  matrixStatus,
  uniekeVloerZones,
  vloerZone,
} from '../../lib/looproute'

// Complete zonematrix: alle vloerzones × alle vloerzones (boven de diagonaal).
// Eenmalig alle afstanden invullen en opslaan.
export default function LooprouteBeheer() {
  const { data: locaties, loading: loadingLocaties, error: errorLocaties } = useCollection('locaties', {
    orderByField: 'code',
  })
  const [startZone, setStartZone] = useState('')
  const [afstanden, setAfstanden] = useState({})
  const [meterPerStap, setMeterPerStap] = useState('10')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [melding, setMelding] = useState(null)
  const [error, setError] = useState(null)

  const zones = useMemo(() => uniekeVloerZones(locaties), [locaties])

  useEffect(() => {
    let actief = true
    laadLooproute()
      .then((m) => {
        if (!actief) return
        setStartZone(m.startZone || '')
        setAfstanden(m.afstanden || {})
      })
      .catch((e) => actief && setError(e.message))
      .finally(() => actief && setLoading(false))
    return () => {
      actief = false
    }
  }, [])

  // Zodra zones bekend zijn: ontbrekende cellen toevoegen zodat de matrix compleet is.
  useEffect(() => {
    if (loading || loadingLocaties || zones.length < 2) return
    setAfstanden((prev) => {
      const compleet = completeZoneMatrix(zones, prev, { voorstel: false })
      const zelfde =
        Object.keys(compleet).length === Object.keys(prev).length &&
        Object.keys(compleet).every((k) => compleet[k] === prev[k] || (compleet[k] === '' && !(k in prev)))
      return zelfde ? prev : { ...prev, ...compleet }
    })
  }, [zones, loading, loadingLocaties])

  const voorbeeldenPerZone = useMemo(() => {
    const map = {}
    for (const l of locaties) {
      const z = vloerZone(l)
      if (!z) continue
      if (!map[z]) map[z] = []
      if (map[z].length < 2) map[z].push(l.code)
    }
    return map
  }, [locaties])

  const status = useMemo(() => matrixStatus(zones, afstanden), [zones, afstanden])

  function zetCel(van, naar, waarde) {
    const key = afstandSleutel(van, naar)
    setAfstanden((prev) => ({ ...prev, [key]: waarde }))
  }

  function vulVoorstel() {
    const stap = Number(meterPerStap)
    if (!Number.isFinite(stap) || stap < 0) {
      setError('Meters per stap moet 0 of hoger zijn.')
      return
    }
    setError(null)
    setAfstanden((prev) => completeZoneMatrix(zones, prev, { voorstel: true, meterPerStap: stap }))
    setMelding({
      soort: 'info',
      tekst: `Voorstel gezet: |25 − 26| × ${stap} m. Pas cellen aan en sla op.`,
    })
  }

  function wisLegeNiet() {
    // Vul alleen nog-lege cellen
    const stap = Number(meterPerStap)
    if (!Number.isFinite(stap) || stap < 0) {
      setError('Meters per stap moet 0 of hoger zijn.')
      return
    }
    setError(null)
    setAfstanden((prev) => {
      const next = { ...prev }
      for (let i = 0; i < zones.length; i++) {
        for (let j = i + 1; j < zones.length; j++) {
          const key = afstandSleutel(zones[i], zones[j])
          if (next[key] == null || next[key] === '') {
            const d = Math.abs(Number(zones[i]) - Number(zones[j]))
            next[key] = (Number.isFinite(d) ? d : 1) * stap
          }
        }
      }
      return next
    })
    setMelding({ soort: 'info', tekst: 'Lege cellen gevuld met voorstel. Bestaande waarden behouden.' })
  }

  async function opslaan() {
    setSaving(true)
    setMelding(null)
    setError(null)
    try {
      // Lege strings niet opslaan; wel alle ingevulde getallen.
      const schoon = {}
      for (const [k, v] of Object.entries(afstanden)) {
        if (v === '' || v == null) continue
        const n = Number(v)
        if (!Number.isFinite(n) || n < 0) {
          throw new Error(`Ongeldige afstand bij ${k.replace('|', ' ↔ ')}: vul 0 of hoger in.`)
        }
        schoon[k] = n
      }
      await bewaarLooproute({ startZone, afstanden: schoon })
      setMelding({
        soort: 'info',
        tekst: `Opgeslagen: ${Object.keys(schoon).length} van ${status.totaal} afstanden.`,
      })
    } catch (e) {
      const msg = e.message || String(e)
      setError(
        /permission|insufficient/i.test(msg)
          ? 'Geen rechten op collectie looproute. Deploy: firebase deploy --only firestore:rules'
          : msg
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1>Looproute</h1>
          <div className="page-header-sub">
            Afstandsmatrix op de eerste twee cijfers van de locatie (2511-1 → 25)
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link className="btn btn-secondary" to="/picklijsten">
            Naar picklijsten
          </Link>
          <Link className="btn btn-secondary" to="/locaties">
            Locaties
          </Link>
        </div>
      </div>

      {(error || errorLocaties) && (
        <div className="banner banner-danger">{error || errorLocaties}</div>
      )}
      {melding && <div className={`banner banner-${melding.soort}`}>{melding.tekst}</div>}

      {loading || loadingLocaties ? (
        <div className="empty-state">
          <div className="spinner" style={{ margin: '0 auto' }} />
        </div>
      ) : zones.length < 2 ? (
        <div className="card">
          <div className="empty-state">
            Geen looproute-posities geconfigureerd.
          </div>
        </div>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-pad">
              <p className="hint" style={{ marginTop: 0 }}>
                Locatie <strong>2511-1</strong> hoort bij <strong>25</strong> (eerste twee cijfers). Vul de
                afstand in meters tussen elke combinatie (bijv. 25 ↔ 26). De matrix is symmetrisch; dezelfde
                positie (diagonaal) is altijd 0.
              </p>
              <div className="field-row" style={{ flexWrap: 'wrap', alignItems: 'end' }}>
                <div className="field">
                  <label>Start (eerste twee cijfers)</label>
                  <select value={startZone} onChange={(e) => setStartZone(e.target.value)}>
                    <option value="">Automatisch (laagste nummer)</option>
                    {zones.map((z) => (
                      <option key={z} value={z}>
                        {z}
                        {voorbeeldenPerZone[z]?.length ? ` — bijv. ${voorbeeldenPerZone[z][0]}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Voorstel: meters per stap</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={meterPerStap}
                    onChange={(e) => setMeterPerStap(e.target.value)}
                    style={{ width: 100 }}
                  />
                </div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={wisLegeNiet}>
                  Vul lege cellen
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={vulVoorstel}>
                  Vul hele matrix (overschrijven)
                </button>
                <button type="button" className="btn btn-primary" onClick={opslaan} disabled={saving}>
                  {saving ? 'Opslaan…' : 'Matrix opslaan'}
                </button>
              </div>
              <p className="hint" style={{ marginBottom: 0 }}>
                {status.ingevuld} van {status.totaal} afstanden ingevuld · {zones.length} posities (01, 11–17,
                19–25, 31–32, 51–52)
              </p>
            </div>
          </div>

          <div className="card">
            <div className="looproute-matrix-wrap">
              <table className="data-table looproute-matrix">
                <thead>
                  <tr>
                    <th className="looproute-corner">van \ naar</th>
                    {zones.map((z) => (
                      <th key={z} className="num" title={voorbeeldenPerZone[z]?.join(', ')}>
                        {z}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {zones.map((rijZone, ri) => (
                    <tr key={rijZone}>
                      <th title={voorbeeldenPerZone[rijZone]?.join(', ')}>{rijZone}</th>
                      {zones.map((kolZone, ki) => {
                        if (ri === ki) {
                          return (
                            <td key={kolZone} className="looproute-diag num">
                              0
                            </td>
                          )
                        }
                        if (ri > ki) {
                          const v = afstanden[afstandSleutel(rijZone, kolZone)]
                          return (
                            <td key={kolZone} className="looproute-spiegel num">
                              {v === '' || v == null ? '—' : v}
                            </td>
                          )
                        }
                        const key = afstandSleutel(rijZone, kolZone)
                        return (
                          <td key={kolZone} className="looproute-cel">
                            <input
                              type="number"
                              min="0"
                              step="0.1"
                              value={afstanden[key] ?? ''}
                              onChange={(e) => zetCel(rijZone, kolZone, e.target.value)}
                              aria-label={`Afstand ${rijZone} naar ${kolZone}`}
                            />
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

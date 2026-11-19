import { useMemo, useState } from 'react'
import Modal from '../../components/Modal'
import { GetalCel } from '../../components/RegelGrid'
import { formatNumber } from '../../lib/format'
import {
  STANDAARD_MARGE,
  kostenOpbouw,
  prijsUitBedrag,
  prijsUitMarge,
  prijsUitOpslag,
  regelCalculatie,
} from '../../lib/calculaties'
import KostenTabellen from './KostenTabellen'

function euro(waarde, decimalen = 2) {
  return `€ ${formatNumber(waarde, decimalen)}`
}

// Calculatie voor één regel van een aanbieding met artikelen: bewerkingen,
// materiaal en kosten, doorgerekend voor het aantal van de regel. De prijs per
// stuk is de adviesprijs (kostprijs + opslag), of een eigen prijs.
// `voorstel` is de calculatie waarmee je begint als de regel er nog geen heeft
// (van een andere regel met hetzelfde artikel, of de laatste calculatie van
// het artikel); `bron` zegt waar hij vandaan komt.
export default function RegelCalculatieVenster({
  regel,
  voorstel,
  bron,
  valuta,
  onOvernemen,
  onWeghalen,
  onAnnuleren,
}) {
  const start = regel.calculatie || voorstel || { bewerkingen: [], kosten: [], marge: STANDAARD_MARGE }
  const [calc, setCalc] = useState(() => ({
    bewerkingen: (start.bewerkingen || []).map((b) => ({ ...b })),
    kosten: (start.kosten || []).map((k) => ({ ...k })),
    marge: start.marge ?? STANDAARD_MARGE,
  }))
  // Eigen prijs per stuk; null = adviesprijs.
  const [eigenPrijs, setEigenPrijs] = useState(regel.calculatie && regel.prijsHandmatig ? Number(regel.prijs) : null)
  const [fout, setFout] = useState(null)

  const aantal = Number(regel.aantal) || 0
  const uitkomst = useMemo(
    () =>
      regelCalculatie({
        aantal,
        calculatie: calc,
        prijs: eigenPrijs ?? 0,
        prijsHandmatig: eigenPrijs !== null,
      }),
    [calc, aantal, eigenPrijs]
  )
  const opbouw = useMemo(() => kostenOpbouw(calc), [calc])

  function wijzig(veld, waarde) {
    setCalc((c) => ({ ...c, [veld]: waarde }))
  }

  // Een getalcel meldt zich bij elk verlaten; alleen een andere waarde telt.
  // Leegmaken gaat terug naar de adviesprijs.
  function prijsCel(getoond, nieuw, naarPrijs) {
    if (nieuw === '') {
      setEigenPrijs(null)
      return
    }
    if (Number(nieuw) === Number(getoond)) return
    try {
      setFout(null)
      setEigenPrijs(naarPrijs(Number(nieuw)))
    } catch (err) {
      setFout(err.message)
    }
  }

  function overnemen() {
    if (!uitkomst) return
    onOvernemen({
      calculatie: calc,
      prijs: uitkomst.prijs,
      prijsHandmatig: eigenPrijs !== null,
    })
  }

  return (
    <Modal title={`Calculatie ${regel.artikelnummer}`} onClose={onAnnuleren} width={1060}>
      {fout && <div className="banner banner-danger">{fout}</div>}
      {!regel.calculatie && bron && <div className="banner banner-info">{bron}</div>}

      <p className="hint" style={{ marginTop: 0 }}>
        {regel.omschrijving}
        {regel.klantArtikelnummer ? ` · art.nr. klant ${regel.klantArtikelnummer}` : ''} · berekend voor{' '}
        <strong>
          {formatNumber(aantal, Number.isInteger(aantal) ? 0 : 2)} {String(regel.eenheid || 'stuks').toLowerCase()}
        </strong>{' '}
        (het aantal op de regel).
      </p>

      <KostenTabellen bewerkingen={calc.bewerkingen} kosten={calc.kosten} aantallen={[aantal]} wijzig={wijzig} />

      <div className="regel-grid-kop" style={{ marginTop: 18 }}>
        <h3>Prijs</h3>
      </div>
      <div className="field-row">
        <div className="field" style={{ maxWidth: 260 }}>
          <label>Standaard opslag op de kostprijs (%)</label>
          <input
            type="number"
            min="0"
            step="any"
            value={calc.marge}
            onChange={(e) => wijzig('marge', e.target.value)}
          />
        </div>
      </div>
      {uitkomst && (
        <div className="regel-grid-wrap">
          <table className="regel-grid">
            <thead>
              <tr>
                <th className="num">Aantal</th>
                <th className="num">Eenmalig per stuk</th>
                <th className="num">Kosten per stuk</th>
                <th className="num">Kostprijs</th>
                <th className="num">Opslag (%)</th>
                <th className="num">Prijs per stuk ({valuta})</th>
                <th className="num">Marge (%)</th>
                <th className="num">Bedrag ({valuta})</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="num alleen-lezen">{formatNumber(aantal, Number.isInteger(aantal) ? 0 : 2)}</td>
                <td className="num alleen-lezen">{formatNumber(uitkomst.vastPerStuk, 2)}</td>
                <td className="num alleen-lezen">{formatNumber(uitkomst.perStuk, 2)}</td>
                <td className="num alleen-lezen">{formatNumber(uitkomst.kostprijs, 2)}</td>
                <td className="num">
                  <GetalCel
                    value={Math.round(uitkomst.opslagPct * 10) / 10}
                    decimalen={1}
                    maxDecimalen={2}
                    onCommit={(v) =>
                      prijsCel(Math.round(uitkomst.opslagPct * 10) / 10, v, (o) =>
                        prijsUitOpslag(uitkomst.kostprijs, o)
                      )
                    }
                  />
                </td>
                <td className="num">
                  <GetalCel
                    value={uitkomst.prijs}
                    decimalen={2}
                    maxDecimalen={4}
                    onCommit={(v) => prijsCel(uitkomst.prijs, v, (p) => p)}
                  />
                </td>
                <td className="num">
                  <GetalCel
                    value={Math.round(uitkomst.margePct * 10) / 10}
                    decimalen={1}
                    maxDecimalen={2}
                    onCommit={(v) =>
                      prijsCel(Math.round(uitkomst.margePct * 10) / 10, v, (m) => prijsUitMarge(uitkomst.kostprijs, m))
                    }
                  />
                </td>
                <td className="num">
                  <GetalCel
                    value={Math.round(uitkomst.bedrag * 100) / 100}
                    decimalen={2}
                    onCommit={(v) =>
                      prijsCel(Math.round(uitkomst.bedrag * 100) / 100, v, (b) => prijsUitBedrag(b, aantal))
                    }
                  />
                </td>
                <td className="alleen-lezen" style={{ textAlign: 'right' }}>
                  {eigenPrijs !== null && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setEigenPrijs(null)}
                      title={`Terug naar de adviesprijs (${formatNumber(uitkomst.advies, 2)})`}
                    >
                      Advies
                    </button>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <p className="hint" style={{ marginTop: 8 }}>
        Eenmalig per serie (instellen, gereedschap): <strong>{euro(opbouw.vast)}</strong> · per stuk:{' '}
        <strong>{euro(opbouw.perStuk, 4)}</strong>. Pas de opslag, de prijs, de marge of het bedrag aan; de rest rekent
        mee. Verander je later het aantal op de regel, dan rekent de prijs opnieuw (behalve een eigen prijs).
      </p>

      <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
        <div>
          {regel.calculatie && (
            <button type="button" className="btn btn-ghost" onClick={onWeghalen}>
              Calculatie weghalen
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-secondary" onClick={onAnnuleren}>
            Annuleren
          </button>
          <button type="button" className="btn btn-primary" onClick={overnemen} disabled={!uitkomst}>
            Overnemen
          </button>
        </div>
      </div>
    </Modal>
  )
}

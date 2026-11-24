import { useEffect, useMemo, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase'
import Modal from '../../components/Modal'
import { GetalCel, parseGetal } from '../../components/RegelGrid'
import { formatNumber } from '../../lib/format'
import {
  STANDAARD_MARGE,
  kostenOpbouw,
  prijsUitBedrag,
  prijsUitMarge,
  prijsUitOpslag,
  regelCalculatie,
} from '../../lib/calculaties'
import { DocumentenTab } from '../artikelen/ArtikelForm'
import KostenTabellen from './KostenTabellen'

function euro(waarde, decimalen = 2) {
  return `€ ${formatNumber(waarde, decimalen)}`
}

function aantalTekst(aantal) {
  return formatNumber(aantal, Number.isInteger(aantal) ? 0 : 2)
}

// Twee calculaties met dezelfde uitkomst gelden als dezelfde.
function kenmerk(calc) {
  const { vast, perStuk } = kostenOpbouw(calc)
  return [vast.toFixed(4), perStuk.toFixed(4), Number(calc.marge) || 0].join('|')
}

// Calculatie van één artikel in een aanbieding: bewerkingen, materiaal en
// kosten, doorgerekend voor elk aantal (`regels`) van het artikel. De prijs per
// stuk is de adviesprijs (kostprijs + opslag), of een eigen prijs per aantal.
// `start` is de calculatie waarmee je begint; `bron` zegt waar hij vandaan komt.
export default function ArtikelCalculatieVenster({
  regels,
  start,
  bron,
  valuta,
  onOvernemen,
  onWeghalen,
  onAnnuleren,
}) {
  const regel = regels[0]
  const [calc, setCalc] = useState(() => ({
    bewerkingen: (start?.bewerkingen || []).map((b) => ({ ...b })),
    kosten: (start?.kosten || []).map((k) => ({ ...k })),
    marge: start?.marge ?? STANDAARD_MARGE,
  }))
  // Per aantal de eigen prijs per stuk; null = adviesprijs. Zonder sleutel: nieuw aantal.
  const [rijen, setRijen] = useState(() =>
    regels.map((r) => ({
      sleutel: r.sleutel,
      aantal: Number(r.aantal) || 0,
      eigenPrijs: r.calculatie && r.prijsHandmatig ? Number(r.prijs) : null,
    }))
  )
  const [nieuwAantal, setNieuwAantal] = useState('')
  const [fout, setFout] = useState(null)

  const [artikel, setArtikel] = useState(null)
  useEffect(() => {
    if (!regel.artikelId) return undefined
    return onSnapshot(doc(db, 'artikelen', regel.artikelId), (snap) => {
      setArtikel(snap.exists() ? { id: snap.id, ...snap.data() } : null)
    })
  }, [regel.artikelId])

  const heeftCalculatie = regels.some((r) => r.calculatie)
  const verschillend = useMemo(
    () => new Set(regels.filter((r) => r.calculatie).map((r) => kenmerk(r.calculatie))).size > 1,
    [regels]
  )
  const zonderCalculatie = heeftCalculatie && regels.some((r) => !r.calculatie)

  const uitkomsten = useMemo(
    () =>
      rijen.map((rij) =>
        regelCalculatie({
          aantal: rij.aantal,
          calculatie: calc,
          prijs: rij.eigenPrijs ?? 0,
          prijsHandmatig: rij.eigenPrijs !== null,
        })
      ),
    [calc, rijen]
  )
  const aantallen = useMemo(
    () => [...new Set(rijen.map((r) => r.aantal).filter((n) => n > 0))].sort((a, b) => a - b),
    [rijen]
  )
  const opbouw = useMemo(() => kostenOpbouw(calc), [calc])

  function wijzig(veld, waarde) {
    setCalc((c) => ({ ...c, [veld]: waarde }))
  }

  function zetPrijs(index, eigenPrijs) {
    setRijen((lijst) => lijst.map((r, i) => (i === index ? { ...r, eigenPrijs } : r)))
  }

  // Een getalcel meldt zich bij elk verlaten; alleen een andere waarde telt.
  // Leegmaken gaat terug naar de adviesprijs.
  function prijsCel(index, getoond, nieuw, naarPrijs) {
    if (nieuw === '') {
      zetPrijs(index, null)
      return
    }
    if (Number(nieuw) === Number(getoond)) return
    try {
      setFout(null)
      zetPrijs(index, naarPrijs(Number(nieuw)))
    } catch (err) {
      setFout(err.message)
    }
  }

  function voegAantalToe() {
    const n = parseGetal(nieuwAantal)
    if (!(n > 0)) {
      setFout('Vul een aantal groter dan 0 in.')
      return
    }
    if (rijen.some((r) => r.aantal === n)) {
      setFout(`Het aantal ${aantalTekst(n)} staat er al bij.`)
      return
    }
    setFout(null)
    setRijen((lijst) => [...lijst, { aantal: n, eigenPrijs: null }])
    setNieuwAantal('')
  }

  function overnemen() {
    onOvernemen({
      calculatie: calc,
      rijen: rijen.map(({ sleutel, aantal, eigenPrijs }, i) => ({
        ...(sleutel ? { sleutel } : {}),
        aantal,
        prijs: uitkomsten[i]?.prijs ?? 0,
        prijsHandmatig: eigenPrijs !== null,
      })),
    })
  }

  return (
    <Modal title={`Calculatie ${regel.artikelnummer}`} onClose={onAnnuleren} width={1060}>
      {fout && <div className="banner banner-danger">{fout}</div>}
      {bron && <div className="banner banner-info">{bron}</div>}
      {verschillend && (
        <div className="banner banner-warning">
          De regels van dit artikel hadden verschillende calculaties. Bij Overnemen krijgen ze allemaal deze calculatie.
        </div>
      )}
      {zonderCalculatie && (
        <div className="banner banner-warning">
          Niet elke regel van dit artikel had een calculatie. Bij Overnemen vervalt daar de zelf ingevulde prijs.
        </div>
      )}

      <p className="hint" style={{ marginTop: 0 }}>
        {regel.omschrijving}
        {regel.klantArtikelnummer ? ` · art.nr. klant ${regel.klantArtikelnummer}` : ''}
        {regel.revisie ? ` · revisie ${regel.revisie}` : ''}
      </p>

      <KostenTabellen bewerkingen={calc.bewerkingen} kosten={calc.kosten} aantallen={aantallen} wijzig={wijzig} />

      <div className="field-row" style={{ marginTop: 18 }}>
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
      <div className="regel-grid-kop">
        <h3>Prijs per aantal</h3>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            type="text"
            inputMode="decimal"
            value={nieuwAantal}
            onChange={(e) => setNieuwAantal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              e.preventDefault()
              voegAantalToe()
            }}
            placeholder="Aantal"
            aria-label="Aantal toevoegen"
            style={{ width: 100 }}
          />
          <button type="button" className="btn btn-secondary btn-sm" onClick={voegAantalToe}>
            + Aantal
          </button>
        </div>
      </div>
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
            {rijen.map((rij, i) => {
              const u = uitkomsten[i]
              if (!u) return null
              const opslag = Math.round(u.opslagPct * 10) / 10
              const marge = Math.round(u.margePct * 10) / 10
              const bedrag = Math.round(u.bedrag * 100) / 100
              return (
                <tr key={rij.sleutel || `nieuw-${rij.aantal}`}>
                  <td className="num alleen-lezen">{aantalTekst(rij.aantal)}</td>
                  <td className="num alleen-lezen">{formatNumber(u.vastPerStuk, 2)}</td>
                  <td className="num alleen-lezen">{formatNumber(u.perStuk, 2)}</td>
                  <td className="num alleen-lezen">{formatNumber(u.kostprijs, 2)}</td>
                  <td className="num">
                    <GetalCel
                      value={opslag}
                      decimalen={1}
                      maxDecimalen={2}
                      onCommit={(v) => prijsCel(i, opslag, v, (o) => prijsUitOpslag(u.kostprijs, o))}
                    />
                  </td>
                  <td className="num">
                    <GetalCel
                      value={u.prijs}
                      decimalen={2}
                      maxDecimalen={4}
                      onCommit={(v) => prijsCel(i, u.prijs, v, (p) => p)}
                    />
                  </td>
                  <td className="num">
                    <GetalCel
                      value={marge}
                      decimalen={1}
                      maxDecimalen={2}
                      onCommit={(v) => prijsCel(i, marge, v, (m) => prijsUitMarge(u.kostprijs, m))}
                    />
                  </td>
                  <td className="num">
                    <GetalCel
                      value={bedrag}
                      decimalen={2}
                      onCommit={(v) => prijsCel(i, bedrag, v, (b) => prijsUitBedrag(b, rij.aantal))}
                    />
                  </td>
                  <td className="alleen-lezen" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {rij.eigenPrijs !== null && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => zetPrijs(i, null)}
                        title={`Terug naar de adviesprijs (${formatNumber(u.advies, 2)})`}
                      >
                        Advies
                      </button>
                    )}
                    {!rij.sleutel && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setRijen((lijst) => lijst.filter((_, j) => j !== i))}
                        aria-label={`Aantal ${rij.aantal} verwijderen`}
                      >
                        ✕
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="hint" style={{ marginTop: 8 }}>
        Eenmalig per serie (instellen, gereedschap): <strong>{euro(opbouw.vast)}</strong> · per stuk:{' '}
        <strong>{euro(opbouw.perStuk, 4)}</strong>. Pas de opslag, de prijs, de marge of het bedrag aan; de rest rekent
        mee. Een eigen prijs blijft staan; met Advies gaat hij terug naar de standaard opslag.
      </p>

      {artikel && <DocumentenTab artikel={artikel} titel="Tekening" />}

      <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
        <div>
          {heeftCalculatie && (
            <button type="button" className="btn btn-ghost" onClick={onWeghalen}>
              Calculatie weghalen
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-secondary" onClick={onAnnuleren}>
            Annuleren
          </button>
          <button type="button" className="btn btn-primary" onClick={overnemen} disabled={!uitkomsten.some(Boolean)}>
            Overnemen
          </button>
        </div>
      </div>
    </Modal>
  )
}

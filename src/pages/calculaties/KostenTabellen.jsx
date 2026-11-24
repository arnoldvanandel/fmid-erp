import { useMemo, useState } from 'react'
import { formatNumber } from '../../lib/format'
import { KOSTENSOORTEN, STANDAARD_UURTARIEF, bewerkingKosten } from '../../lib/calculaties'
import { GetalCel } from '../../components/RegelGrid'
import MateriaalCalculator from './MateriaalCalculator'

// De twee tabellen van een calculatie: bewerkingen (instellen + tijd per stuk)
// en materiaal en overige kosten. Gebruikt door de calculatie en door de
// calculatie per artikel van een aanbieding.
// `wijzig(veld, lijst)` krijgt de nieuwe lijst 'bewerkingen' of 'kosten'.
export default function KostenTabellen({ bewerkingen, kosten, aantallen: aantallenLijst, wijzig }) {
  const [calculatorRegel, setCalculatorRegel] = useState(null) // index in kosten

  function setRegel(lijst, index, veld, waarde) {
    const huidig = lijst === 'bewerkingen' ? bewerkingen : kosten
    wijzig(
      lijst,
      huidig.map((r, i) => (i === index ? { ...r, [veld]: waarde } : r))
    )
  }

  function verwijderRegel(lijst, index) {
    const huidig = lijst === 'bewerkingen' ? bewerkingen : kosten
    wijzig(
      lijst,
      huidig.filter((_, i) => i !== index)
    )
  }

  // Uitkomst van de materiaalcalculator in de kostenregel zetten.
  function neemMateriaalOver(index, { materiaal, omschrijving, perStuk }) {
    wijzig(
      'kosten',
      kosten.map((k, i) => (i === index ? { ...k, soort: 'Materiaal', materiaal, omschrijving, perStuk } : k))
    )
    setCalculatorRegel(null)
  }

  // Alle bewerkingen samen: instellen (per serie) en bewerken per stuk.
  const bewerkingTotaal = useMemo(
    () =>
      bewerkingen.reduce(
        (som, b) => {
          const k = bewerkingKosten(b)
          return { instel: som.instel + k.instel, perStuk: som.perStuk + k.perStuk }
        },
        { instel: 0, perStuk: 0 }
      ),
    [bewerkingen]
  )
  // Alle materiaal- en overige kosten samen.
  const kostenTotaal = useMemo(
    () =>
      kosten.reduce(
        (som, k) => ({
          perStuk: som.perStuk + (Number(k.perStuk) || 0),
          eenmalig: som.eenmalig + (Number(k.eenmalig) || 0),
        }),
        { perStuk: 0, eenmalig: 0 }
      ),
    [kosten]
  )

  return (
    <>
      <div className="regel-grid-kop">
        <h3>Bewerkingen</h3>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() =>
            wijzig('bewerkingen', [
              ...bewerkingen,
              {
                omschrijving: '',
                instelMinuten: '',
                stukSeconden: '',
                uurtarief: bewerkingen.at(-1)?.uurtarief ?? STANDAARD_UURTARIEF,
              },
            ])
          }
        >
          + Bewerking
        </button>
      </div>
      <div className="regel-grid-wrap">
        <table className="regel-grid">
          <thead>
            <tr>
              <th>Bewerking</th>
              <th className="num">Insteltijd (min)</th>
              <th className="num">Tijd per stuk (sec)</th>
              <th className="num">Uurtarief (€)</th>
              <th className="num">Instelkosten</th>
              <th className="num" title="Alleen de bewerkingstijd, zonder instellen">
                Bewerken per stuk
              </th>
              {aantallenLijst.map((a) => (
                <th key={a} className="num" title={`Instelkosten verdeeld over ${a} stuks + bewerken per stuk`}>
                  Per stuk bij {formatNumber(a, 0)}
                </th>
              ))}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {bewerkingen.length === 0 ? (
              <tr>
                <td colSpan={7 + aantallenLijst.length} className="regel-grid-leeg">
                  Nog geen bewerkingen. Voeg bijvoorbeeld zagen, draaien of frezen toe.
                </td>
              </tr>
            ) : (
              bewerkingen.map((b, i) => (
                <tr key={i}>
                  <td>
                    <input
                      type="text"
                      value={b.omschrijving}
                      placeholder="bijv. Draaien"
                      onChange={(e) => setRegel('bewerkingen', i, 'omschrijving', e.target.value)}
                    />
                  </td>
                  <td className="num">
                    <GetalCel
                      value={b.instelMinuten}
                      decimalen={0}
                      maxDecimalen={1}
                      onCommit={(v) => setRegel('bewerkingen', i, 'instelMinuten', v)}
                    />
                  </td>
                  <td className="num">
                    <GetalCel
                      value={b.stukSeconden}
                      decimalen={0}
                      maxDecimalen={1}
                      onCommit={(v) => setRegel('bewerkingen', i, 'stukSeconden', v)}
                    />
                  </td>
                  <td className="num">
                    <GetalCel
                      value={b.uurtarief}
                      decimalen={2}
                      onCommit={(v) => setRegel('bewerkingen', i, 'uurtarief', v)}
                    />
                  </td>
                  <td className="num alleen-lezen">{formatNumber(bewerkingKosten(b).instel, 2)}</td>
                  <td className="num alleen-lezen">{formatNumber(bewerkingKosten(b).perStuk, 4)}</td>
                  {aantallenLijst.map((a) => (
                    <td key={a} className="num alleen-lezen">
                      {formatNumber(bewerkingKosten(b).instel / a + bewerkingKosten(b).perStuk, 4)}
                    </td>
                  ))}
                  <td className="alleen-lezen" style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => verwijderRegel('bewerkingen', i)}
                      aria-label="Bewerking verwijderen"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {bewerkingen.length > 1 && (
            <tfoot>
              <tr>
                <td colSpan={4}>Totaal bewerkingen</td>
                <td className="num">{formatNumber(bewerkingTotaal.instel, 2)}</td>
                <td className="num">{formatNumber(bewerkingTotaal.perStuk, 4)}</td>
                {aantallenLijst.map((a) => (
                  <td key={a} className="num">
                    {formatNumber(bewerkingTotaal.instel / a + bewerkingTotaal.perStuk, 4)}
                  </td>
                ))}
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div className="regel-grid-kop" style={{ marginTop: 18 }}>
        <h3>Materiaal en overige kosten</h3>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              wijzig('kosten', [
                ...kosten,
                {
                  soort: 'Materiaal',
                  omschrijving: '',
                  perStuk: '',
                  eenmalig: '',
                },
              ])
              setCalculatorRegel(kosten.length)
            }}
          >
            + Materiaal
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() =>
              wijzig('kosten', [
                ...kosten,
                {
                  soort: 'Uitbesteed',
                  omschrijving: '',
                  perStuk: '',
                  eenmalig: '',
                },
              ])
            }
          >
            + Overige kosten
          </button>
        </div>
      </div>
      <div className="regel-grid-wrap">
        <table className="regel-grid">
          <thead>
            <tr>
              <th>Soort</th>
              <th>Omschrijving</th>
              <th className="num">Per stuk (€)</th>
              <th className="num">Eenmalig (€)</th>
              {aantallenLijst.map((a) => (
                <th key={a} className="num" title={`Per stuk + eenmalige kosten verdeeld over ${a} stuks`}>
                  Per stuk bij {formatNumber(a, 0)}
                </th>
              ))}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {kosten.length === 0 ? (
              <tr>
                <td colSpan={5 + aantallenLijst.length} className="regel-grid-leeg">
                  Nog geen kosten. Voeg materiaal, uitbesteed werk of gereedschap toe.
                </td>
              </tr>
            ) : (
              kosten.map((k, i) => (
                <tr key={i}>
                  <td>
                    <select
                      value={k.soort}
                      onChange={(e) => {
                        setRegel('kosten', i, 'soort', e.target.value)
                        if (e.target.value === 'Materiaal') setCalculatorRegel(i)
                      }}
                    >
                      {KOSTENSOORTEN.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="text"
                      value={k.omschrijving}
                      placeholder="bijv. Messing staf Ø30"
                      onChange={(e) => setRegel('kosten', i, 'omschrijving', e.target.value)}
                    />
                  </td>
                  <td className="num">
                    <GetalCel
                      value={k.perStuk}
                      decimalen={2}
                      maxDecimalen={4}
                      onCommit={(v) => setRegel('kosten', i, 'perStuk', v)}
                    />
                  </td>
                  <td className="num">
                    <GetalCel value={k.eenmalig} decimalen={2} onCommit={(v) => setRegel('kosten', i, 'eenmalig', v)} />
                  </td>
                  {aantallenLijst.map((a) => (
                    <td key={a} className="num alleen-lezen">
                      {formatNumber((Number(k.perStuk) || 0) + (Number(k.eenmalig) || 0) / a, 4)}
                    </td>
                  ))}
                  <td className="alleen-lezen" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {k.soort === 'Materiaal' && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setCalculatorRegel(i)}
                        title="Materiaalprijs per stuk berekenen"
                      >
                        Calculator
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => verwijderRegel('kosten', i)}
                      aria-label="Kostenregel verwijderen"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {kosten.length > 1 && (
            <tfoot>
              <tr>
                <td colSpan={2}>Totaal materiaal en overige kosten</td>
                <td className="num">{formatNumber(kostenTotaal.perStuk, 4)}</td>
                <td className="num">{formatNumber(kostenTotaal.eenmalig, 2)}</td>
                {aantallenLijst.map((a) => (
                  <td key={a} className="num">
                    {formatNumber(kostenTotaal.perStuk + kostenTotaal.eenmalig / a, 4)}
                  </td>
                ))}
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {calculatorRegel !== null && kosten[calculatorRegel] && (
        <MateriaalCalculator
          waarde={kosten[calculatorRegel].materiaal}
          onOvernemen={(uitkomst) => neemMateriaalOver(calculatorRegel, uitkomst)}
          onAnnuleren={() => setCalculatorRegel(null)}
        />
      )}
    </>
  )
}

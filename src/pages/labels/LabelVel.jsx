import { forwardRef } from 'react'
import { code128Modules } from '../../lib/code128'
import { familieVan, fotoUrl, labelDatum, merkBestand, LABEL_MAAT } from '../../lib/labels'

// Excel-kolombreedte (teken) naar millimeter, dezelfde omrekening als Excel.
const MM_PER_PT = 25.4 / 72

function kolomMm(breedte) {
  const px = Math.trunc(((256 * breedte + Math.trunc(128 / 7)) / 256) * 7)
  return (px / 96) * 25.4
}

function raster(rijPt, kolBreedte) {
  const y = [0]
  for (const h of rijPt) y.push(y[y.length - 1] + h * MM_PER_PT)
  const x = [0]
  for (const w of kolBreedte) x.push(x[x.length - 1] + kolomMm(w))
  return { x, y }
}

// Afdrukbereik en rijhoogtes uit temp3.xlsm, zodat tekst en kaders op dezelfde plek staan.
const KLAS = raster(
  [18, 19.5, 24, 6, 15.75, 15.75, 15.75, 18.75, 12.75, 12.75, 12.75, 12.75, 12.75, 12.75, 10.5, 27.75, 10.5],
  [2.7109375, 23.28515625, 0.7109375, 5.85546875, 17.85546875],
)
const PCC = raster(
  [11.25, 14.25, 18, 21.75, 15.75, 15.75, 18.75, 12.75, 12.75, 12.75, 12.75, 12.75, 11.25, 21.75, 15, 11.25, 17.25],
  [1.140625, 4.28515625, 7.7109375, 5.7109375, 5.85546875, 25.140625],
)
const BON = raster(
  [11.25, 14.25, 31.5, 24.75, 15.75, 24, 21, 12.75, 12.75, 5.25, 12.75, 12.75, 11.25, 21.75, 15, 11.25, 17.25],
  [1.140625, 4.28515625, 9.7109375, 1.42578125, 7.5703125, 25.140625],
)
const ZEH = raster(
  [11.25, 9.75, 21.75, 22.5, 15.75, 17.25, 15, 18, 12.75, 18, 16.5, 12.75, 22.5, 21.75, 15, 11.25, 17.25],
  [1.140625, 2.5703125, 7.7109375, 5.7109375, 5.85546875, 26.7109375],
)
const BET = raster(
  [18, 18, 18.75, 6, 15.75, 15.75, 15.75, 18.75, 15.75, 12.75, 15.75, 12.75, 12.75, 12.75, 10.5, 27.75],
  [4.7109375, 14, 0.7109375, 15],
)

function mm(n) {
  return `${n}mm`
}

function Streepjescode({ waarde, hoogte }) {
  const tekst = String(waarde || '').trim()
  if (!tekst) return null
  let modules
  try {
    modules = code128Modules(tekst)
  } catch {
    return <div className="etiket-cijfers">{tekst}</div>
  }
  const breed = modules.reduce((som, m) => som + m.w, 0)
  let x = 0
  return (
    <svg
      className="etiket-barcode"
      style={hoogte ? { height: mm(hoogte) } : undefined}
      viewBox={`0 0 ${breed} 1`}
      preserveAspectRatio="none"
      role="img"
      aria-label={tekst}
    >
      {modules.map((m, i) => {
        const rx = x
        x += m.w
        if (!m.bar) return null
        return <rect key={i} x={rx} y="0" width={m.w} height="1" />
      })}
    </svg>
  )
}

function Vlak({ x, y, w, h, size = 8, vet = false, align = 'flex-start', klasse = '', children }) {
  return (
    <div
      className={`vlak${vet ? ' vet' : ''} ${klasse}`}
      style={{
        left: mm(x),
        top: mm(y),
        width: mm(w),
        height: mm(h),
        fontSize: `${size}pt`,
        justifyContent: align,
      }}
    >
      {children}
    </div>
  )
}

function Lijn({ x, y, w }) {
  return <div className="etiket-lijn" style={{ left: mm(x), top: mm(y), width: mm(w) }} />
}

function FotoAbs({ src, x, y, w, h }) {
  if (!src) return null
  return <img src={src} alt="" className="etiket-foto-abs" style={{ left: mm(x), top: mm(y), width: mm(w), height: mm(h) }} />
}

function Tabel({ grid, children }) {
  const { x, y } = grid
  return (
    <table className="etiket-tabel" style={{ width: mm(x[x.length - 1]), height: mm(y[y.length - 1]) }}>
      <colgroup>
        {x.slice(0, -1).map((start, i) => (
          <col key={i} style={{ width: mm(x[i + 1] - start) }} />
        ))}
      </colgroup>
      <tbody>{children}</tbody>
    </table>
  )
}

function Rij({ grid, n, children }) {
  const { y } = grid
  return <tr style={{ height: mm(y[n] - y[n - 1]) }}>{children}</tr>
}

function Klassiek({ label, foto }) {
  const { x, y } = KLAS
  const regels = [label.nl1, label.nl2, label.en1, label.en2, label.de1, label.de2]
  const koppen = [
    ['Type:', label.type],
    ['Artikel nr.:', label.artNr],
    ['Qty.:', label.aantal],
  ]
  const lijnX = x[1] + 0.79
  const fotoY = y[7] + 4.23
  return (
    <>
      <Vlak x={0} y={y[2]} w={96} h={y[3] - y[2]} size={8} klasse="vlak-adres">
        Loswal 5 4271 BA Dussen Tel: +31 (0)416-392233 Email: Info@fmid.nl
      </Vlak>
      {koppen.map(([naam, waarde], i) => (
        <span key={naam}>
          <Vlak x={x[1]} y={y[4 + i]} w={x[2] - x[1]} h={y[5 + i] - y[4 + i]} size={12} vet>
            {naam}
          </Vlak>
          <Vlak x={x[3]} y={y[4 + i]} w={x[5] - x[3]} h={y[5 + i] - y[4 + i]} size={12} vet>
            {waarde}
          </Vlak>
        </span>
      ))}
      <FotoAbs src={foto} x={x[1] + 3.79} y={fotoY} w={25.76} h={y[13] + 0.88 - fotoY} />
      {regels.map((regel, i) => (
        <Vlak key={i} x={x[3]} y={y[8 + i]} w={x[5] - x[3]} h={y[9 + i] - y[8 + i]} size={8}>
          {regel}
        </Vlak>
      ))}
      <Lijn x={lijnX} y={y[14] + 1.59} w={x[4] + 30.96 - lijnX} />
      <Vlak x={0} y={y[15]} w={x[5]} h={y[16] - y[15]} klasse="vlak-code">
        <Streepjescode waarde={label.barcode} hoogte={y[16] - y[15]} />
      </Vlak>
      <Lijn x={lijnX} y={y[16] + 3.44} w={x[4] + 30.16 - lijnX} />
      <Vlak x={0} y={y[16]} w={x[5]} h={y[17] - y[16]} size={8} align="center" klasse="vlak-calibri">
        {label.barcode}
      </Vlak>
    </>
  )
}

function Pcc({ label, foto, datum }) {
  const { x, y } = PCC
  const merk = merkBestand(label.soort)
  const codeHoog = y[16] - y[13]
  return (
    <>
      <Tabel grid={PCC}>
        <Rij grid={PCC} n={1}>
          <td colSpan={6} />
        </Rij>
        <Rij grid={PCC} n={2}>
          <td />
          <td className="kader-cel" colSpan={5} rowSpan={2}>
            {merk ? <img src={merk} alt="" className="etiket-logo" /> : null}
          </td>
        </Rij>
        <Rij grid={PCC} n={3} />
        <Rij grid={PCC} n={4}>
          <td />
          <td className="rand-l rand-t rand-b ha-r vet" colSpan={3} style={{ fontSize: '16pt' }}>
            Art.-Nr.:
          </td>
          <td className="rand-r rand-t rand-b ha-l vet" colSpan={2} style={{ fontSize: '16pt' }}>
            {label.type || label.artNr}
          </td>
        </Rij>
        <Rij grid={PCC} n={5}>
          <td />
          <td className="kader-cel ha-c" colSpan={2} style={{ fontSize: '9pt' }}>
            Stuck/pcs
          </td>
          <td className="kader-cel ha-c" colSpan={3} style={{ fontSize: '12pt' }}>
            Dim/dim
          </td>
        </Rij>
        <Rij grid={PCC} n={6}>
          <td />
          <td className="kader-cel ha-c vet" colSpan={2} style={{ fontSize: '12pt' }}>
            {label.aantal}
          </td>
          <td className="kader-cel ha-c vet" colSpan={3} style={{ fontSize: '12pt' }}>
            {label.nl2}
          </td>
        </Rij>
        <Rij grid={PCC} n={7}>
          <td />
          <td className="rand-l rand-t" />
          <td className="rand-t" />
          <td className="rand-t" />
          <td className="rand-t" />
          <td className="rand-r rand-t" />
        </Rij>
        <Rij grid={PCC} n={8}>
          <td />
          <td className="rand-l" />
          <td />
          <td />
          <td className="rand-r ha-c vet" colSpan={2} style={{ fontSize: '12pt' }}>
            {label.nl1}
          </td>
        </Rij>
        <Rij grid={PCC} n={9}>
          <td />
          <td className="rand-l" />
          <td />
          <td />
          <td />
          <td className="rand-r" />
        </Rij>
        <Rij grid={PCC} n={10}>
          <td />
          <td className="rand-l" />
          <td />
          <td />
          <td className="rand-r ha-c vet" colSpan={2} style={{ fontSize: '12pt' }}>
            {label.en1}
          </td>
        </Rij>
        {[11, 12, 13].map((n) => (
          <Rij key={n} grid={PCC} n={n}>
            <td />
            <td className="rand-l" />
            <td />
            <td />
            <td />
            <td className="rand-r" />
          </Rij>
        ))}
        <Rij grid={PCC} n={14}>
          <td />
          <td className="rand-l rand-t" />
          <td className="rand-t" />
          <td className="rand-t" />
          <td className="rand-r rand-t cel-code" colSpan={2} rowSpan={3}>
            <Streepjescode waarde={label.barcode} hoogte={codeHoog} />
          </td>
        </Rij>
        <Rij grid={PCC} n={15}>
          <td />
          <td className="rand-l" />
          <td />
          <td />
        </Rij>
        <Rij grid={PCC} n={16}>
          <td />
          <td className="rand-l" />
          <td className="rand-b ha-c vet" colSpan={2} style={{ fontSize: '10pt' }}>
            {label.en2}
          </td>
        </Rij>
        <Rij grid={PCC} n={17}>
          <td />
          <td className="bn-l ha-r vet" style={{ fontSize: '10pt' }}>
            BN:
          </td>
          <td className="bn-m ha-c" style={{ fontSize: '8pt' }}>
            {datum}
          </td>
          <td className="bn-s" />
          <td className="bn-r ha-c vlak-calibri" colSpan={2} style={{ fontSize: '8pt' }}>
            {label.barcode}
          </td>
        </Rij>
      </Tabel>
      <FotoAbs src={foto} x={x[1] + 0.6} y={y[7] + 0.4} w={x[4] - x[1] - 1.2} h={y[12] - y[7] - 0.8} />
    </>
  )
}

function Bonfix({ label, foto }) {
  const { x, y } = BON
  const codeHoog = y[16] - y[13]
  return (
    <>
      <Tabel grid={BON}>
        <Rij grid={BON} n={1}>
          <td colSpan={6} />
        </Rij>
        <Rij grid={BON} n={2}>
          <td colSpan={6} />
        </Rij>
        <Rij grid={BON} n={3}>
          <td colSpan={6} />
        </Rij>
        <Rij grid={BON} n={4}>
          <td />
          <td className="kader-mid vc" colSpan={5} style={{ fontSize: '11pt' }}>
            {label.nl1}
          </td>
        </Rij>
        <Rij grid={BON} n={5}>
          <td colSpan={6} />
        </Rij>
        <Rij grid={BON} n={6}>
          <td />
          <td className="kader-mid ha-c vc vet" colSpan={2} style={{ fontSize: '12pt' }}>
            {label.artNr}
          </td>
          <td />
          <td className="kader-mid ha-c vc vet" style={{ fontSize: '12pt' }}>
            {label.aantal}
          </td>
          <td />
        </Rij>
        <Rij grid={BON} n={7}>
          <td />
          <td className="ha-c" colSpan={2} style={{ fontSize: '12pt' }}>
            artikel
          </td>
          <td />
          <td style={{ fontSize: '12pt' }}>aantal</td>
          <td />
        </Rij>
        {[8, 9, 10, 11, 12, 13].map((n) => (
          <Rij key={n} grid={BON} n={n}>
            <td colSpan={6} />
          </Rij>
        ))}
        <Rij grid={BON} n={14}>
          <td colSpan={4} />
          <td className="cel-code" colSpan={2} rowSpan={3}>
            <Streepjescode waarde={label.barcode} hoogte={codeHoog} />
          </td>
        </Rij>
        <Rij grid={BON} n={15}>
          <td colSpan={4} />
        </Rij>
        <Rij grid={BON} n={16}>
          <td colSpan={4} />
        </Rij>
        <Rij grid={BON} n={17}>
          <td />
          <td />
          <td className="ha-c vet" style={{ fontSize: '8pt' }}>
            M-PROFIEL
          </td>
          <td />
          <td className="ha-c vlak-calibri" colSpan={2} style={{ fontSize: '11pt' }}>
            {label.barcode}
          </td>
        </Rij>
      </Tabel>
      <img
        src={merkBestand('PCC-BONFIX')}
        alt=""
        className="etiket-foto-abs"
        style={{ left: mm(x[2] + 5.38), top: mm(3.7), width: mm(x[5] + 31.66 - (x[2] + 5.38)), height: mm(y[2] + 10.38 - 3.7) }}
      />
      <FotoAbs src={foto} x={x[1]} y={y[7]} w={x[6] - x[1]} h={y[13] - y[7]} />
    </>
  )
}

function Zeh({ label }) {
  const { x, y } = ZEH
  const tekeningX = x[5] + 8.13
  const regels = [
    [6, 'Gerade', 14, false],
    [7, 'klemmverschraubung', 14, false],
    [8, 'Verzinkt mit kunststoffring', 14, false],
    [10, 'Abmessung:', 18, true],
    [11, 'Fur Rohr 15 mm.', 14, false],
    [14, 'Anzugsmoment ca 40 Nm', 14, false],
  ]
  return (
    <>
      <div className="kader-abs" style={{ left: mm(x[2]), top: mm(y[2]), width: mm(x[5] - x[2]), height: mm(y[4] - y[2]) }} />
      <Vlak x={x[2]} y={y[2]} w={tekeningX - x[2]} h={y[3] - y[2]} size={18} vet>
        SCHRAUB 15
      </Vlak>
      <Vlak x={x[2]} y={y[3]} w={tekeningX - x[2]} h={y[4] - y[3]} size={18} vet>
        M20 x 1.5
      </Vlak>
      <img
        src={merkBestand('ZEH')}
        alt=""
        className="etiket-foto-abs"
        style={{ left: mm(tekeningX), top: mm(y[0] + 0.9), width: mm(38.93), height: mm(y[5] + 3.5 - (y[0] + 0.9)) }}
      />
      {regels.map(([rij, tekst, size, vet]) => (
        <Vlak key={rij} x={x[2]} y={y[rij - 1]} w={x[6] - x[2]} h={y[rij] - y[rij - 1]} size={size} vet={vet}>
          {tekst}
        </Vlak>
      ))}
      <Vlak x={x[2]} y={y[12]} w={x[4] - x[2]} h={y[13] - y[12]} size={14}>
        Stuckzahl:
      </Vlak>
      <Vlak x={x[4]} y={y[12]} w={x[6] - x[4]} h={y[13] - y[12]} size={18} vet>
        {label.aantal}
      </Vlak>
    </>
  )
}

function Bet({ label, datum }) {
  const { x, y } = BET
  const links = x[1]
  const breed = x[4] - x[1]
  const rechts = x[3]
  return (
    <>
      <Vlak x={links} y={y[4]} w={breed} h={y[5] - y[4]} size={14} vet>
        {label.type || label.artNr}
      </Vlak>
      <Vlak x={links} y={y[6]} w={breed} h={y[7] - y[6]} size={14} vet>
        {label.nl1}
      </Vlak>
      <Vlak x={links} y={y[8]} w={x[2] - x[1]} h={y[9] - y[8]} size={14} vet>
        d.d.
      </Vlak>
      <Vlak x={rechts} y={y[8]} w={x[4] - x[3]} h={y[9] - y[8]} size={14} vet>
        {datum}
      </Vlak>
      <Vlak x={links} y={y[10]} w={x[2] - x[1]} h={y[11] - y[10]} size={14} vet>
        Aantal:
      </Vlak>
      <Vlak x={rechts} y={y[10]} w={x[4] - x[3]} h={y[11] - y[10]} size={14} vet>
        {label.aantal} Stk.
      </Vlak>
    </>
  )
}

export const LabelVel = forwardRef(function LabelVel({ label, datum }, ref) {
  if (!label) return null
  const familie = familieVan(label.soort)
  const foto = fotoUrl(label.foto)
  const wanneer = datum || labelDatum(label.soort)
  return (
    <article
      ref={ref}
      className={`etiket etiket-${familie}`}
      style={{ width: mm(LABEL_MAAT.breedteMm), height: mm(LABEL_MAAT.hoogteMm) }}
    >
      {familie === 'klassiek' && <Klassiek label={label} foto={foto} />}
      {familie === 'pcc' && <Pcc label={label} foto={foto} datum={wanneer} />}
      {familie === 'bonfix' && <Bonfix label={label} foto={foto} />}
      {familie === 'zeh' && <Zeh label={label} />}
      {familie === 'bet' && <Bet label={label} datum={wanneer} />}
    </article>
  )
})

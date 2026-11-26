import { forwardRef } from 'react'

function kg(waarde) {
  return Number(waarde).toLocaleString('nl-NL', { maximumFractionDigits: 6 })
}

function datumTekst(d) {
  const dag = String(d.getDate()).padStart(2, '0')
  const maand = String(d.getMonth() + 1).padStart(2, '0')
  return `${dag}-${maand}-${d.getFullYear()}`
}

// Etiket op de doos, zelfde regels als Etiket.xlsx uit Controlsys.
export const DoosEtiket = forwardRef(function DoosEtiket({ doos }, ref) {
  const regels = [
    ['Box no:', doos.doosnummer],
    ['Article no:', doos.artikelnummerKlant, true],
    ['Name:', doos.artikelnaam],
    ['Qty:', doos.aantal, true],
    ['Date:', datumTekst(doos.datum)],
    ['Prod. order no:', doos.productieorder],
    ['Tare (kg):', kg(doos.tarra)],
    ['Weight (kg)/pcs.', kg(doos.gewichtPerProduct)],
    ['Total weight (kg):', kg(doos.totaalGewicht)],
    ['Article FMID:', doos.artikelnummer],
  ]
  return (
    <div className="doos-etiket" ref={ref}>
      <div className="doos-etiket-kop">F.M.I. Dussen B.V.</div>
      <table>
        <tbody>
          {regels.map(([label, waarde, groot]) => (
            <tr key={label} className={groot ? 'groot' : undefined}>
              <th>{label}</th>
              <td>{waarde}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
})

import { useState } from 'react'
import { getDoc, doc } from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import {
  JA_NEE_VELDEN,
  fotoSleutel,
  maakVoorschrift,
  slaVoorschriftOp,
  verwijderVoorschrift,
} from '../../lib/verpakken'

function invoer(waarde) {
  if (waarde === null || waarde === undefined) return ''
  return typeof waarde === 'number' ? String(waarde).replace('.', ',') : String(waarde)
}

const GETALLEN = [
  ['aantalPerZak', 'Aantal per zak', 'stuks'],
  ['zakkenPerDoos', 'Zakken per doos', ''],
  ['aantalPerDoos', 'Aantal per doos', 'stuks'],
  ['gewichtPerProduct', 'Gewicht per product', 'kg'],
  ['tarraDoos', 'Tarragewicht doos', 'kg'],
]

// Formulier voor één verpakkingsvoorschrift. `voorschrift` zonder id = nieuw.
// onDone(voorschrift) na opslaan, onDone() bij annuleren of verwijderen.
export default function VoorschriftForm({ voorschrift, onDone }) {
  const { profile, isAdmin } = useAuth()
  const gebruiker = profile?.naam || profile?.email || ''
  const isNieuw = !voorschrift?.id
  const [v, setV] = useState(() => {
    const begin = { ...voorschrift }
    for (const [veld] of GETALLEN) begin[veld] = invoer(begin[veld])
    return begin
  })
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState(null)

  function zet(veld, waarde) {
    setV((oud) => ({ ...oud, [veld]: waarde }))
  }

  async function opslaan(e) {
    e.preventDefault()
    const nieuw = maakVoorschrift(v)
    if (!nieuw.artikelnummer) return setFout('Artikelnummer is verplicht.')
    for (const [veld, label] of GETALLEN) {
      if (String(v[veld] ?? '').trim() !== '' && (nieuw[veld] === null || nieuw[veld] < 0)) {
        return setFout(`${label} moet een getal van 0 of hoger zijn.`)
      }
    }
    if (!(nieuw.gewichtPerProduct > 0) || nieuw.aantalPerDoos === null || nieuw.tarraDoos === null) {
      return setFout('Gewicht per product, aantal per doos en tarragewicht zijn nodig om te wegen.')
    }
    setFout(null)
    setBezig(true)
    try {
      if (isNieuw) {
        const bestaat = await getDoc(doc(db, 'verpakkingen', fotoSleutel(nieuw.artikelnummer)))
        if (bestaat.exists()) {
          setBezig(false)
          return setFout(`Voor ${nieuw.artikelnummer} bestaat al een voorschrift.`)
        }
      }
      await slaVoorschriftOp(nieuw, gebruiker)
      onDone?.(nieuw)
    } catch (err) {
      setFout(err.message)
      setBezig(false)
    }
  }

  async function verwijder() {
    if (!confirm(`Verpakkingsvoorschrift van ${voorschrift.artikelnummer} verwijderen?`)) return
    setBezig(true)
    try {
      await verwijderVoorschrift(voorschrift.id)
      onDone?.()
    } catch (err) {
      setFout(err.message)
      setBezig(false)
    }
  }

  return (
    <form onSubmit={opslaan}>
      {fout && <div className="banner banner-danger">{fout}</div>}
      <div className="field-row">
        <div className="field">
          <label htmlFor="vs-artikel">Artikelnummer</label>
          <input
            id="vs-artikel"
            type="text"
            value={v.artikelnummer || ''}
            disabled={!isNieuw}
            autoFocus={isNieuw}
            onChange={(e) => zet('artikelnummer', e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="vs-klant">Artikelnr. klant</label>
          <input
            id="vs-klant"
            type="text"
            value={v.artikelnummerKlant || ''}
            onChange={(e) => zet('artikelnummerKlant', e.target.value)}
          />
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="vs-doos">Soort doos</label>
          <input id="vs-doos" type="text" value={v.soortDoos || ''} onChange={(e) => zet('soortDoos', e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="vs-zak">Soort zak</label>
          <input id="vs-zak" type="text" value={v.soortZak || ''} onChange={(e) => zet('soortZak', e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="vs-tape">Soort tape</label>
          <input id="vs-tape" type="text" value={v.soortTape || ''} onChange={(e) => zet('soortTape', e.target.value)} />
        </div>
      </div>
      <div className="field-row">
        {GETALLEN.map(([veld, label, eenheid]) => (
          <div className="field" key={veld}>
            <label htmlFor={`vs-${veld}`}>
              {label}
              {eenheid && <span className="hint"> ({eenheid})</span>}
            </label>
            <input
              id={`vs-${veld}`}
              type="text"
              inputMode="decimal"
              value={v[veld]}
              onChange={(e) => zet(veld, e.target.value)}
            />
          </div>
        ))}
      </div>
      <div className="verpak-janee">
        {JA_NEE_VELDEN.map(([veld, label]) => (
          <label key={veld} className="verpak-vinkje">
            <input type="checkbox" checked={Boolean(v[veld])} onChange={(e) => zet(veld, e.target.checked)} />
            {label}
          </label>
        ))}
      </div>
      <div className="field">
        <label htmlFor="vs-opm">Opmerkingen</label>
        <textarea id="vs-opm" rows={3} value={v.opmerkingen || ''} onChange={(e) => zet('opmerkingen', e.target.value)} />
      </div>
      <div className="modal-actions" style={{ justifyContent: !isNieuw && isAdmin ? 'space-between' : 'flex-end' }}>
        {!isNieuw && isAdmin && (
          <button type="button" className="btn btn-danger" onClick={verwijder} disabled={bezig}>
            Verwijderen
          </button>
        )}
        <div className="verpak-knoppen">
          <button type="button" className="btn btn-secondary" onClick={() => onDone?.()} disabled={bezig}>
            Annuleren
          </button>
          <button type="submit" className="btn btn-primary" disabled={bezig}>
            {bezig ? 'Opslaan…' : isNieuw ? 'Toevoegen' : 'Opslaan'}
          </button>
        </div>
      </div>
    </form>
  )
}

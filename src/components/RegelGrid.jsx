import { useState } from 'react'

// Hulpmiddelen voor de bewerkbare regeltabellen (inkooporder, verkooporder),
// zodat ze zich hetzelfde gedragen als in Axapta.

// ↑/↓ in de regeltabel: naar dezelfde kolom op de regel erboven/eronder.
// Enter verlaat de cel, waardoor de wijziging wordt opgeslagen.
export function gridToets(e) {
  const { rij, kolom } = e.currentTarget.dataset
  if (e.key === 'Enter') {
    e.currentTarget.blur()
    return
  }
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
  // In de artikellijst van de nieuwe regel kiezen de pijltjes een suggestie.
  if (e.currentTarget.list) return
  const doel = Number(rij) + (e.key === 'ArrowUp' ? -1 : 1)
  const cel = e.currentTarget
    .closest('table')
    ?.querySelector(`[data-rij="${doel}"][data-kolom="${kolom}"]`)
  if (cel) {
    e.preventDefault()
    cel.focus()
    cel.select?.()
  }
}

// "1.900,50" -> 1900.5. Zonder komma geldt een punt als duizendtal-scheiding
// als het er zo uitziet ("1.900"), anders als decimaalteken ("0.05").
export function parseGetal(tekst) {
  const t = String(tekst).trim().replace(/\s/g, '')
  if (t === '') return ''
  let n
  if (t.includes(',')) n = Number(t.replace(/\./g, '').replace(',', '.'))
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) n = Number(t.replace(/\./g, ''))
  else n = Number(t)
  return Number.isFinite(n) ? n : null
}

// Getalcel zoals in Axapta: toont "1.900,00", bij het bewerken het kale getal.
export function GetalCel({ value, decimalen = 2, maxDecimalen = decimalen, onCommit, rij, kolom }) {
  const [bewerken, setBewerken] = useState(null)
  const leeg = value === '' || value == null
  const weergave = leeg
    ? ''
    : Number(value).toLocaleString('nl-NL', { minimumFractionDigits: decimalen, maximumFractionDigits: maxDecimalen })

  return (
    <input
      type="text"
      inputMode="decimal"
      data-rij={rij}
      data-kolom={kolom}
      value={bewerken ?? weergave}
      onFocus={(e) => {
        setBewerken(leeg ? '' : String(value).replace('.', ','))
        const el = e.currentTarget
        setTimeout(() => el.select(), 0)
      }}
      onChange={(e) => setBewerken(e.target.value)}
      onBlur={() => {
        const n = parseGetal(bewerken ?? '')
        setBewerken(null)
        if (n !== null) onCommit(n)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          setBewerken(leeg ? '' : String(value).replace('.', ','))
          return
        }
        gridToets(e)
      }}
    />
  )
}

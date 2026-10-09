import { useEffect, useId, useRef } from 'react'
import { haalLocatieOpCode, useLocatieZoeken } from '../lib/locatieZoeken'

// Invoerveld voor een locatiecode met suggesties terwijl je typt, zoals
// ArtikelKiezer. `onKies` krijgt de locatie als de tekst exact een code is,
// anders null.
export default function LocatieKiezer({ value, onChange, onKies, ...inputProps }) {
  const lijstId = useId()
  const { locaties } = useLocatieZoeken(value, { max: 30 })
  const laatsteRef = useRef(null)

  useEffect(() => {
    const tekst = String(value || '').trim().toUpperCase()
    if (!tekst) {
      if (laatsteRef.current !== null) onKies?.(null)
      laatsteRef.current = null
      return
    }
    const treffer = locaties.find((l) => l.code === tekst)
    if (treffer) {
      if (laatsteRef.current?.id !== treffer.id) onKies?.(treffer)
      laatsteRef.current = treffer
      return
    }
    let actief = true
    haalLocatieOpCode(tekst).then((l) => {
      if (!actief) return
      if (laatsteRef.current?.id !== l?.id) onKies?.(l)
      laatsteRef.current = l
    })
    return () => {
      actief = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, locaties])

  return (
    <>
      <input
        type="text"
        list={lijstId}
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        {...inputProps}
      />
      <datalist id={lijstId}>
        {locaties.map((l) => (
          <option key={l.id} value={l.code}>
            {[l.naam, l.type].filter(Boolean).join(' · ')}
          </option>
        ))}
      </datalist>
    </>
  )
}

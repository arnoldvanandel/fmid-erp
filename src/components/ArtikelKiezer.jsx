import { useEffect, useId, useRef } from 'react'
import { haalArtikelOpNummer, useArtikelZoeken } from '../lib/artikelZoeken'

// Invoerveld voor een artikelnummer met suggesties terwijl je typt. Zoekt in
// Firestore (zie lib/artikelZoeken.js) in plaats van alle artikelen te laden.
// `onKies` krijgt het artikel als de tekst exact een artikelnummer is, anders null.
export default function ArtikelKiezer({ value, onChange, onKies, filter, ...inputProps }) {
  const lijstId = useId()
  const { artikelen } = useArtikelZoeken(value, { max: 30, filter })
  const laatsteRef = useRef(null)

  useEffect(() => {
    const tekst = String(value || '').trim().toLowerCase()
    if (!tekst) {
      if (laatsteRef.current !== null) onKies?.(null)
      laatsteRef.current = null
      return
    }
    const treffer = artikelen.find((a) => String(a.artikelnummer).toLowerCase() === tekst)
    if (treffer) {
      if (laatsteRef.current?.id !== treffer.id) onKies?.(treffer)
      laatsteRef.current = treffer
      return
    }
    // Niet in de suggesties (bijv. meer dan 30 treffers): exact opzoeken.
    let actief = true
    haalArtikelOpNummer(value).then((a) => {
      if (!actief) return
      const gekozen = a && (!filter || filter(a)) ? a : null
      if (laatsteRef.current?.id !== gekozen?.id) onKies?.(gekozen)
      laatsteRef.current = gekozen
    })
    return () => {
      actief = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, artikelen])

  return (
    <>
      <input
        type="text"
        list={lijstId}
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        {...inputProps}
      />
      <datalist id={lijstId}>
        {artikelen.map((a) => (
          <option key={a.id} value={a.artikelnummer}>
            {a.naam}
          </option>
        ))}
      </datalist>
    </>
  )
}

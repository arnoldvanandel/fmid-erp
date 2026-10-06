import { useEffect, useMemo, useState } from 'react'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { haalArtikelenOp } from '../lib/artikelZoeken'
import { useVoorraadTotals } from './useVoorraadTotals'

// De artikelen die voor het voorraadoverzicht en het dashboard tellen: alles
// met voorraad op een locatie, plus alles met een minimumvoorraad. Zo hoeven
// we niet alle ~17.000 artikelen op te halen.
export function useVoorraadArtikelen() {
  const voorraad = useVoorraadTotals()
  const [metMinimum, setMetMinimum] = useState([])
  const [artikelenById, setArtikelenById] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getDocs(query(collection(db, 'artikelen'), where('minVoorraad', '>', 0)))
      .then((snap) => setMetMinimum(snap.docs.map((d) => ({ id: d.id, ...d.data() }))))
      .catch(() => setMetMinimum([]))
  }, [])

  const idsMetVoorraad = useMemo(
    () => Object.keys(voorraad.standenPerArtikel).sort().join(','),
    [voorraad.standenPerArtikel]
  )

  useEffect(() => {
    let actief = true
    const ids = idsMetVoorraad ? idsMetVoorraad.split(',') : []
    const ontbrekend = ids.filter((id) => !metMinimum.some((a) => a.id === id))
    haalArtikelenOp(ontbrekend)
      .then((map) => {
        if (!actief) return
        for (const a of metMinimum) map[a.id] = a
        setArtikelenById(map)
      })
      .finally(() => actief && setLoading(false))
    return () => {
      actief = false
    }
  }, [idsMetVoorraad, metMinimum])

  const artikelen = useMemo(
    () =>
      Object.values(artikelenById).sort((a, b) =>
        String(a.artikelnummer).localeCompare(String(b.artikelnummer), 'nl')
      ),
    [artikelenById]
  )

  const laag = useMemo(
    () =>
      artikelen.filter(
        (a) => Number(a.minVoorraad) > 0 && (voorraad.totalenPerArtikel[a.id] || 0) <= Number(a.minVoorraad)
      ),
    [artikelen, voorraad.totalenPerArtikel]
  )

  return { ...voorraad, artikelen, laag, loading: loading || voorraad.loading }
}

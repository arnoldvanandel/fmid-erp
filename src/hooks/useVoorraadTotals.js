import { useMemo } from 'react'
import { useCollection } from './useCollection'

// Telt voor elk artikel de voorraad over alle locaties bij elkaar op.
// Geeft ook de losse standen (per artikel+locatie) terug voor de detailweergave.
// Posities met 0 stuks (bijv. na een afboeking tot nul) laten we weg.
export function useVoorraadTotals() {
  const { data: alleStanden, loading, error } = useCollection('voorraadstanden')
  const standen = useMemo(() => alleStanden.filter((s) => Number(s.aantal) !== 0), [alleStanden])

  const totalenPerArtikel = useMemo(() => {
    const map = {}
    for (const s of standen) {
      map[s.artikelId] = (map[s.artikelId] || 0) + (Number(s.aantal) || 0)
    }
    return map
  }, [standen])

  const standenPerArtikel = useMemo(() => {
    const map = {}
    for (const s of standen) {
      if (!map[s.artikelId]) map[s.artikelId] = []
      map[s.artikelId].push(s)
    }
    return map
  }, [standen])

  return { standen, totalenPerArtikel, standenPerArtikel, loading, error }
}

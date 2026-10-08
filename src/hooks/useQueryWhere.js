import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase'

// Realtime de documenten van een collectie waarvan `veld` gelijk is aan
// `waarde` (bijv. de regels van één verkooporder), zonder de hele collectie te
// laden. Zonder waarde: lege lijst.
export function useQueryWhere(collectionName, veld, waarde) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!waarde) {
      setData([])
      setLoading(false)
      return undefined
    }
    setLoading(true)
    return onSnapshot(
      query(collection(db, collectionName), where(veld, '==', waarde)),
      (snap) => {
        setData(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        setLoading(false)
        setError(null)
      },
      (err) => {
        setError(err.message)
        setLoading(false)
      }
    )
  }, [collectionName, veld, waarde])

  return { data, loading, error }
}

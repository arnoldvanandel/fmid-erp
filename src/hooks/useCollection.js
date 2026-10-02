import { useEffect, useState } from 'react'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from '../firebase'

// Realtime subscription op een Firestore-collectie. Geeft { data, loading, error } terug.
// data is een array van { id, ...velden }. Wijzigingen van andere gebruikers (of andere
// tabbladen) komen automatisch binnen zonder handmatig te hoeven verversen.
export function useCollection(collectionName, { orderByField, orderDirection = 'asc' } = {}) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    const ref = collection(db, collectionName)
    const q = orderByField ? query(ref, orderBy(orderByField, orderDirection)) : ref

    const unsub = onSnapshot(
      q,
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
    return unsub
  }, [collectionName, orderByField, orderDirection])

  return { data, loading, error }
}

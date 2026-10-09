import { useEffect, useState } from 'react'
import { collection, getCountFromServer, getDocs, limit, orderBy, query, where } from 'firebase/firestore'
import { db } from '../firebase'

// Met ~3.600 magazijnlocaties uit Axapta laden we nooit de hele collectie,
// maar zoeken we op het begin van de locatiecode (codes zijn hoofdletters,
// bijv. "1343-1", "F8-3", "BUF22").

export async function zoekLocaties(term, { max = 30 } = {}) {
  const t = String(term || '').trim().toUpperCase()
  const ref = collection(db, 'locaties')
  const q = t
    ? query(ref, where('code', '>=', t), where('code', '<=', `${t}`), orderBy('code'), limit(max))
    : query(ref, orderBy('code'), limit(max))
  return (await getDocs(q)).docs.map((d) => ({ id: d.id, ...d.data() }))
}

// Eén locatie op exacte code.
export async function haalLocatieOpCode(code) {
  const c = String(code || '').trim().toUpperCase()
  if (!c) return null
  const snap = await getDocs(query(collection(db, 'locaties'), where('code', '==', c), limit(1)))
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() }
}

export async function telLocaties() {
  return (await getCountFromServer(collection(db, 'locaties'))).data().count
}

// React-hook: zoekresultaten bij een zoekterm, met een korte vertraging
// zodat er niet bij elke toetsaanslag een query gaat.
export function useLocatieZoeken(term, { max = 30, ververs = 0 } = {}) {
  const [locaties, setLocaties] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let actief = true
    setLoading(true)
    const timer = setTimeout(() => {
      zoekLocaties(term, { max })
        .then((lijst) => {
          if (!actief) return
          setLocaties(lijst)
          setError(null)
        })
        .catch((err) => actief && setError(err.message))
        .finally(() => actief && setLoading(false))
    }, 200)
    return () => {
      actief = false
      clearTimeout(timer)
    }
  }, [term, max, ververs])

  return { locaties, loading, error }
}

import { useEffect, useState } from 'react'
import { collection, limit, onSnapshot, orderBy, query, Timestamp, where } from 'firebase/firestore'
import { db } from '../firebase'

// Herkomst van een voorraadmutatie (veld `bron`). Oudere mutaties zonder bron
// zijn handmatig geboekt, of door een pakbon (dan begint de reden met "Pakbon").
export const BRON_LABEL = {
  handmatig: 'Handmatig',
  opvoorraad: 'Op voorraad gezet',
  inkooporder: 'Inkooporder',
  pakbon: 'Pakbon',
  omboeking: 'Omboeking',
  import: 'Import Axapta',
}

export function bronVan(m) {
  if (m.bron) return m.bron
  return /^Pakbon /.test(m.reden || '') ? 'pakbon' : 'handmatig'
}

// Realtime de voorraadmutaties, nieuwste eerst, zonder de hele collectie te
// laden. Filtert in Firestore op artikel of locatie en op periode (van/tot als
// "2026-10-01"); soort en herkomst filteren we daarna hier.
// Indexen: voorraadmutaties (artikelId, datum desc) en (locatieId, datum desc),
// zie firestore.indexes.json.
export function useMutaties({ artikelId, locatieId, van, tot, type, bron, max = 200 } = {}) {
  const [mutaties, setMutaties] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    const delen = []
    if (artikelId) delen.push(where('artikelId', '==', artikelId))
    else if (locatieId) delen.push(where('locatieId', '==', locatieId))
    if (van) delen.push(where('datum', '>=', Timestamp.fromDate(new Date(`${van}T00:00:00`))))
    if (tot) delen.push(where('datum', '<', Timestamp.fromDate(new Date(new Date(`${tot}T00:00:00`).getTime() + 86400000))))
    // Bij extra filters hier meer ophalen, zodat er na het filteren genoeg overblijft.
    const extra = (artikelId && locatieId) || type || bron
    const q = query(collection(db, 'voorraadmutaties'), ...delen, orderBy('datum', 'desc'), limit(extra ? max * 5 : max))

    return onSnapshot(
      q,
      (snap) => {
        let lijst = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        if (artikelId && locatieId) lijst = lijst.filter((m) => m.locatieId === locatieId)
        if (type) lijst = lijst.filter((m) => m.type === type)
        if (bron) lijst = lijst.filter((m) => bronVan(m) === bron)
        setMutaties(lijst.slice(0, max))
        setLoading(false)
        setError(null)
      },
      (err) => {
        setError(err.message)
        setLoading(false)
      }
    )
  }, [artikelId, locatieId, van, tot, type, bron, max])

  return { mutaties, loading, error }
}

function periodeGrenzen(van, tot) {
  const delen = []
  if (van) delen.push(where('datum', '>=', Timestamp.fromDate(new Date(`${van}T00:00:00`))))
  if (tot) {
    delen.push(where('datum', '<', Timestamp.fromDate(new Date(new Date(`${tot}T00:00:00`).getTime() + 86400000))))
  }
  return delen
}

// Bijboeking op een locatie: de pagina "Op voorraad zetten", of een ontvangst
// van een inkooporder. Oudere op-voorraad-boekingen hebben nog geen bron en
// zijn te herkennen aan de reden.
export function isOpVoorraadGezet(m) {
  if (m?.bron === 'opvoorraad') return true
  if (m?.type !== 'in') return false
  if (m?.bron === 'inkooporder') return true
  const reden = m.reden || ''
  return reden === 'Op voorraad gezet' || /dozen ×/.test(reden) || /zakjes ×/.test(reden) || reden.startsWith('Ontvangst ')
}

// Die boekingen in een periode, oudste eerst. De periode beperkt de query;
// de herkomst filteren we hier, zodat er geen extra Firestore-index nodig is.
export function useOpVoorraadMutaties({ van, tot, max = 2000 } = {}) {
  const [mutaties, setMutaties] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [afgekapt, setAfgekapt] = useState(false)

  useEffect(() => {
    if (!van && !tot) {
      setMutaties([])
      setAfgekapt(false)
      setError(null)
      setLoading(false)
      return undefined
    }

    setLoading(true)
    setMutaties([])
    setAfgekapt(false)
    const q = query(
      collection(db, 'voorraadmutaties'),
      ...periodeGrenzen(van, tot),
      orderBy('datum', 'asc'),
      limit(max)
    )

    return onSnapshot(
      q,
      (snap) => {
        setMutaties(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter(isOpVoorraadGezet))
        setAfgekapt(snap.size >= max)
        setError(null)
        setLoading(false)
      },
      (err) => {
        setError(err.message)
        setLoading(false)
      }
    )
  }, [van, tot, max])

  return { mutaties, loading, error, afgekapt }
}

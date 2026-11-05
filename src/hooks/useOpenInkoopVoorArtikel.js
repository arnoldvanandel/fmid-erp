import { useEffect, useState } from 'react'
import { collection, doc, getDoc, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase'

// Openstaande inkoopregels van één artikel: nog te ontvangen, zonder
// geannuleerde orders. De lijst volgt de regels live; de orderkop wordt
// erbij gelezen om status en leverancier te kennen.
export function useOpenInkoopVoorArtikel(artikelId) {
  const [regels, setRegels] = useState([])
  const [loading, setLoading] = useState(Boolean(artikelId))
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!artikelId) {
      setRegels([])
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    let vervallen = false
    let verzoek = 0
    const q = query(collection(db, 'inkooporderregels'), where('artikelId', '==', artikelId))
    const unsub = onSnapshot(
      q,
      (snap) => {
        const huidig = ++verzoek
        const lijnen = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        const ids = [...new Set(lijnen.map((r) => r.inkooporderId).filter(Boolean))]
        Promise.all(
          ids.map(async (id) => {
            const s = await getDoc(doc(db, 'inkooporders', id))
            return s.exists() ? [id, { id: s.id, ...s.data() }] : null
          })
        )
          .then((paren) => {
            if (vervallen || huidig !== verzoek) return
            const orders = Object.fromEntries(paren.filter(Boolean))
            const open = lijnen
              .map((r) => {
                const order = orders[r.inkooporderId]
                if (!order || order.status === 'geannuleerd') return null
                const besteld = Number(r.aantal) || 0
                const ontvangen = Number(r.ontvangen) || 0
                const nog = Math.max(0, besteld - ontvangen)
                if (nog <= 1e-9) return null
                return {
                  id: r.id,
                  order,
                  ordernummer: order.ordernummer || '',
                  leverancierscode: order.leverancierscode || '',
                  leverancierNaam: order.leverancierNaam || '',
                  besteld,
                  ontvangen,
                  open: nog,
                  leverdatum: r.leverdatum || order.verwachteLeverdatum || '',
                  status: order.status || '',
                }
              })
              .filter(Boolean)
              .sort((a, b) => {
                if (!a.leverdatum !== !b.leverdatum) return a.leverdatum ? -1 : 1
                return (
                  String(a.leverdatum).localeCompare(String(b.leverdatum)) ||
                  String(a.ordernummer).localeCompare(String(b.ordernummer), 'nl', { numeric: true })
                )
              })
            setRegels(open)
            setLoading(false)
            setError(null)
          })
          .catch((err) => {
            if (vervallen || huidig !== verzoek) return
            setError(err.message)
            setLoading(false)
          })
      },
      (err) => {
        if (vervallen) return
        setError(err.message)
        setLoading(false)
      }
    )
    return () => {
      vervallen = true
      unsub()
    }
  }, [artikelId])

  const totaal = regels.reduce((som, r) => som + r.open, 0)
  return { regels, totaal, loading, error }
}

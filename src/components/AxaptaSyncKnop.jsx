import { useEffect, useState } from 'react'
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { formatDateTime } from '../lib/format'

// De Pi kijkt elke minuut of er een verzoek klaarstaat (koppeling/axapta_sync.py --verzoek).
const VASTGELOPEN_MS = 10 * 60 * 1000
const MELDING_MS = 10 * 60 * 1000

function tijd(waarde) {
  if (!waarde) return 0
  return waarde.toDate ? waarde.toDate().getTime() : new Date(waarde).getTime()
}

export default function AxaptaSyncKnop() {
  const { profile } = useAuth()
  const [status, setStatus] = useState(null)
  const [verzoek, setVerzoek] = useState(null)
  const [fout, setFout] = useState(null)
  const [, setNu] = useState(Date.now())

  useEffect(() => {
    const stop1 = onSnapshot(doc(db, 'axaptaSync', 'fmid'), (snap) => setStatus(snap.data() || null), () => {})
    const stop2 = onSnapshot(doc(db, 'axaptaSync', 'verzoek'), (snap) => setVerzoek(snap.data() || null), () => {})
    const klok = setInterval(() => setNu(Date.now()), 30000)
    return () => {
      stop1()
      stop2()
      clearInterval(klok)
    }
  }, [])

  const verzoekStatus = verzoek?.status
  const sindsAanvraag = Date.now() - tijd(verzoek?.aangevraagdOp)
  const loopt = (verzoekStatus === 'wachten' || verzoekStatus === 'bezig') && sindsAanvraag < VASTGELOPEN_MS
  const recentKlaar =
    (verzoekStatus === 'klaar' || verzoekStatus === 'fout') && Date.now() - tijd(verzoek?.afgehandeldOp) < MELDING_MS

  async function synchroniseer() {
    setFout(null)
    try {
      await setDoc(doc(db, 'axaptaSync', 'verzoek'), {
        status: 'wachten',
        aangevraagdOp: serverTimestamp(),
        aangevraagdDoor: profile?.naam || profile?.email || '',
        melding: '',
      })
    } catch (err) {
      setFout(err.message)
    }
  }

  let regel
  if (fout) regel = <span style={{ color: 'var(--color-danger)' }}>{fout}</span>
  else if (loopt && verzoekStatus === 'wachten') regel = 'Wacht op de koppeling (binnen een minuut)…'
  else if (loopt) regel = 'Axapta wordt gelezen…'
  else if (recentKlaar && verzoekStatus === 'fout')
    regel = <span style={{ color: 'var(--color-danger)' }}>Sync mislukt: {verzoek.melding}</span>
  else if (recentKlaar) regel = verzoek.melding || 'Sync klaar.'
  else regel = `Laatste sync met Axapta: ${status?.laatsteSync ? formatDateTime(status.laatsteSync) : 'onbekend'}`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={synchroniseer}
        disabled={loopt}
        title="Verkooporders en voorraad nu uit Axapta ophalen"
      >
        {loopt ? 'Synchroniseren…' : 'Synchroniseren'}
      </button>
      <span className="hint" style={{ maxWidth: 360, textAlign: 'right' }}>
        {regel}
      </span>
    </div>
  )
}

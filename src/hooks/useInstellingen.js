import { useEffect, useState } from 'react'
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../firebase'

// Instellingen voor de hele app (instellingen/algemeen). Nu alleen de testfase:
// zolang die aan staat, stuurt de Cloud Function verstuurMail elke mail alleen
// naar `testEmail` (zie functions/index.js).
export function useInstellingen() {
  const [instellingen, setInstellingen] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(
    () =>
      onSnapshot(
        doc(db, 'instellingen', 'algemeen'),
        (snap) => {
          setInstellingen(snap.data() || {})
          setLoading(false)
        },
        () => setLoading(false)
      ),
    []
  )

  const testEmail = String(instellingen.testEmail || '').trim()
  return { instellingen, loading, testfase: !!instellingen.testfase && !!testEmail, testEmail }
}

export async function wijzigInstellingen(updates, gebruiker) {
  await setDoc(
    doc(db, 'instellingen', 'algemeen'),
    { ...updates, gewijzigdDoor: gebruiker || '', gewijzigdOp: serverTimestamp() },
    { merge: true }
  )
}

import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

// Deze waarden komen uit je eigen Firebase-project (zie README.md).
// Ze staan in .env.local, dat NIET wordt meegecommit (zie .gitignore).
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const missing = Object.entries(firebaseConfig).filter(([, v]) => !v)
if (missing.length > 0) {
  // Duidelijke melding i.p.v. een cryptische Firebase-foutmelding.
  // eslint-disable-next-line no-console
  console.error(
    'Firebase-configuratie ontbreekt. Kopieer .env.example naar .env.local en vul de waarden in. ' +
      'Ontbrekend: ' +
      missing.map(([k]) => k).join(', ')
  )
}

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)

// Cloud Storage moet apart ingeschakeld worden in de Firebase Console (zie
// README.md) — als dat nog niet is gebeurd gooit getStorage() een synchrone
// fout die anders de hele app onderuit zou halen (ook inloggen/Firestore).
// Documentupload geeft in dat geval zelf een duidelijke melding, zie
// lib/documenten.js.
export let storage = null
try {
  storage = getStorage(app)
} catch (e) {
  // eslint-disable-next-line no-console
  console.error('Cloud Storage is niet beschikbaar (nog niet ingeschakeld?):', e.message)
}

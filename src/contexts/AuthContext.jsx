import { createContext, useContext, useEffect, useState } from 'react'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../firebase'

const AuthContext = createContext(null)

// Elke ingelogde gebruiker krijgt bij de eerste keer inloggen automatisch een
// profiel-document in users/{uid} met rol "invoer". Een admin kan iemand later
// promoveren naar "admin" (zie Gebruikersbeheer).
async function ensureUserProfile(user) {
  const ref = doc(db, 'users', user.uid)
  const snap = await getDoc(ref)
  if (!snap.exists()) {
    const profile = {
      email: user.email,
      naam: user.email.split('@')[0],
      role: 'invoer',
      createdAt: serverTimestamp(),
    }
    await setDoc(ref, profile)
    return { uid: user.uid, ...profile }
  }
  return { uid: user.uid, ...snap.data() }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setError(null)
      if (!firebaseUser) {
        setUser(null)
        setProfile(null)
        setLoading(false)
        return
      }
      setUser(firebaseUser)
      try {
        const p = await ensureUserProfile(firebaseUser)
        setProfile(p)
      } catch (e) {
        setError(
          'Ingelogd, maar het gebruikersprofiel kon niet geladen worden. ' +
            'Controleer of Firestore is ingesteld en de rules zijn gedeployed. (' +
            e.message +
            ')'
        )
      }
      setLoading(false)
    })
    return unsub
  }, [])

  async function login(email, password) {
    setError(null)
    try {
      await signInWithEmailAndPassword(auth, email, password)
      return true
    } catch (e) {
      setError(mapAuthError(e.code))
      return false
    }
  }

  async function logout() {
    await signOut(auth)
  }

  const value = {
    user,
    profile,
    loading,
    error,
    isAdmin: profile?.role === 'admin',
    login,
    logout,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth moet binnen <AuthProvider> gebruikt worden')
  return ctx
}

function mapAuthError(code) {
  switch (code) {
    case 'auth/invalid-email':
      return 'Ongeldig e-mailadres.'
    case 'auth/user-disabled':
      return 'Dit account is uitgeschakeld.'
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'E-mailadres of wachtwoord is onjuist.'
    case 'auth/too-many-requests':
      return 'Te veel pogingen. Probeer het straks opnieuw.'
    default:
      return 'Inloggen is niet gelukt. Probeer het opnieuw.'
  }
}

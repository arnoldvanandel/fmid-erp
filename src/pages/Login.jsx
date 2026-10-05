import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

export default function Login() {
  const { login, error } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [localError, setLocalError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setLocalError(null)
    if (!email || !password) {
      setLocalError('Vul e-mailadres en wachtwoord in.')
      return
    }
    setSubmitting(true)
    await login(email.trim(), password)
    setSubmitting(false)
  }

  return (
    <div className="center-screen">
      <div className="card login-card">
        <div className="login-brand">
          <img src="/fmid-logo.png" alt="FMID" className="login-logo" />
          <h1>ERP</h1>
          <div className="page-header-sub">Log in met je bedrijfsaccount</div>
        </div>

        {(localError || error) && (
          <div className="banner banner-danger">{localError || error}</div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="email">E-mailadres</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="naam@bedrijf.nl"
            />
          </div>
          <div className="field">
            <label htmlFor="password">Wachtwoord</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={submitting} style={{ width: '100%' }}>
            {submitting ? 'Bezig met inloggen…' : 'Inloggen'}
          </button>
        </form>

        <p className="hint" style={{ marginTop: 16, textAlign: 'center' }}>
          Nog geen account? Vraag een beheerder om er een voor je aan te maken.
        </p>
      </div>
    </div>
  )
}

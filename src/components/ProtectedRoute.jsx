import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function ProtectedRoute({ children, adminOnly = false }) {
  const { user, profile, loading, isActive, logout } = useAuth()

  if (loading) {
    return (
      <div className="center-screen">
        <div className="spinner" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  // Nieuw account dat nog niet door een admin is goedgekeurd: de rules laten
  // dan toch geen data door, dus toon meteen een duidelijke melding.
  if (profile && !isActive) {
    return (
      <div className="center-screen">
        <div className="card card-pad login-card" style={{ maxWidth: 420, textAlign: 'center' }}>
          <img src="/fmid-logo.png" alt="FMID" className="login-logo" style={{ marginBottom: 18 }} />
          <h2>Wacht op goedkeuring</h2>
          <p className="page-header-sub">
            Je account ({profile.email}) is aangemaakt, maar moet nog door een beheerder worden
            goedgekeurd. Probeer het later opnieuw.
          </p>
          <button className="btn btn-secondary" onClick={logout}>
            Uitloggen
          </button>
        </div>
      </div>
    )
  }

  if (adminOnly && profile?.role !== 'admin') {
    return (
      <div className="center-screen">
        <div className="card card-pad" style={{ maxWidth: 420, textAlign: 'center' }}>
          <h2>Geen toegang</h2>
          <p className="page-header-sub">
            Dit onderdeel is alleen beschikbaar voor beheerders.
          </p>
        </div>
      </div>
    )
  }

  return children
}

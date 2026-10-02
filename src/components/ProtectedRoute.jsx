import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function ProtectedRoute({ children, adminOnly = false }) {
  const { user, profile, loading } = useAuth()

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

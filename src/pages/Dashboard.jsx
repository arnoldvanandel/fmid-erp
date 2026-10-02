import { Link } from 'react-router-dom'
import { useCollection } from '../hooks/useCollection'
import { useVoorraadTotals } from '../hooks/useVoorraadTotals'
import { useAuth } from '../contexts/AuthContext'

export default function Dashboard() {
  const { profile } = useAuth()
  const { data: artikelen, loading } = useCollection('artikelen')
  const { totalenPerArtikel } = useVoorraadTotals()

  const laagAantal = artikelen.filter(
    (a) => (totalenPerArtikel[a.id] || 0) <= Number(a.minVoorraad || 0)
  ).length

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1>Welkom, {profile?.naam || profile?.email}</h1>
          <div className="page-header-sub">Overzicht van artikelen en voorraad</div>
        </div>
      </div>

      <div className="stat-row">
        <div className="card stat-card">
          <div className="label">Aantal artikelen</div>
          <div className="value">{loading ? '…' : artikelen.length}</div>
        </div>
        <div className="card stat-card">
          <div className="label">Laag in voorraad</div>
          <div className="value" style={{ color: laagAantal > 0 ? 'var(--color-warning)' : undefined }}>
            {loading ? '…' : laagAantal}
          </div>
        </div>
      </div>

      <div className="card card-pad">
        <h2>Snel starten</h2>
        <p className="page-header-sub" style={{ marginBottom: 16 }}>
          Dit is een eerste versie: artikelbeheer en voorraadmutaties. Meer onderdelen (klanten,
          verkoop- en inkooporders) volgen later.
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link className="btn btn-primary" to="/artikelen">
            Naar artikelen
          </Link>
          <Link className="btn btn-secondary" to="/voorraad">
            Naar voorraad
          </Link>
        </div>
      </div>
    </div>
  )
}

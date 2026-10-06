import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useVoorraadArtikelen } from '../hooks/useVoorraadArtikelen'
import { useAuth } from '../contexts/AuthContext'
import { formatNumber } from '../lib/format'
import { telArtikelen } from '../lib/artikelZoeken'

export default function Dashboard() {
  const { profile } = useAuth()
  const [aantalArtikelen, setAantalArtikelen] = useState(null)
  const { laag, loading } = useVoorraadArtikelen()
  const laagAantal = laag.length

  useEffect(() => {
    telArtikelen()
      .then(setAantalArtikelen)
      .catch(() => setAantalArtikelen(null))
  }, [])

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
          <div className="value">{aantalArtikelen === null ? '…' : formatNumber(aantalArtikelen)}</div>
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

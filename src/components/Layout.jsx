import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth, ROL_LABELS } from '../contexts/AuthContext'
import { useInstellingen } from '../hooks/useInstellingen'

const navItems = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/artikelen', label: 'Artikelen' },
  { to: '/klanten', label: 'Klanten' },
  { to: '/verkooporders', label: 'Verkooporders', end: true },
  { to: '/verkooporders/openstaand', label: 'Openstaande orders' },
  { to: '/picklijsten', label: 'Picklijsten' },
  { to: '/facturen', label: 'Facturen' },
  { to: '/leveranciers', label: 'Leveranciers' },
  { to: '/inkooporders', label: 'Inkooporders', end: true },
  { to: '/inkooporders/openstaand', label: 'Openstaande inkoop' },
  { to: '/inkoopsjablonen', label: 'Inkoopsjablonen' },
  { to: '/voorraad', label: 'Voorraad', end: true },
  { to: '/voorraad/mutaties', label: 'Voorraadmutaties' },
  { to: '/voorraad/op-voorraad/rapport', label: 'Op voorraad gezet' },
  { to: '/productieorders', label: 'Productieorders' },
  { to: '/locaties', label: 'Locaties' },
  { to: '/looproute', label: 'Looproute' },
]

const adminNavItems = [{ to: '/gebruikers', label: 'Gebruikers' }]

export default function Layout({ children }) {
  const { profile, logout, isAdmin } = useAuth()
  const { testfase, testEmail } = useInstellingen()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-logo">
            <img src="/fmid-logo.png" alt="FMID" />
          </div>
          <small>ERP · Machinefabriek Van Andel</small>
        </div>
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => 'sidebar-link' + (isActive ? ' active' : '')}
            >
              {item.label}
            </NavLink>
          ))}
          {isAdmin &&
            adminNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => 'sidebar-link' + (isActive ? ' active' : '')}
              >
                {item.label}
              </NavLink>
            ))}
        </nav>
        <div className="sidebar-footer">
          {testfase && (
            <div className="sidebar-testfase" title="Mail gaat alleen naar het testadres, behalve inkooporders en stickerbestellingen">
              Testfase · mail alleen naar {testEmail}
            </div>
          )}
          <div className="sidebar-user">
            <strong>{profile?.naam || profile?.email}</strong>
            {ROL_LABELS[profile?.role] || 'Invoer'}
          </div>
          <button className="btn btn-secondary btn-sm sidebar-logout" onClick={handleLogout}>
            Uitloggen
          </button>
          <div className="sidebar-versie">Versie {__APP_VERSIE__}</div>
        </div>
      </aside>
      <div className="main">{children}</div>
    </div>
  )
}

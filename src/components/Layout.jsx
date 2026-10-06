import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth, ROL_LABELS } from '../contexts/AuthContext'

const navItems = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/artikelen', label: 'Artikelen' },
  { to: '/klanten', label: 'Klanten' },
  { to: '/leveranciers', label: 'Leveranciers' },
  { to: '/inkooporders', label: 'Inkooporders' },
  { to: '/voorraad', label: 'Voorraad' },
  { to: '/productieorders', label: 'Productieorders' },
  { to: '/locaties', label: 'Locaties' },
]

const adminNavItems = [{ to: '/gebruikers', label: 'Gebruikers' }]

export default function Layout({ children }) {
  const { profile, logout, isAdmin } = useAuth()
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
          <div className="sidebar-user">
            <strong>{profile?.naam || profile?.email}</strong>
            {ROL_LABELS[profile?.role] || 'Invoer'}
          </div>
          <button className="btn btn-secondary btn-sm" style={{ width: '100%' }} onClick={handleLogout}>
            Uitloggen
          </button>
        </div>
      </aside>
      <div className="main">{children}</div>
    </div>
  )
}

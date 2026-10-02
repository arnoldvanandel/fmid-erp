import { doc, updateDoc } from 'firebase/firestore'
import { useCollection } from '../../hooks/useCollection'
import { db } from '../../firebase'
import { useAuth, ROL_LABELS } from '../../contexts/AuthContext'
import { formatDate } from '../../lib/format'

const ROL_BADGES = {
  wachtend: 'badge-warning',
  invoer: 'badge-neutral',
  admin: 'badge-success',
}

export default function Gebruikersbeheer() {
  const { data: users, loading } = useCollection('users', { orderByField: 'email' })
  const { user: currentUser } = useAuth()

  // Wachtende gebruikers bovenaan, zodat een admin ze meteen ziet.
  const gesorteerd = [...users].sort(
    (a, b) => (a.role === 'wachtend' ? 0 : 1) - (b.role === 'wachtend' ? 0 : 1)
  )
  const aantalWachtend = users.filter((u) => u.role === 'wachtend').length

  async function wijzigRol(u, nieuweRol) {
    if (nieuweRol === u.role) return
    if (
      u.id === currentUser.uid &&
      nieuweRol !== 'admin' &&
      !confirm('Weet je zeker dat je jezelf de beheerdersrol wilt afnemen?')
    ) {
      return
    }
    await updateDoc(doc(db, 'users', u.id), { role: nieuweRol })
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1>Gebruikers</h1>
          <div className="page-header-sub">Beheer wie toegang heeft en wie beheerder is</div>
        </div>
      </div>

      <div className="banner banner-info">
        Nieuwe collega's toevoegen doe je in de Firebase Console onder Authentication → Add user. Zodra
        iemand voor het eerst inlogt, verschijnt diegene hier als "Wacht op goedkeuring" en heeft nog
        geen toegang. Geef de rol "Invoer" of "Beheerder" om toegang te verlenen.
      </div>

      {aantalWachtend > 0 && (
        <div className="banner banner-warning">
          {aantalWachtend === 1
            ? '1 gebruiker wacht op goedkeuring.'
            : `${aantalWachtend} gebruikers wachten op goedkeuring.`}{' '}
          Ken je iemand niet? Verwijder het account dan in de Firebase Console.
        </div>
      )}

      <div className="card">
        {loading ? (
          <div className="empty-state"><div className="spinner" style={{ margin: '0 auto' }} /></div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Naam</th>
                  <th>E-mail</th>
                  <th>Rol</th>
                  <th>Sinds</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {gesorteerd.map((u) => (
                  <tr key={u.id} style={{ cursor: 'default' }}>
                    <td>{u.naam || '-'}</td>
                    <td>{u.email}</td>
                    <td>
                      <span className={'badge ' + (ROL_BADGES[u.role] || 'badge-neutral')}>
                        {ROL_LABELS[u.role] || u.role}
                      </span>
                    </td>
                    <td>{formatDate(u.createdAt)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <select
                        value={u.role}
                        onChange={(e) => wijzigRol(u, e.target.value)}
                        aria-label={`Rol van ${u.email}`}
                        style={{ width: 'auto' }}
                      >
                        {Object.entries(ROL_LABELS).map(([rol, label]) => (
                          <option key={rol} value={rol}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

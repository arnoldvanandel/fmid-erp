import { doc, updateDoc } from 'firebase/firestore'
import { useCollection } from '../../hooks/useCollection'
import { db } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import { formatDate } from '../../lib/format'

export default function Gebruikersbeheer() {
  const { data: users, loading } = useCollection('users', { orderByField: 'email' })
  const { user: currentUser } = useAuth()

  async function toggleRole(u) {
    const nieuweRol = u.role === 'admin' ? 'invoer' : 'admin'
    if (
      u.id === currentUser.uid &&
      nieuweRol === 'invoer' &&
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
        iemand voor het eerst inlogt, verschijnt diegene hier automatisch als "Invoer".
      </div>

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
                {users.map((u) => (
                  <tr key={u.id} style={{ cursor: 'default' }}>
                    <td>{u.naam || '-'}</td>
                    <td>{u.email}</td>
                    <td>
                      <span className={'badge ' + (u.role === 'admin' ? 'badge-success' : 'badge-neutral')}>
                        {u.role === 'admin' ? 'Beheerder' : 'Invoer'}
                      </span>
                    </td>
                    <td>{formatDate(u.createdAt)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => toggleRole(u)}>
                        Maak {u.role === 'admin' ? 'invoer' : 'beheerder'}
                      </button>
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

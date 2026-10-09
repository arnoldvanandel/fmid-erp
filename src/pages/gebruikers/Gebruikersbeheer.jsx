import { useEffect, useState } from 'react'
import { doc, updateDoc } from 'firebase/firestore'
import { useInstellingen, wijzigInstellingen } from '../../hooks/useInstellingen'
import { useCollection } from '../../hooks/useCollection'
import { db } from '../../firebase'
import { useAuth, ROL_LABELS } from '../../contexts/AuthContext'
import { formatDate } from '../../lib/format'

const ROL_BADGES = {
  wachtend: 'badge-warning',
  invoer: 'badge-neutral',
  admin: 'badge-success',
}

// Testfase: zolang aan, gaat alle mail (inkooporders, bevestigingen, pakbonnen,
// facturen) alleen naar het testadres. Wordt afgedwongen in de Cloud Function.
function TestfaseInstelling() {
  const { profile } = useAuth()
  const { instellingen, loading, testfase } = useInstellingen()
  const [adres, setAdres] = useState('')
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState(null)

  useEffect(() => {
    if (!loading) setAdres(instellingen.testEmail || profile?.email || '')
  }, [loading, instellingen.testEmail, profile?.email])

  async function zet(aan) {
    setFout(null)
    if (aan && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adres.trim())) {
      setFout('Vul een geldig testadres in.')
      return
    }
    if (!aan && !confirm('Testfase uitzetten? Vanaf nu gaan mails weer echt naar klanten en leveranciers.')) return
    setBezig(true)
    try {
      await wijzigInstellingen({ testfase: aan, testEmail: adres.trim() }, profile?.naam || profile?.email)
    } catch (err) {
      setFout(err.message)
    } finally {
      setBezig(false)
    }
  }

  return (
    <div className="card card-pad" style={{ marginBottom: 20 }}>
      <h2 style={{ marginTop: 0 }}>Testfase</h2>
      {fout && <div className="banner banner-danger">{fout}</div>}
      <div className={'banner ' + (testfase ? 'banner-warning' : 'banner-info')}>
        {testfase
          ? `De testfase staat aan: alle mail gaat alleen naar ${instellingen.testEmail}, met [TEST] in het onderwerp.`
          : 'De testfase staat uit: mail gaat naar de echte ontvangers (klanten en leveranciers).'}
      </div>
      <div className="field-row" style={{ alignItems: 'flex-end' }}>
        <div className="field" style={{ maxWidth: 320 }}>
          <label>Testadres</label>
          <input type="email" value={adres} onChange={(e) => setAdres(e.target.value)} disabled={bezig} />
        </div>
        <div className="field" style={{ flex: 0, whiteSpace: 'nowrap' }}>
          {testfase ? (
            <div style={{ display: 'flex', gap: 8 }}>
              {adres.trim() !== instellingen.testEmail && (
                <button type="button" className="btn btn-secondary" onClick={() => zet(true)} disabled={bezig}>
                  Adres opslaan
                </button>
              )}
              <button type="button" className="btn btn-secondary" onClick={() => zet(false)} disabled={bezig}>
                Testfase uitzetten
              </button>
            </div>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => zet(true)} disabled={bezig}>
              Testfase aanzetten
            </button>
          )}
        </div>
      </div>
    </div>
  )
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

      <TestfaseInstelling />

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

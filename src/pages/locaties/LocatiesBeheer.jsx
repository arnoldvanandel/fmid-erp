import { useState } from 'react'
import { addDoc, collection, deleteDoc, doc, updateDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { useCollection } from '../../hooks/useCollection'
import Modal from '../../components/Modal'

function LocatieForm({ locatie, onDone }) {
  const isNew = !locatie?.id
  const [code, setCode] = useState(locatie?.code || '')
  const [naam, setNaam] = useState(locatie?.naam || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!code.trim()) {
      setError('Code is verplicht (bijv. "HFD" of "MAG1").')
      return
    }
    setError(null)
    setSaving(true)
    try {
      const payload = { code: code.trim().toUpperCase(), naam: naam.trim() }
      if (isNew) {
        await addDoc(collection(db, 'locaties'), payload)
      } else {
        await updateDoc(doc(db, 'locaties', locatie.id), payload)
      }
      onDone?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm(`Locatie ${locatie.code} verwijderen? Bestaande voorraadstanden op deze locatie blijven staan.`)) {
      return
    }
    setSaving(true)
    try {
      await deleteDoc(doc(db, 'locaties', locatie.id))
      onDone?.()
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <div className="banner banner-danger">{error}</div>}
      <div className="field">
        <label>Code</label>
        <input type="text" value={code} onChange={(e) => setCode(e.target.value)} placeholder="bijv. HFD" />
      </div>
      <div className="field">
        <label>Naam</label>
        <input type="text" value={naam} onChange={(e) => setNaam(e.target.value)} placeholder="bijv. Hoofdmagazijn" />
      </div>
      <div className="modal-actions" style={{ justifyContent: !isNew ? 'space-between' : 'flex-end' }}>
        {!isNew && (
          <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={saving}>
            Verwijderen
          </button>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-secondary" onClick={onDone} disabled={saving}>
            Annuleren
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Opslaan…' : isNew ? 'Toevoegen' : 'Opslaan'}
          </button>
        </div>
      </div>
    </form>
  )
}

export default function LocatiesBeheer() {
  const { data: locaties, loading } = useCollection('locaties', { orderByField: 'code' })
  const [editing, setEditing] = useState(null)
  const [showNieuw, setShowNieuw] = useState(false)

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1>Locaties</h1>
          <div className="page-header-sub">Magazijnen / locaties waarop voorraad wordt bijgehouden</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNieuw(true)}>
          + Nieuwe locatie
        </button>
      </div>

      <div className="card">
        {loading ? (
          <div className="empty-state"><div className="spinner" style={{ margin: '0 auto' }} /></div>
        ) : locaties.length === 0 ? (
          <div className="empty-state">
            Nog geen locaties. Voeg er minstens één toe (bijv. "HFD" — Hoofdmagazijn) voordat je
            voorraadmutaties kunt boeken.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Naam</th>
              </tr>
            </thead>
            <tbody>
              {locaties.map((l) => (
                <tr key={l.id} onClick={() => setEditing(l)}>
                  <td>{l.code}</td>
                  <td>{l.naam}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showNieuw && (
        <Modal title="Nieuwe locatie" onClose={() => setShowNieuw(false)}>
          <LocatieForm onDone={() => setShowNieuw(false)} />
        </Modal>
      )}
      {editing && (
        <Modal title={`Locatie ${editing.code}`} onClose={() => setEditing(null)}>
          <LocatieForm locatie={editing} onDone={() => setEditing(null)} />
        </Modal>
      )}
    </div>
  )
}

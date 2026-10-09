import { useEffect, useState } from 'react'
import { addDoc, collection, deleteDoc, doc, updateDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { formatNumber } from '../../lib/format'
import { haalLocatieOpCode, telLocaties, useLocatieZoeken } from '../../lib/locatieZoeken'
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
      const bestaand = await haalLocatieOpCode(payload.code)
      if (bestaand && bestaand.id !== locatie?.id) {
        setError(`Locatie ${payload.code} bestaat al.`)
        setSaving(false)
        return
      }
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
  const [zoek, setZoek] = useState('')
  const [ververs, setVervers] = useState(0)
  const { locaties, loading, error } = useLocatieZoeken(zoek, { max: 100, ververs })
  const [aantal, setAantal] = useState(null)
  const [editing, setEditing] = useState(null)
  const [showNieuw, setShowNieuw] = useState(false)

  useEffect(() => {
    telLocaties()
      .then(setAantal)
      .catch(() => setAantal(null))
  }, [ververs])

  function klaar() {
    setEditing(null)
    setShowNieuw(false)
    setVervers((v) => v + 1)
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1>Locaties</h1>
          <div className="page-header-sub">
            {aantal != null ? `${formatNumber(aantal)} locaties · ` : ''}magazijnlocaties waarop voorraad wordt
            bijgehouden
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNieuw(true)}>
          + Nieuwe locatie
        </button>
      </div>

      <div className="card">
        <div className="card-pad" style={{ paddingBottom: 0 }}>
          <div className="data-table-toolbar">
            <input
              className="search-input"
              type="text"
              placeholder="Zoek op (begin van) locatiecode, bijv. 13 of BUF…"
              value={zoek}
              onChange={(e) => setZoek(e.target.value)}
            />
          </div>
        </div>
        {error && <div className="banner banner-danger" style={{ margin: '0 20px 16px' }}>{error}</div>}
        {loading && locaties.length === 0 ? (
          <div className="empty-state">
            <div className="spinner" style={{ margin: '0 auto' }} />
          </div>
        ) : locaties.length === 0 ? (
          <div className="empty-state">
            {zoek.trim()
              ? 'Geen locaties gevonden.'
              : 'Nog geen locaties. Voeg er minstens één toe voordat je voorraadmutaties kunt boeken.'}
          </div>
        ) : (
          <>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Naam</th>
                  <th>Type</th>
                  <th>Magazijn</th>
                </tr>
              </thead>
              <tbody>
                {locaties.map((l) => (
                  <tr key={l.id} onClick={() => setEditing(l)}>
                    <td>{l.code}</td>
                    <td>{l.naam || '-'}</td>
                    <td>{l.type || '-'}</td>
                    <td>{l.magazijn || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {locaties.length === 100 && (
              <p className="hint" style={{ padding: '8px 20px 16px' }}>
                De eerste 100 locaties worden getoond. Typ (het begin van) een code om verder te zoeken.
              </p>
            )}
          </>
        )}
      </div>

      {showNieuw && (
        <Modal title="Nieuwe locatie" onClose={() => setShowNieuw(false)}>
          <LocatieForm onDone={klaar} />
        </Modal>
      )}
      {editing && (
        <Modal title={`Locatie ${editing.code}`} onClose={() => setEditing(null)}>
          <LocatieForm locatie={editing} onDone={klaar} />
        </Modal>
      )}
    </div>
  )
}

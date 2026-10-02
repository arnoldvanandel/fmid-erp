import { useState } from 'react'
import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'

export default function LeverancierForm({ leverancier, onDone }) {
  const { isAdmin } = useAuth()
  const isNew = !leverancier?.id
  const [form, setForm] = useState({
    leverancierscode: leverancier?.leverancierscode || '',
    naam: leverancier?.naam || '',
    contactpersoon: leverancier?.contactpersoon || '',
    email: leverancier?.email || '',
    telefoon: leverancier?.telefoon || '',
    straat: leverancier?.straat || '',
    postcode: leverancier?.postcode || '',
    plaats: leverancier?.plaats || '',
    land: leverancier?.land || 'Nederland',
    btwNummer: leverancier?.btwNummer || '',
    kvkNummer: leverancier?.kvkNummer || '',
    betalingstermijn: leverancier?.betalingstermijn ?? 30,
    geblokkeerd: leverancier?.geblokkeerd || false,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (!form.leverancierscode.trim() || !form.naam.trim()) {
      setError('Leverancierscode en naam zijn verplicht.')
      return
    }

    const payload = {
      leverancierscode: form.leverancierscode.trim(),
      naam: form.naam.trim(),
      contactpersoon: form.contactpersoon.trim(),
      email: form.email.trim(),
      telefoon: form.telefoon.trim(),
      straat: form.straat.trim(),
      postcode: form.postcode.trim(),
      plaats: form.plaats.trim(),
      land: form.land.trim(),
      btwNummer: form.btwNummer.trim(),
      kvkNummer: form.kvkNummer.trim(),
      betalingstermijn: Number(form.betalingstermijn) || 0,
      geblokkeerd: !!form.geblokkeerd,
    }

    setSaving(true)
    try {
      if (isNew) {
        payload.createdAt = serverTimestamp()
        await addDoc(collection(db, 'leveranciers'), payload)
      } else {
        await updateDoc(doc(db, 'leveranciers', leverancier.id), payload)
      }
      onDone?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm(`Leverancier ${leverancier.leverancierscode} verwijderen?`)) return
    setSaving(true)
    try {
      await deleteDoc(doc(db, 'leveranciers', leverancier.id))
      onDone?.()
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <div className="banner banner-danger">{error}</div>}

      <div className="field-row">
        <div className="field">
          <label>Leverancierscode</label>
          <input
            type="text"
            value={form.leverancierscode}
            onChange={(e) => set('leverancierscode', e.target.value)}
            placeholder="bijv. LEV001"
          />
        </div>
        <div className="field" style={{ justifyContent: 'flex-end' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 0 }}>
            <input
              type="checkbox"
              checked={form.geblokkeerd}
              onChange={(e) => set('geblokkeerd', e.target.checked)}
            />
            Geblokkeerd
          </label>
          <span className="hint">Niet meer inkopen bij deze leverancier</span>
        </div>
      </div>

      <div className="field">
        <label>Naam</label>
        <input type="text" value={form.naam} onChange={(e) => set('naam', e.target.value)} />
      </div>

      <div className="field-row">
        <div className="field">
          <label>Contactpersoon</label>
          <input
            type="text"
            value={form.contactpersoon}
            onChange={(e) => set('contactpersoon', e.target.value)}
          />
        </div>
        <div className="field">
          <label>Telefoon</label>
          <input type="text" value={form.telefoon} onChange={(e) => set('telefoon', e.target.value)} />
        </div>
      </div>

      <div className="field">
        <label>E-mail</label>
        <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
      </div>

      <div className="field">
        <label>Straat + huisnummer</label>
        <input type="text" value={form.straat} onChange={(e) => set('straat', e.target.value)} />
      </div>

      <div className="field-row">
        <div className="field">
          <label>Postcode</label>
          <input type="text" value={form.postcode} onChange={(e) => set('postcode', e.target.value)} />
        </div>
        <div className="field">
          <label>Plaats</label>
          <input type="text" value={form.plaats} onChange={(e) => set('plaats', e.target.value)} />
        </div>
        <div className="field">
          <label>Land</label>
          <input type="text" value={form.land} onChange={(e) => set('land', e.target.value)} />
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label>BTW-nummer</label>
          <input type="text" value={form.btwNummer} onChange={(e) => set('btwNummer', e.target.value)} />
        </div>
        <div className="field">
          <label>KvK-nummer</label>
          <input type="text" value={form.kvkNummer} onChange={(e) => set('kvkNummer', e.target.value)} />
        </div>
        <div className="field">
          <label>Betalingstermijn (dagen)</label>
          <input
            type="number"
            min="0"
            step="1"
            value={form.betalingstermijn}
            onChange={(e) => set('betalingstermijn', e.target.value)}
          />
        </div>
      </div>

      <div className="modal-actions" style={{ justifyContent: !isNew && isAdmin ? 'space-between' : 'flex-end' }}>
        {!isNew && isAdmin && (
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

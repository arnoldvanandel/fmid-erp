import { useState } from 'react'
import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import { MAIL_TALEN } from '../../lib/inkooporderMail'

// BTW-groepen voor leveranciers, overgenomen uit Axapta.
const BTW_GROEPEN = {
  NL: 'BTW NL',
  DE: 'Duitse BTW (16%)',
  'EU-IC': 'BTW EU BTW nr. bekend',
  'EU-belast': 'BTW EU BTW nr. onbekend',
  'Non-EU': 'BTW buiten EU',
}

const VALUTA = ['EUR', 'USD', 'GBP', 'CHF']

export default function LeverancierForm({ leverancier, onDone }) {
  const { isAdmin } = useAuth()
  const isNew = !leverancier?.id
  const [form, setForm] = useState({
    leverancierscode: leverancier?.leverancierscode || '',
    naam: leverancier?.naam || '',
    contactpersoon: leverancier?.contactpersoon || '',
    email: leverancier?.email || '',
    inkooporderEmails: (leverancier?.inkooporderEmails || []).join(', '),
    taal: leverancier?.taal || 'nl',
    telefoon: leverancier?.telefoon || '',
    straat: leverancier?.straat || '',
    postcode: leverancier?.postcode || '',
    plaats: leverancier?.plaats || '',
    land: leverancier?.land || 'Nederland',
    btwNummer: leverancier?.btwNummer || '',
    btwGroep: leverancier?.btwGroep || 'NL',
    valuta: leverancier?.valuta || 'EUR',
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
    if (form.btwGroep === 'EU-IC' && !form.btwNummer.trim()) {
      setError('Bij BTW-groep EU-IC (BTW nr. bekend) is het BTW-nummer verplicht.')
      return
    }

    const payload = {
      leverancierscode: form.leverancierscode.trim(),
      naam: form.naam.trim(),
      contactpersoon: form.contactpersoon.trim(),
      email: form.email.trim(),
      inkooporderEmails: form.inkooporderEmails
        .split(/[,;\s]+/)
        .map((e) => e.trim())
        .filter(Boolean),
      taal: form.taal,
      telefoon: form.telefoon.trim(),
      straat: form.straat.trim(),
      postcode: form.postcode.trim(),
      plaats: form.plaats.trim(),
      land: form.land.trim(),
      btwNummer: form.btwNummer.trim(),
      btwGroep: form.btwGroep,
      valuta: form.valuta,
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

      <div className="field-row">
        <div className="field" style={{ flex: 2 }}>
          <label>E-mailadressen voor inkooporders</label>
          <input
            type="text"
            value={form.inkooporderEmails}
            onChange={(e) => set('inkooporderEmails', e.target.value)}
            placeholder="inkoop@leverancier.nl, verkoop@leverancier.nl"
          />
          <span className="hint">
            Meerdere adressen scheiden met een komma. Leeg = het algemene e-mailadres hierboven.
          </span>
        </div>
        <div className="field">
          <label>Taal van de mail</label>
          <select value={form.taal} onChange={(e) => set('taal', e.target.value)}>
            {Object.entries(MAIL_TALEN).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
          <span className="hint">Onderwerp, aanhef en tekst van de inkooporder-mail</span>
        </div>
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
          <label>BTW-groep</label>
          <select value={form.btwGroep} onChange={(e) => set('btwGroep', e.target.value)}>
            {Object.entries(BTW_GROEPEN).map(([code, omschrijving]) => (
              <option key={code} value={code}>
                {code} — {omschrijving}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>BTW-nummer</label>
          <input
            type="text"
            value={form.btwNummer}
            onChange={(e) => set('btwNummer', e.target.value)}
            placeholder={form.btwGroep === 'EU-IC' ? 'Verplicht bij EU-IC' : ''}
          />
        </div>
        <div className="field">
          <label>Valuta</label>
          <select value={form.valuta} onChange={(e) => set('valuta', e.target.value)}>
            {VALUTA.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field-row">
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

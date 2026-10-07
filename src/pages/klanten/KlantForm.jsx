import { useState } from 'react'
import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import { MAIL_TALEN } from '../../lib/inkooporderMail'
import { ADRES_TYPES, BTW_GROEPEN, KLANTGROEPEN, LEVERINGSVOORWAARDEN, VALUTA } from '../../lib/stamgegevens'

// Tabbladen zoals bij de klant in Axapta; zelfde opzet als LeverancierForm.
const TABS = [
  { id: 'algemeen', label: 'Algemeen' },
  { id: 'adres', label: 'Adres' },
  { id: 'adressen', label: 'Alternatieve adressen' },
  { id: 'contact', label: 'Contactgegevens' },
  { id: 'levering', label: 'Levering' },
  { id: 'betaling', label: 'Betaling' },
]

const LEEG_ADRES = {
  type: 'levering',
  naam: '',
  straat: '',
  postcode: '',
  plaats: '',
  land: '',
  telefoon: '',
  email: '',
  adresControleren: false,
}

// Velden van het gekozen alternatieve adres (tabblad Alternatieve adressen).
function AdresVelden({ adres: a, onChange }) {
  return (
    <div className="adres-blok">
      {a.adresControleren && (
        <div className="banner banner-warning">
          <div>
            Dit adres kon bij de import uit Axapta niet automatisch worden opgesplitst. Origineel:{' '}
            <strong>{a.adresAxapta || '(leeg)'}</strong>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
              <input
                type="checkbox"
                checked={!a.adresControleren}
                onChange={(e) => onChange('adresControleren', !e.target.checked)}
              />
              Adres is gecontroleerd
            </label>
          </div>
        </div>
      )}
      <div className="field-row">
        <div className="field" style={{ maxWidth: 200 }}>
          <label>Soort</label>
          <select value={a.type} onChange={(e) => onChange('type', e.target.value)}>
            {Object.entries(ADRES_TYPES).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ flex: 2 }}>
          <label>Naam</label>
          <input type="text" value={a.naam} onChange={(e) => onChange('naam', e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label>Straat + huisnummer</label>
        <input type="text" value={a.straat} onChange={(e) => onChange('straat', e.target.value)} />
      </div>
      <div className="field-row">
        <div className="field">
          <label>Postcode</label>
          <input
            type="text"
            value={a.postcode}
            onChange={(e) => onChange('postcode', e.target.value)}
          />
        </div>
        <div className="field">
          <label>Plaats</label>
          <input type="text" value={a.plaats} onChange={(e) => onChange('plaats', e.target.value)} />
        </div>
        <div className="field">
          <label>Land</label>
          <input type="text" value={a.land} onChange={(e) => onChange('land', e.target.value)} />
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label>Telefoon</label>
          <input
            type="text"
            value={a.telefoon}
            onChange={(e) => onChange('telefoon', e.target.value)}
          />
        </div>
        <div className="field">
          <label>E-mail</label>
          <input type="email" value={a.email} onChange={(e) => onChange('email', e.target.value)} />
        </div>
      </div>
    </div>
  )
}

export default function KlantForm({ klant, onDone }) {
  const { isAdmin } = useAuth()
  const isNew = !klant?.id
  const [form, setForm] = useState({
    klantcode: klant?.klantcode || '',
    naam: klant?.naam || '',
    zoeknaam: klant?.zoeknaam || '',
    klantgroep: klant?.klantgroep || 'NL',
    contactpersoon: klant?.contactpersoon || '',
    telefoon: klant?.telefoon || '',
    mobiel: klant?.mobiel || '',
    fax: klant?.fax || '',
    email: klant?.email || '',
    website: klant?.website || '',
    straat: klant?.straat || '',
    postcode: klant?.postcode || '',
    plaats: klant?.plaats || '',
    land: klant?.land || 'Nederland',
    adresControleren: klant?.adresControleren || false,
    adressen: (klant?.adressen || []).map((a) => ({ ...LEEG_ADRES, ...a })),
    leveringsvoorwaarde: klant?.leveringsvoorwaarde || '',
    leveringswijze: klant?.leveringswijze || '',
    taal: klant?.taal || 'nl',
    btwGroep: klant?.btwGroep || 'NL',
    btwNummer: klant?.btwNummer || '',
    valuta: klant?.valuta || 'EUR',
    betalingstermijn: klant?.betalingstermijn ?? 30,
    inclBtw: klant?.inclBtw || false,
    kvkNummer: klant?.kvkNummer || '',
    geblokkeerd: klant?.geblokkeerd || false,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('algemeen')
  const [gekozenAdres, setGekozenAdres] = useState(0)
  const adres = form.adressen[gekozenAdres]

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  function setAdres(index, field, value) {
    setForm((f) => ({
      ...f,
      adressen: f.adressen.map((a, i) => (i === index ? { ...a, [field]: value } : a)),
    }))
  }

  function voegAdresToe() {
    // Naam en land van de klant als begin; meestal is alleen het adres anders.
    setForm((f) => ({ ...f, adressen: [...f.adressen, { ...LEEG_ADRES, naam: f.naam, land: f.land }] }))
    setGekozenAdres(form.adressen.length)
  }

  function verwijderAdres(index) {
    setForm((f) => ({ ...f, adressen: f.adressen.filter((_, i) => i !== index) }))
    setGekozenAdres((g) => Math.max(0, g >= index ? g - 1 : g))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (!form.klantcode.trim() || !form.naam.trim()) {
      setError('Klantnummer en naam zijn verplicht.')
      return
    }
    if (form.btwGroep === 'EU-IC' && !form.btwNummer.trim()) {
      setError('Bij BTW-groep EU-IC (BTW nr. bekend) is het BTW-nummer verplicht.')
      setActiveTab('betaling')
      return
    }

    const payload = {
      klantcode: form.klantcode.trim(),
      naam: form.naam.trim(),
      zoeknaam: form.zoeknaam.trim(),
      klantgroep: form.klantgroep,
      contactpersoon: form.contactpersoon.trim(),
      telefoon: form.telefoon.trim(),
      mobiel: form.mobiel.trim(),
      fax: form.fax.trim(),
      email: form.email.trim(),
      website: form.website.trim(),
      straat: form.straat.trim(),
      postcode: form.postcode.trim(),
      plaats: form.plaats.trim(),
      land: form.land.trim(),
      adresControleren: !!form.adresControleren,
      adressen: form.adressen
        .map((a) => ({
          ...a,
          naam: a.naam.trim(),
          straat: a.straat.trim(),
          postcode: a.postcode.trim(),
          plaats: a.plaats.trim(),
          land: a.land.trim(),
          telefoon: a.telefoon.trim(),
          email: a.email.trim(),
          adresControleren: !!a.adresControleren,
        }))
        .filter((a) => a.naam || a.straat || a.plaats),
      leveringsvoorwaarde: form.leveringsvoorwaarde,
      leveringswijze: form.leveringswijze.trim(),
      taal: form.taal,
      btwGroep: form.btwGroep,
      btwNummer: form.btwNummer.trim(),
      valuta: form.valuta,
      betalingstermijn: Number(form.betalingstermijn) || 0,
      inclBtw: !!form.inclBtw,
      kvkNummer: form.kvkNummer.trim(),
      geblokkeerd: !!form.geblokkeerd,
    }

    setSaving(true)
    try {
      if (isNew) {
        payload.createdAt = serverTimestamp()
        await addDoc(collection(db, 'klanten'), payload)
      } else {
        await updateDoc(doc(db, 'klanten', klant.id), payload)
      }
      onDone?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm(`Klant ${klant.klantcode} verwijderen?`)) return
    setSaving(true)
    try {
      await deleteDoc(doc(db, 'klanten', klant.id))
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
        <div className="field" style={{ maxWidth: 160 }}>
          <label>Klant</label>
          <input
            type="text"
            value={form.klantcode}
            onChange={(e) => set('klantcode', e.target.value)}
            placeholder="bijv. 5000"
          />
        </div>
        <div className="field" style={{ flex: 3 }}>
          <label>Naam</label>
          <input type="text" value={form.naam} onChange={(e) => set('naam', e.target.value)} />
        </div>
      </div>

      <div className="tab-row">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={'tab-btn' + (activeTab === t.id ? ' active' : '')}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
            {t.id === 'adres' && form.adresControleren && ' ⚠'}
            {t.id === 'adressen' && form.adressen.length > 0 && ` (${form.adressen.length})`}
            {t.id === 'adressen' && form.adressen.some((a) => a.adresControleren) && ' ⚠'}
          </button>
        ))}
      </div>

      <div className="tab-paneel">
        {activeTab === 'algemeen' && (
          <>
            <div className="field-row">
              <div className="field">
                <label>Zoeknaam</label>
                <input type="text" value={form.zoeknaam} onChange={(e) => set('zoeknaam', e.target.value)} />
              </div>
              <div className="field">
                <label>Klantgroep</label>
                <select value={form.klantgroep} onChange={(e) => set('klantgroep', e.target.value)}>
                  {KLANTGROEPEN.map((g) => (
                    <option key={g} value={g}>
                      {g}
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
              <div className="field" style={{ justifyContent: 'flex-end' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 0 }}>
                  <input
                    type="checkbox"
                    checked={form.geblokkeerd}
                    onChange={(e) => set('geblokkeerd', e.target.checked)}
                  />
                  Geblokkeerd
                </label>
                <span className="hint">Niet meer aan deze klant verkopen</span>
              </div>
            </div>
          </>
        )}

        {activeTab === 'adres' && (
          <>
            {form.adresControleren && (
              <div className="banner banner-warning">
                <div>
                  Dit adres kon bij de import uit Axapta niet automatisch worden opgesplitst. Origineel:{' '}
                  <strong>{klant?.adresAxapta || '(leeg)'}</strong>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                    <input
                      type="checkbox"
                      checked={!form.adresControleren}
                      onChange={(e) => set('adresControleren', !e.target.checked)}
                    />
                    Adres is gecontroleerd
                  </label>
                </div>
              </div>
            )}
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
          </>
        )}

        {activeTab === 'adressen' && (
          <>
            {form.adressen.length === 0 ? (
              <p className="hint" style={{ marginTop: 0 }}>
                Nog geen alternatieve adressen. Voeg bijvoorbeeld een apart leveradres of factuuradres toe.
              </p>
            ) : (
              <div className="adressen-tabel-wrap">
                <table className="data-table adressen-tabel">
                  <thead>
                    <tr>
                      <th style={{ width: '24%' }}>Soort</th>
                      <th style={{ width: '28%' }}>Naam</th>
                      <th style={{ width: '30%' }}>Adres</th>
                      <th style={{ width: '18%' }}>Plaats</th>
                    </tr>
                  </thead>
                  <tbody>
                    {form.adressen.map((a, i) => (
                      <tr
                        key={i}
                        className={i === gekozenAdres ? 'geselecteerd' : ''}
                        onClick={() => setGekozenAdres(i)}
                        title={[a.naam, a.straat, a.postcode, a.plaats].filter(Boolean).join(', ')}
                      >
                        <td>
                          {ADRES_TYPES[a.type] || a.type}
                          {a.adresControleren && ' ⚠'}
                        </td>
                        <td>{a.naam || '-'}</td>
                        <td>{a.straat || '-'}</td>
                        <td>{a.plaats || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, margin: '10px 0 14px' }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={voegAdresToe}>
                + Adres toevoegen
              </button>
              {adres && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => verwijderAdres(gekozenAdres)}
                >
                  Gekozen adres verwijderen
                </button>
              )}
            </div>
            {adres && (
              <AdresVelden adres={adres} onChange={(field, value) => setAdres(gekozenAdres, field, value)} />
            )}
          </>
        )}

        {activeTab === 'contact' && (
          <>
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
              <div className="field">
                <label>Mobiel</label>
                <input type="text" value={form.mobiel} onChange={(e) => set('mobiel', e.target.value)} />
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label>E-mail</label>
                <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
              </div>
              <div className="field">
                <label>Website</label>
                <input type="text" value={form.website} onChange={(e) => set('website', e.target.value)} />
              </div>
              <div className="field">
                <label>Fax</label>
                <input type="text" value={form.fax} onChange={(e) => set('fax', e.target.value)} />
              </div>
            </div>
          </>
        )}

        {activeTab === 'levering' && (
          <div className="field-row">
            <div className="field">
              <label>Leveringsvoorwaarde</label>
              <select
                value={form.leveringsvoorwaarde}
                onChange={(e) => set('leveringsvoorwaarde', e.target.value)}
              >
                <option value="">—</option>
                {Object.entries(LEVERINGSVOORWAARDEN).map(([code, omschrijving]) => (
                  <option key={code} value={code}>
                    {code} — {omschrijving}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Leveringswijze</label>
              <input
                type="text"
                value={form.leveringswijze}
                onChange={(e) => set('leveringswijze', e.target.value)}
                placeholder="bijv. TNT, Afhalen"
              />
            </div>
            <div className="field">
              <label>Taal</label>
              <select value={form.taal} onChange={(e) => set('taal', e.target.value)}>
                {Object.entries(MAIL_TALEN).map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {activeTab === 'betaling' && (
          <>
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
            </div>
            <div className="field-row">
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
              <div className="field" style={{ justifyContent: 'flex-end' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 0 }}>
                  <input type="checkbox" checked={form.inclBtw} onChange={(e) => set('inclBtw', e.target.checked)} />
                  Prijzen incl. BTW
                </label>
              </div>
            </div>
          </>
        )}
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

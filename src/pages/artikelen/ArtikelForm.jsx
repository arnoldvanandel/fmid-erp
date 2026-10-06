import { useEffect, useMemo, useRef, useState } from 'react'
import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import { useCollection } from '../../hooks/useCollection'
import { useVoorraadTotals } from '../../hooks/useVoorraadTotals'
import { formatBytes, formatCurrency, formatDateTime, formatNumber } from '../../lib/format'
import { uploadArtikelDocument, verwijderArtikelDocument } from '../../lib/documenten'
import {
  verwijderStuklijstRegel,
  voegStuklijstRegelToe,
  wijzigStuklijstRegelAantal,
} from '../../lib/stuklijst'
import { verwijderRouteRegel, voegRouteRegelToe, wijzigRouteRegel } from '../../lib/route'
import { useArtikelenOpId, zoekTermen } from '../../lib/artikelZoeken'
import Modal from '../../components/Modal'
import ArtikelKiezer from '../../components/ArtikelKiezer'
import MutatieForm from '../voorraad/MutatieForm'

const EENHEDEN = ['Stuks', 'Meter', 'Kg', 'Liter', 'm²', 'Doos', 'Rol', 'Set']

// Overgenomen uit de Axapta-tabellen inventtable (artikeltype) en
// InventTableModule (TaxItemGroupId) — zo sluiten nieuwe artikelen aan bij
// de waarden die in de bestaande Axapta-export voorkomen.
const ARTIKELTYPEN = ['Artikel', 'Stuklijst', 'Dienst']
const BTW_GROEPEN = ['Hoog', 'Laag', 'Nul', 'Vrijgesteld']

const TYPE_LABEL = { in: 'In', uit: 'Uit', correctie: 'Correctie' }
const TYPE_BADGE = { in: 'badge-success', uit: 'badge-danger', correctie: 'badge-neutral' }

export default function ArtikelForm({ artikel, onDone }) {
  const { isAdmin } = useAuth()
  const isNew = !artikel?.id
  const [form, setForm] = useState({
    artikelnummer: artikel?.artikelnummer || '',
    naam: artikel?.naam || '',
    eenheid: artikel?.eenheid || 'Stuks',
    inkoopprijs: artikel?.inkoopprijs ?? '',
    inkoopprijsHoeveelheid: artikel?.inkoopprijsHoeveelheid ?? 1,
    inkoopprijsDatum: artikel?.inkoopprijsDatum || '',
    inkoopkorting: artikel?.inkoopkorting ?? 0,
    verkoopprijs: artikel?.verkoopprijs ?? '',
    verkoopprijsHoeveelheid: artikel?.verkoopprijsHoeveelheid ?? 1,
    verkoopprijsDatum: artikel?.verkoopprijsDatum || '',
    verkoopkorting: artikel?.verkoopkorting ?? 0,
    minVoorraad: artikel?.minVoorraad ?? 0,
    artikeltype: artikel?.artikeltype || 'Artikel',
    btwGroep: artikel?.btwGroep || 'Hoog',
    levertijd: artikel?.levertijd ?? 0,
    geblokkeerd: artikel?.geblokkeerd || false,
    gewicht: artikel?.gewicht ?? '',
    hoogte: artikel?.hoogte ?? '',
    breedte: artikel?.breedte ?? '',
    diepte: artikel?.diepte ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // Tabbladen: bij een nieuw artikel is er nog geen voorraad om te tonen, dus
  // die tab laten we dan weg. De rest van de gegevens splitsen we op zodat het
  // formulier overzichtelijk blijft ondanks alle Axapta-velden.
  const TABS = useMemo(
    () => [
      { id: 'algemeen', label: 'Algemeen' },
      { id: 'prijzen', label: 'Prijzen' },
      { id: 'afmetingen', label: 'Afmetingen' },
      ...(isNew
        ? []
        : [
            { id: 'voorraad', label: 'Voorraad' },
            { id: 'documenten', label: 'Documenten' },
            ...(form.artikeltype === 'Stuklijst'
              ? [
                  { id: 'stuklijst', label: 'Stuklijst' },
                  { id: 'route', label: 'Route' },
                ]
              : []),
          ]),
    ],
    [isNew, form.artikeltype]
  )
  const [activeTab, setActiveTab] = useState('algemeen')

  useEffect(() => {
    if (!TABS.some((t) => t.id === activeTab)) setActiveTab('algemeen')
  }, [TABS, activeTab])

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (!form.artikelnummer.trim() || !form.naam.trim()) {
      setError('Artikelnummer en naam zijn verplicht.')
      setActiveTab('algemeen')
      return
    }

    const payload = {
      artikelnummer: form.artikelnummer.trim(),
      naam: form.naam.trim(),
      eenheid: form.eenheid,
      inkoopprijs: Number(form.inkoopprijs) || 0,
      inkoopprijsHoeveelheid: Number(form.inkoopprijsHoeveelheid) || 1,
      inkoopprijsDatum: form.inkoopprijsDatum || '',
      inkoopkorting: Number(form.inkoopkorting) || 0,
      verkoopprijs: Number(form.verkoopprijs) || 0,
      verkoopprijsHoeveelheid: Number(form.verkoopprijsHoeveelheid) || 1,
      verkoopprijsDatum: form.verkoopprijsDatum || '',
      verkoopkorting: Number(form.verkoopkorting) || 0,
      minVoorraad: Number(form.minVoorraad) || 0,
      artikeltype: form.artikeltype,
      btwGroep: form.btwGroep,
      levertijd: Number(form.levertijd) || 0,
      geblokkeerd: !!form.geblokkeerd,
      gewicht: form.gewicht === '' ? null : Number(form.gewicht) || 0,
      hoogte: form.hoogte === '' ? null : Number(form.hoogte) || 0,
      breedte: form.breedte === '' ? null : Number(form.breedte) || 0,
      diepte: form.diepte === '' ? null : Number(form.diepte) || 0,
    }
    payload.zoek = zoekTermen({ ...payload, zoeknaam: artikel?.zoeknaam })

    setSaving(true)
    try {
      if (isNew) {
        payload.createdAt = serverTimestamp()
        await addDoc(collection(db, 'artikelen'), payload)
      } else {
        await updateDoc(doc(db, 'artikelen', artikel.id), payload)
      }
      onDone?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm(`Artikel ${artikel.artikelnummer} verwijderen?`)) return
    setSaving(true)
    try {
      await deleteDoc(doc(db, 'artikelen', artikel.id))
      onDone?.()
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <div className="banner banner-danger">{error}</div>}

      <div className="tab-row">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={'tab-btn' + (activeTab === t.id ? ' active' : '')}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'algemeen' && (
        <div>
          <div className="field-row">
            <div className="field">
              <label>Artikelnummer</label>
              <input
                type="text"
                value={form.artikelnummer}
                onChange={(e) => set('artikelnummer', e.target.value)}
                placeholder="bijv. ACS60-004-277"
              />
            </div>
            <div className="field">
              <label>Eenheid</label>
              <select value={form.eenheid} onChange={(e) => set('eenheid', e.target.value)}>
                {EENHEDEN.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label>Naam</label>
            <input type="text" value={form.naam} onChange={(e) => set('naam', e.target.value)} />
          </div>

          <div className="field-row">
            <div className="field">
              <label>Artikeltype</label>
              <select value={form.artikeltype} onChange={(e) => set('artikeltype', e.target.value)}>
                {ARTIKELTYPEN.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>BTW-groep</label>
              <select value={form.btwGroep} onChange={(e) => set('btwGroep', e.target.value)}>
                {BTW_GROEPEN.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
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
              <span className="hint">Niet meer in-/verkopen</span>
            </div>
          </div>

          <div className="field">
            <label>Minimale voorraad (totaal, alle locaties samen)</label>
            <input
              type="number"
              value={form.minVoorraad}
              onChange={(e) => set('minVoorraad', e.target.value)}
              style={{ maxWidth: 200 }}
            />
            <span className="hint">Onder dit aantal wordt het artikel als "laag" gemarkeerd.</span>
          </div>
        </div>
      )}

      {activeTab === 'prijzen' && (
        <div className="price-columns">
          <div className="price-panel">
            <h4 className="price-panel-title">Inkooporder</h4>
            <div className="price-row">
              <label>Prijs</label>
              <input
                type="number"
                step="0.01"
                value={form.inkoopprijs}
                onChange={(e) => set('inkoopprijs', e.target.value)}
              />
            </div>
            <div className="price-row">
              <label>Korting (%)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={form.inkoopkorting}
                onChange={(e) => set('inkoopkorting', e.target.value)}
              />
            </div>
            <div className="price-row">
              <label>Prijshoeveelheid</label>
              <input
                type="number"
                step="1"
                min="1"
                value={form.inkoopprijsHoeveelheid}
                onChange={(e) => set('inkoopprijsHoeveelheid', e.target.value)}
              />
            </div>
            <div className="price-row">
              <label>Datum van prijs</label>
              <input
                type="date"
                value={form.inkoopprijsDatum}
                onChange={(e) => set('inkoopprijsDatum', e.target.value)}
              />
            </div>
            <div className="price-row">
              <label>Levertijd (dagen)</label>
              <input
                type="number"
                step="1"
                min="0"
                value={form.levertijd}
                onChange={(e) => set('levertijd', e.target.value)}
              />
            </div>
            <p className="hint" style={{ marginTop: 4 }}>
              Prijs geldt per Prijshoeveelheid {form.eenheid.toLowerCase()}
              {Number(form.inkoopkorting) > 0 &&
                ` — netto ${formatCurrency(
                  (Number(form.inkoopprijs) || 0) * (1 - Number(form.inkoopkorting) / 100)
                )}`}
            </p>
          </div>

          <div className="price-panel">
            <h4 className="price-panel-title">Verkooporder</h4>
            <div className="price-row">
              <label>Prijs</label>
              <input
                type="number"
                step="0.01"
                value={form.verkoopprijs}
                onChange={(e) => set('verkoopprijs', e.target.value)}
              />
            </div>
            <div className="price-row">
              <label>Korting (%)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={form.verkoopkorting}
                onChange={(e) => set('verkoopkorting', e.target.value)}
              />
            </div>
            <div className="price-row">
              <label>Prijshoeveelheid</label>
              <input
                type="number"
                step="1"
                min="1"
                value={form.verkoopprijsHoeveelheid}
                onChange={(e) => set('verkoopprijsHoeveelheid', e.target.value)}
              />
            </div>
            <div className="price-row">
              <label>Datum van prijs</label>
              <input
                type="date"
                value={form.verkoopprijsDatum}
                onChange={(e) => set('verkoopprijsDatum', e.target.value)}
              />
            </div>
            <p className="hint" style={{ marginTop: 4 }}>
              Prijs geldt per Prijshoeveelheid {form.eenheid.toLowerCase()}
              {Number(form.verkoopkorting) > 0 &&
                ` — netto ${formatCurrency(
                  (Number(form.verkoopprijs) || 0) * (1 - Number(form.verkoopkorting) / 100)
                )}`}
            </p>
          </div>
        </div>
      )}

      {activeTab === 'afmetingen' && (
        <div>
          <h3 style={{ marginTop: 4 }}>Afmetingen &amp; gewicht</h3>
          <div className="field-row">
            <div className="field">
              <label>Hoogte (mm)</label>
              <input type="number" step="0.1" value={form.hoogte} onChange={(e) => set('hoogte', e.target.value)} />
            </div>
            <div className="field">
              <label>Breedte (mm)</label>
              <input type="number" step="0.1" value={form.breedte} onChange={(e) => set('breedte', e.target.value)} />
            </div>
            <div className="field">
              <label>Diepte (mm)</label>
              <input type="number" step="0.1" value={form.diepte} onChange={(e) => set('diepte', e.target.value)} />
            </div>
            <div className="field">
              <label>Gewicht (gram)</label>
              <input type="number" step="0.1" value={form.gewicht} onChange={(e) => set('gewicht', e.target.value)} />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'voorraad' && !isNew && <VoorraadTab artikel={artikel} />}

      {activeTab === 'documenten' && !isNew && <DocumentenTab artikel={artikel} />}

      {activeTab === 'stuklijst' && !isNew && form.artikeltype === 'Stuklijst' && (
        <StuklijstTab artikel={artikel} />
      )}

      {activeTab === 'route' && !isNew && form.artikeltype === 'Stuklijst' && (
        <RouteTab artikel={artikel} />
      )}

      {isNew && activeTab === 'algemeen' && (
        <div className="banner banner-info">
          Voorraad stel je hierna in via de Voorraad-pagina (of het tabblad "Voorraad" zodra dit
          artikel is opgeslagen): daar boek je per locatie een "in"-mutatie, zodat er altijd een
          boeking van blijft staan.
        </div>
      )}

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

// Alleen-lezen overzicht van de actuele voorraad per locatie + recente
// mutaties van dit ene artikel, met een snelkoppeling om direct een mutatie
// te boeken zonder terug te hoeven naar de Voorraad-pagina.
function VoorraadTab({ artikel }) {
  const { standenPerArtikel, totalenPerArtikel, loading: loadingStanden } = useVoorraadTotals()
  const { data: mutaties, loading: loadingMutaties } = useCollection('voorraadmutaties', {
    orderByField: 'datum',
    orderDirection: 'desc',
  })
  const [mutatieBoeken, setMutatieBoeken] = useState(false)

  const standen = standenPerArtikel[artikel.id] || []
  const totaal = totalenPerArtikel[artikel.id] || 0
  const laag = totaal <= Number(artikel.minVoorraad || 0)
  const mutatiesVoorArtikel = useMemo(
    () => mutaties.filter((m) => m.artikelId === artikel.id).slice(0, 10),
    [mutaties, artikel.id]
  )

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div>
          Totale voorraad: <strong>{formatNumber(totaal)}</strong> {artikel.eenheid}
          {laag && (
            <span className="badge badge-warning" style={{ marginLeft: 8 }}>
              laag
            </span>
          )}
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMutatieBoeken(true)}>
          Mutatie boeken
        </button>
      </div>

      {loadingStanden ? (
        <div className="empty-state"><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : standen.length === 0 ? (
        <div className="empty-state">Nog geen voorraad geboekt op een locatie.</div>
      ) : (
        <table className="data-table" style={{ marginBottom: 18 }}>
          <thead>
            <tr>
              <th>Locatie</th>
              <th className="num">Voorraad</th>
            </tr>
          </thead>
          <tbody>
            {standen.map((s) => (
              <tr key={s.locatieId} style={{ cursor: 'default' }}>
                <td>{s.locatieCode}</td>
                <td className="num">
                  {formatNumber(s.aantal)} {artikel.eenheid}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3>Recente mutaties</h3>
      {loadingMutaties ? (
        <div className="empty-state"><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : mutatiesVoorArtikel.length === 0 ? (
        <div className="empty-state">Nog geen mutaties voor dit artikel.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Datum</th>
                <th>Locatie</th>
                <th>Type</th>
                <th className="num">Van</th>
                <th className="num">Naar</th>
                <th>Reden</th>
                <th>Door</th>
              </tr>
            </thead>
            <tbody>
              {mutatiesVoorArtikel.map((m) => (
                <tr key={m.id} style={{ cursor: 'default' }}>
                  <td>{formatDateTime(m.datum)}</td>
                  <td>{m.locatieCode || '-'}</td>
                  <td>
                    <span className={'badge ' + (TYPE_BADGE[m.type] || 'badge-neutral')}>
                      {TYPE_LABEL[m.type] || m.type}
                    </span>
                  </td>
                  <td className="num">{formatNumber(m.voorraadVoor)}</td>
                  <td className="num">{formatNumber(m.voorraadNa)}</td>
                  <td>{m.reden || '-'}</td>
                  <td>{m.gebruiker || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {mutatieBoeken && (
        <Modal title="Voorraadmutatie boeken" onClose={() => setMutatieBoeken(false)}>
          <MutatieForm artikel={artikel} standen={standen} onDone={() => setMutatieBoeken(false)} />
        </Modal>
      )}
    </div>
  )
}

// PDF-documenten gekoppeld aan dit artikel (bijv. datasheets, certificaten).
// Bestand gaat naar Storage, de metadata (naam/grootte/link) naar Firestore —
// zie lib/documenten.js.
function DocumentenTab({ artikel }) {
  const { profile, isAdmin } = useAuth()
  const { data: documenten, loading } = useCollection('artikeldocumenten', {
    orderByField: 'datum',
    orderDirection: 'desc',
  })
  const fileInputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)

  const documentenVoorArtikel = useMemo(
    () => documenten.filter((d) => d.artikelId === artikel.id),
    [documenten, artikel.id]
  )

  async function handleFileChange(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    setUploading(true)
    try {
      await uploadArtikelDocument({
        artikel,
        file,
        gebruiker: profile?.naam || profile?.email,
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(documentItem) {
    if (!confirm(`"${documentItem.bestandsnaam}" verwijderen?`)) return
    setError(null)
    try {
      await verwijderArtikelDocument(documentItem)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h3 style={{ margin: 0 }}>Documenten</h3>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? 'Uploaden…' : '+ PDF toevoegen'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
      </div>

      {error && <div className="banner banner-danger">{error}</div>}

      {loading ? (
        <div className="empty-state"><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : documentenVoorArtikel.length === 0 ? (
        <div className="empty-state">Nog geen documenten gekoppeld aan dit artikel.</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Bestand</th>
              <th className="num">Grootte</th>
              <th>Datum</th>
              <th>Door</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {documentenVoorArtikel.map((d) => (
              <tr key={d.id} style={{ cursor: 'default' }}>
                <td>
                  <a href={d.url} target="_blank" rel="noopener noreferrer">
                    {d.bestandsnaam}
                  </a>
                </td>
                <td className="num">{formatBytes(d.grootte)}</td>
                <td>{formatDateTime(d.datum)}</td>
                <td>{d.geuploadDoor || '-'}</td>
                <td style={{ textAlign: 'right' }}>
                  {isAdmin && (
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => handleDelete(d)}
                    >
                      Verwijderen
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// Componenten (+ aantal) van een artikel met artikeltype "Stuklijst". Platte
// collectie `stuklijstregels`, client-side gefilterd op stuklijstArtikelId —
// zelfde patroon als Voorraad/Documenten hierboven.
function StuklijstTab({ artikel }) {
  const { isAdmin } = useAuth()
  const { data: regels, loading } = useCollection('stuklijstregels')
  const [componentTekst, setComponentTekst] = useState('')
  const [componentArtikel, setComponentArtikel] = useState(null)
  const [aantal, setAantal] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const regelsVoorStuklijst = useMemo(
    () => regels.filter((r) => r.stuklijstArtikelId === artikel.id),
    [regels, artikel.id]
  )

  // Alleen de componenten van deze stuklijst ophalen, voor de kostprijs.
  const artikelenById = useArtikelenOpId(regelsVoorStuklijst.map((r) => r.componentArtikelId))

  const kostprijs = regelsVoorStuklijst.reduce((sum, r) => {
    const component = artikelenById[r.componentArtikelId]
    // Inkoopprijs geldt per inkoopprijsHoeveelheid (bijv. per 100 stuks).
    const prijs = (Number(component?.inkoopprijs) || 0) / (Number(component?.inkoopprijsHoeveelheid) || 1)
    const korting = Number(component?.inkoopkorting) || 0
    return sum + prijs * (1 - korting / 100) * (Number(r.aantal) || 0)
  }, 0)

  async function handleToevoegen(e) {
    e.preventDefault()
    setError(null)
    if (!componentArtikel) {
      setError(componentTekst.trim() ? `Artikel "${componentTekst.trim()}" bestaat niet.` : 'Kies een component.')
      return
    }
    setSaving(true)
    try {
      await voegStuklijstRegelToe({ stuklijstArtikel: artikel, componentArtikel, aantal })
      setComponentTekst('')
      setComponentArtikel(null)
      setAantal('')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleAantalChange(regel, value) {
    if (value === '' || Number(value) === regel.aantal) return
    try {
      await wijzigStuklijstRegelAantal(regel.id, value)
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleVerwijderen(regel) {
    if (!confirm(`Component ${regel.componentArtikelnummer} verwijderen uit deze stuklijst?`)) return
    try {
      await verwijderStuklijstRegel(regel.id)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div>
      <h3 style={{ marginTop: 4 }}>Componenten</h3>

      {error && <div className="banner banner-danger">{error}</div>}

      <div className="field-row" style={{ alignItems: 'flex-end' }}>
        <div className="field" style={{ flex: 2 }}>
          <label>Component</label>
          <ArtikelKiezer
            value={componentTekst}
            onChange={setComponentTekst}
            onKies={setComponentArtikel}
            filter={(a) => a.id !== artikel.id}
            placeholder="Typ artikelnummer of naam…"
          />
          {componentArtikel && <span className="hint">{componentArtikel.naam}</span>}
        </div>
        <div className="field">
          <label>Aantal</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={aantal}
            onChange={(e) => setAantal(e.target.value)}
            style={{ maxWidth: 120 }}
          />
        </div>
        <div className="field" style={{ flex: 'none' }}>
          <button type="button" className="btn btn-secondary" onClick={handleToevoegen} disabled={saving}>
            {saving ? 'Toevoegen…' : '+ Toevoegen'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="empty-state"><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : regelsVoorStuklijst.length === 0 ? (
        <div className="empty-state">Nog geen componenten in deze stuklijst.</div>
      ) : (
        <>
          <table className="data-table" style={{ marginTop: 8 }}>
            <thead>
              <tr>
                <th>Artikelnummer</th>
                <th>Naam</th>
                <th className="num">Aantal</th>
                <th>Eenheid</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {regelsVoorStuklijst.map((r) => (
                <tr key={r.id} style={{ cursor: 'default' }}>
                  <td>{r.componentArtikelnummer}</td>
                  <td>{r.componentNaam}</td>
                  <td className="num">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={r.aantal}
                      onBlur={(e) => handleAantalChange(r, e.target.value)}
                      style={{ maxWidth: 90, textAlign: 'right' }}
                    />
                  </td>
                  <td>{r.componentEenheid}</td>
                  <td style={{ textAlign: 'right' }}>
                    {isAdmin && (
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => handleVerwijderen(r)}
                    >
                      Verwijderen
                    </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hint" style={{ marginTop: 10 }}>
            Kostprijs op basis van huidige inkoopprijzen van de componenten:{' '}
            <strong>{formatCurrency(kostprijs)}</strong>
          </p>
        </>
      )}
    </div>
  )
}

// Route (bewerkingen) van een artikel met artikeltype "Stuklijst": de
// volgorde van bewerkingscentra waar dit artikel doorheen gaat om te worden
// geproduceerd, incl. tijd per stuk. Zelfde platte-collectie-patroon als
// Stuklijst hierboven, maar op volgnummer gesorteerd zodat de bewerkingen in
// de juiste volgorde staan.
function RouteTab({ artikel }) {
  const { isAdmin } = useAuth()
  const { data: regels, loading } = useCollection('routeregels')
  const regelsVoorRoute = useMemo(
    () =>
      regels
        .filter((r) => r.artikelId === artikel.id)
        .sort((a, b) => (Number(a.volgnummer) || 0) - (Number(b.volgnummer) || 0)),
    [regels, artikel.id]
  )

  const [volgnummer, setVolgnummer] = useState('10')
  const [bewerking, setBewerking] = useState('')
  const [bewerkingscentrum, setBewerkingscentrum] = useState('')
  const [insteltijd, setInsteltijd] = useState('')
  const [tijd, setTijd] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const totaleInsteltijd = regelsVoorRoute.reduce((sum, r) => sum + (Number(r.insteltijd) || 0), 0)
  const totaleTijd = regelsVoorRoute.reduce((sum, r) => sum + (Number(r.tijd) || 0), 0)

  async function handleToevoegen(e) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      await voegRouteRegelToe({ artikel, volgnummer, bewerking, bewerkingscentrum, insteltijd, tijd })
      const volgend = (Number(volgnummer) || 0) + 10
      setVolgnummer(String(volgend))
      setBewerking('')
      setBewerkingscentrum('')
      setInsteltijd('')
      setTijd('')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleVeldChange(regel, veld, value) {
    if (value === '' || value === String(regel[veld])) return
    try {
      await wijzigRouteRegel(regel.id, { [veld]: value })
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleVerwijderen(regel) {
    if (!confirm(`Bewerking ${regel.volgnummer} (${regel.bewerkingscentrum}) verwijderen uit deze route?`)) return
    try {
      await verwijderRouteRegel(regel.id)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div>
      <h3 style={{ marginTop: 4 }}>Bewerkingen</h3>

      {error && <div className="banner banner-danger">{error}</div>}

      <div className="field-row" style={{ alignItems: 'flex-end' }}>
        <div className="field" style={{ flex: 'none' }}>
          <label>Volgnr.</label>
          <input
            type="number"
            min="1"
            step="10"
            value={volgnummer}
            onChange={(e) => setVolgnummer(e.target.value)}
            style={{ maxWidth: 80 }}
          />
        </div>
        <div className="field" style={{ flex: 2 }}>
          <label>Bewerking</label>
          <input
            type="text"
            value={bewerking}
            onChange={(e) => setBewerking(e.target.value)}
            placeholder="bijv. Draaien, Frezen, Lassen"
          />
        </div>
        <div className="field" style={{ flex: 2 }}>
          <label>Bewerkingscentrum</label>
          <input
            type="text"
            value={bewerkingscentrum}
            onChange={(e) => setBewerkingscentrum(e.target.value)}
            placeholder="bijv. DRAAI01"
          />
        </div>
        <div className="field">
          <label>Insteltijd (min)</label>
          <input
            type="number"
            min="0"
            step="0.1"
            value={insteltijd}
            onChange={(e) => setInsteltijd(e.target.value)}
            style={{ maxWidth: 120 }}
          />
        </div>
        <div className="field">
          <label>Tijd (min/stuk)</label>
          <input
            type="number"
            min="0"
            step="0.1"
            value={tijd}
            onChange={(e) => setTijd(e.target.value)}
            style={{ maxWidth: 120 }}
          />
        </div>
        <div className="field" style={{ flex: 'none' }}>
          <button type="button" className="btn btn-secondary" onClick={handleToevoegen} disabled={saving}>
            {saving ? 'Toevoegen…' : '+ Toevoegen'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="empty-state"><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : regelsVoorRoute.length === 0 ? (
        <div className="empty-state">Nog geen bewerkingen in deze route.</div>
      ) : (
        <>
          <table className="data-table" style={{ marginTop: 8 }}>
            <thead>
              <tr>
                <th className="num">Volgnr.</th>
                <th>Bewerking</th>
                <th>Bewerkingscentrum</th>
                <th className="num">Insteltijd (min)</th>
                <th className="num">Tijd (min/stuk)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {regelsVoorRoute.map((r) => (
                <tr key={r.id} style={{ cursor: 'default' }}>
                  <td className="num">
                    <input
                      type="number"
                      min="1"
                      step="10"
                      defaultValue={r.volgnummer}
                      onBlur={(e) => handleVeldChange(r, 'volgnummer', e.target.value)}
                      style={{ maxWidth: 70, textAlign: 'right' }}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      defaultValue={r.bewerking}
                      onBlur={(e) => handleVeldChange(r, 'bewerking', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      defaultValue={r.bewerkingscentrum}
                      onBlur={(e) => handleVeldChange(r, 'bewerkingscentrum', e.target.value)}
                    />
                  </td>
                  <td className="num">
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      defaultValue={r.insteltijd}
                      onBlur={(e) => handleVeldChange(r, 'insteltijd', e.target.value)}
                      style={{ maxWidth: 90, textAlign: 'right' }}
                    />
                  </td>
                  <td className="num">
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      defaultValue={r.tijd}
                      onBlur={(e) => handleVeldChange(r, 'tijd', e.target.value)}
                      style={{ maxWidth: 90, textAlign: 'right' }}
                    />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {isAdmin && (
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => handleVerwijderen(r)}
                      >
                        Verwijderen
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hint" style={{ marginTop: 10 }}>
            Totale insteltijd: <strong>{formatNumber(totaleInsteltijd, 1)} min</strong> · Totale
            bewerkingstijd per stuk: <strong>{formatNumber(totaleTijd, 1)} min</strong>
          </p>
        </>
      )}
    </div>
  )
}

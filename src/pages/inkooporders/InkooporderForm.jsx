import { useEffect, useMemo, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import { useCollection } from '../../hooks/useCollection'
import { formatCurrency, formatDateTime, formatNumber } from '../../lib/format'
import { mailInkooporder } from '../../lib/inkooporderMail'
import {
  inkooporderEmailadressen,
  laadInkooporderVoorAfdruk,
  verwijderInkooporder,
  verwijderInkooporderRegel,
  voegInkooporderRegelToe,
  wijzigInkooporder,
  wijzigInkooporderRegel,
} from '../../lib/inkooporders'

const STATUSSEN = ['concept', 'besteld', 'ontvangen', 'geannuleerd']
const STATUS_LABEL = {
  concept: 'Concept',
  besteld: 'Besteld',
  ontvangen: 'Ontvangen',
  geannuleerd: 'Geannuleerd',
}

export default function InkooporderForm({ inkooporder, onDone }) {
  const { isAdmin, profile } = useAuth()
  const [status, setStatus] = useState(inkooporder.status || 'concept')
  const [verwachteLeverdatum, setVerwachteLeverdatum] = useState(inkooporder.verwachteLeverdatum || '')
  const [besteldatum, setBesteldatum] = useState(inkooporder.besteldatum || '')
  const [referentie, setReferentie] = useState(inkooporder.referentie || '')
  const [besteldDoor, setBesteldDoor] = useState(inkooporder.besteldDoor || '')
  const [levering, setLevering] = useState(inkooporder.levering || '')
  const [opmerkingen, setOpmerkingen] = useState(inkooporder.opmerkingen || '')
  const [saving, setSaving] = useState(false)
  const [mailen, setMailen] = useState(false)
  const [error, setError] = useState(null)

  const { data: artikelen } = useCollection('artikelen', { orderByField: 'artikelnummer' })
  const { data: regels, loading: loadingRegels } = useCollection('inkooporderregels')

  const artikelenById = useMemo(() => {
    const map = {}
    for (const a of artikelen) map[a.id] = a
    return map
  }, [artikelen])

  const regelsVoorOrder = useMemo(
    () =>
      regels
        .filter((r) => r.inkooporderId === inkooporder.id)
        .sort((a, b) => (Number(a.regelnummer) || 0) - (Number(b.regelnummer) || 0)),
    [regels, inkooporder.id]
  )

  const hoogsteRegelnummer = regelsVoorOrder.reduce(
    (max, r) => Math.max(max, Number(r.regelnummer) || 0),
    0
  )
  const totaalbedrag = regelsVoorOrder.reduce(
    (sum, r) => sum + (Number(r.aantal) || 0) * (Number(r.prijs) || 0),
    0
  )

  const [artikelId, setArtikelId] = useState('')
  const [aantal, setAantal] = useState('')
  const [prijs, setPrijs] = useState('')
  const [leverdatum, setLeverdatum] = useState('')
  const [leverancierArtikelnummer, setLeverancierArtikelnummer] = useState('')
  const [regelSaving, setRegelSaving] = useState(false)
  const [regelError, setRegelError] = useState(null)

  function kiesArtikel(id) {
    setArtikelId(id)
    const artikel = artikelenById[id]
    // Inkoopprijzen uit Axapta gelden vaak per 100 of 1000 stuks; een
    // orderregel rekent met de prijs per stuk.
    if (artikel) {
      const perStuk = (Number(artikel.inkoopprijs) || 0) / (Number(artikel.inkoopprijsHoeveelheid) || 1)
      setPrijs(Math.round(perStuk * 10000) / 10000)
    }
  }

  async function handleHeaderSubmit(e) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      await wijzigInkooporder(inkooporder.id, {
        status,
        besteldatum,
        verwachteLeverdatum,
        referentie: referentie.trim(),
        besteldDoor: besteldDoor.trim(),
        levering: levering.trim(),
        opmerkingen: opmerkingen.trim(),
      })
      await vraagOmTeMailen()
      onDone?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
      setMailen(false)
    }
  }

  // Na het opslaan vragen of de order naar de leverancier gemaild moet
  // worden, naar de adressen die bij de leverancier zijn ingesteld.
  async function vraagOmTeMailen() {
    const gegevens = await laadInkooporderVoorAfdruk(inkooporder.id)
    const aan = inkooporderEmailadressen(gegevens.leverancier)
    if (gegevens.regels.length === 0) return
    if (aan.length === 0) {
      alert(
        'Opgeslagen. Er is nog geen e-mailadres ingesteld bij deze leverancier, ' +
          'dus de inkooporder kan niet per mail verstuurd worden.'
      )
      return
    }
    const eerder = inkooporder.gemaildOp
      ? `\n\nLet op: deze order is al eerder gemaild (${formatDateTime(inkooporder.gemaildOp)}).`
      : ''
    const cc = profile?.email && !aan.includes(profile.email) ? `\n\nKopie (cc) naar: ${profile.email}` : ''
    const vraag = `Inkooporder ${inkooporder.ordernummer} per mail versturen naar:\n\n${aan.join('\n')}${cc}${eerder}`
    if (!confirm(vraag)) return
    setMailen(true)
    await mailInkooporder({
      inkooporderId: inkooporder.id,
      gebruiker: profile?.naam || profile?.email,
      gebruikerEmail: profile?.email,
      gegevens,
    })
  }

  async function handleDelete() {
    if (!confirm(`Inkooporder ${inkooporder.ordernummer} verwijderen?`)) return
    setSaving(true)
    try {
      await verwijderInkooporder(inkooporder.id)
      onDone?.()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  async function handleRegelToevoegen(e) {
    e.preventDefault()
    setRegelError(null)
    const artikel = artikelenById[artikelId]
    if (!artikel) {
      setRegelError('Kies een artikel.')
      return
    }
    setRegelSaving(true)
    try {
      await voegInkooporderRegelToe({
        inkooporder: { ...inkooporder, verwachteLeverdatum },
        artikel,
        aantal,
        prijs,
        leverdatum,
        leverancierArtikelnummer,
        hoogsteRegelnummer,
      })
      setArtikelId('')
      setAantal('')
      setPrijs('')
      setLeverdatum('')
      setLeverancierArtikelnummer('')
    } catch (err) {
      setRegelError(err.message)
    } finally {
      setRegelSaving(false)
    }
  }

  async function handleRegelTekstChange(regel, veld, value) {
    if (value === (regel[veld] || '')) return
    try {
      await wijzigInkooporderRegel(regel.id, { [veld]: value.trim() })
    } catch (err) {
      setRegelError(err.message)
    }
  }

  async function handleRegelVeldChange(regel, veld, value) {
    if (value === '' || Number(value) === Number(regel[veld])) return
    try {
      await wijzigInkooporderRegel(regel.id, { [veld]: Number(value) || 0 })
    } catch (err) {
      setRegelError(err.message)
    }
  }

  async function handleRegelVerwijderen(regel) {
    if (!confirm(`Regel ${regel.artikelnummer} verwijderen uit deze inkooporder?`)) return
    try {
      await verwijderInkooporderRegel(regel.id)
    } catch (err) {
      setRegelError(err.message)
    }
  }

  return (
    <div>
      {error && <div className="banner banner-danger">{error}</div>}

      <div className="field-row">
        <div className="field">
          <label>Leverancier</label>
          <input type="text" value={`${inkooporder.leverancierscode} — ${inkooporder.leverancierNaam}`} disabled />
        </div>
        <div className="field">
          <label>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUSSEN.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Verwachte leverdatum</label>
          <input
            type="date"
            value={verwachteLeverdatum}
            onChange={(e) => setVerwachteLeverdatum(e.target.value)}
          />
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label>Besteldatum</label>
          <input type="date" value={besteldatum} onChange={(e) => setBesteldatum(e.target.value)} />
        </div>
        <div className="field">
          <label>Uw referentie</label>
          <input
            type="text"
            value={referentie}
            onChange={(e) => setReferentie(e.target.value)}
            placeholder="Contactpersoon leverancier"
          />
        </div>
        <div className="field">
          <label>Besteld door</label>
          <input type="text" value={besteldDoor} onChange={(e) => setBesteldDoor(e.target.value)} />
        </div>
        <div className="field">
          <label>Levering</label>
          <input
            type="text"
            value={levering}
            onChange={(e) => setLevering(e.target.value)}
            placeholder="bijv. franco huis"
          />
        </div>
      </div>

      <div className="field">
        <label>Opmerkingen (komen onder de regels op de inkooporder)</label>
        <textarea rows={2} value={opmerkingen} onChange={(e) => setOpmerkingen(e.target.value)} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 18 }}>
        <a
          className="btn btn-secondary btn-sm"
          href={`/inkooporders/${inkooporder.id}/afdruk`}
          target="_blank"
          rel="noreferrer"
        >
          PDF / afdrukken
        </a>
        <button type="button" className="btn btn-primary btn-sm" onClick={handleHeaderSubmit} disabled={saving}>
          {mailen ? 'Versturen…' : saving ? 'Opslaan…' : 'Opslaan'}
        </button>
      </div>

      <MailStatus inkooporder={inkooporder} />

      <h3 style={{ marginTop: 4 }}>Orderregels</h3>

      {regelError && <div className="banner banner-danger">{regelError}</div>}

      <div className="field-row" style={{ alignItems: 'flex-end' }}>
        <div className="field" style={{ flex: 2 }}>
          <label>Artikel</label>
          <select value={artikelId} onChange={(e) => kiesArtikel(e.target.value)}>
            <option value="">Kies artikel…</option>
            {artikelen.map((a) => (
              <option key={a.id} value={a.id}>
                {a.artikelnummer} — {a.naam}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Aantal</label>
          <input
            type="number"
            min="0"
            step="1"
            value={aantal}
            onChange={(e) => setAantal(e.target.value)}
            style={{ maxWidth: 100 }}
          />
        </div>
        <div className="field">
          <label>Prijs per stuk</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={prijs}
            onChange={(e) => setPrijs(e.target.value)}
            style={{ maxWidth: 120 }}
          />
        </div>
        <div className="field">
          <label>Leverdatum</label>
          <input type="date" value={leverdatum} onChange={(e) => setLeverdatum(e.target.value)} />
        </div>
        <div className="field">
          <label>Art.nr. leverancier</label>
          <input
            type="text"
            value={leverancierArtikelnummer}
            onChange={(e) => setLeverancierArtikelnummer(e.target.value)}
            style={{ maxWidth: 140 }}
          />
        </div>
        <div className="field" style={{ flex: 'none' }}>
          <button type="button" className="btn btn-secondary" onClick={handleRegelToevoegen} disabled={regelSaving}>
            {regelSaving ? 'Toevoegen…' : '+ Toevoegen'}
          </button>
        </div>
      </div>

      {loadingRegels ? (
        <div className="empty-state"><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : regelsVoorOrder.length === 0 ? (
        <div className="empty-state">Nog geen regels op deze inkooporder.</div>
      ) : (
        <>
          <table className="data-table" style={{ marginTop: 8 }}>
            <thead>
              <tr>
                <th>Artikelnummer</th>
                <th>Naam</th>
                <th className="num">Aantal</th>
                <th>Eenheid</th>
                <th className="num">Prijs</th>
                <th className="num">Subtotaal</th>
                <th>Leverdatum</th>
                <th>Art.nr. leverancier</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {regelsVoorOrder.map((r) => (
                <tr key={r.id} style={{ cursor: 'default' }}>
                  <td>{r.artikelnummer}</td>
                  <td>{r.artikelnaam}</td>
                  <td className="num">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      defaultValue={r.aantal}
                      onBlur={(e) => handleRegelVeldChange(r, 'aantal', e.target.value)}
                      style={{ maxWidth: 80, textAlign: 'right' }}
                    />
                  </td>
                  <td>{r.eenheid}</td>
                  <td className="num">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={r.prijs}
                      onBlur={(e) => handleRegelVeldChange(r, 'prijs', e.target.value)}
                      style={{ maxWidth: 100, textAlign: 'right' }}
                    />
                  </td>
                  <td className="num">{formatCurrency((Number(r.aantal) || 0) * (Number(r.prijs) || 0))}</td>
                  <td>
                    <input
                      type="date"
                      defaultValue={r.leverdatum || ''}
                      onBlur={(e) => handleRegelTekstChange(r, 'leverdatum', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      defaultValue={r.leverancierArtikelnummer || ''}
                      onBlur={(e) => handleRegelTekstChange(r, 'leverancierArtikelnummer', e.target.value)}
                      style={{ maxWidth: 120 }}
                    />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {isAdmin && (
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => handleRegelVerwijderen(r)}
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
            Totaalbedrag: <strong>{formatCurrency(totaalbedrag)}</strong> ({formatNumber(regelsVoorOrder.length)}{' '}
            regels)
          </p>
        </>
      )}

      <div className="modal-actions" style={{ justifyContent: isAdmin ? 'space-between' : 'flex-end' }}>
        {isAdmin && (
          <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={saving}>
            Inkooporder verwijderen
          </button>
        )}
        <button type="button" className="btn btn-secondary" onClick={onDone} disabled={saving}>
          Sluiten
        </button>
      </div>
    </div>
  )
}

// Toont naar wie en wanneer de order gemaild is, en (live) of de
// Cloud Function verstuurMail de mail daadwerkelijk heeft kunnen versturen.
function MailStatus({ inkooporder }) {
  const [delivery, setDelivery] = useState(null)

  useEffect(() => {
    if (!inkooporder.mailId) return undefined
    return onSnapshot(
      doc(db, 'mail', inkooporder.mailId),
      (snap) => setDelivery(snap.data()?.delivery || null),
      () => setDelivery(null)
    )
  }, [inkooporder.mailId])

  if (!inkooporder.gemaildOp) return null

  const state = delivery?.state
  const label =
    state === 'SUCCESS'
      ? 'verzonden'
      : state === 'ERROR'
        ? `niet verzonden: ${delivery.error || 'onbekende fout'}`
        : 'wacht op verzending'

  return (
    <div className={'banner ' + (state === 'ERROR' ? 'banner-danger' : state === 'SUCCESS' ? 'banner-info' : 'banner-warning')}>
      Gemaild naar {(inkooporder.gemaildNaar || []).join(', ')}
      {inkooporder.gemaildCc?.length ? ` (cc: ${inkooporder.gemaildCc.join(', ')})` : ''} op {formatDateTime(inkooporder.gemaildOp)} — {label}
    </div>
  )
}

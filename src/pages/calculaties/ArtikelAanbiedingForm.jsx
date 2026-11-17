import { useEffect, useMemo, useRef, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import { formatNumber, formatPrijs } from '../../lib/format'
import { VALUTA } from '../../lib/stamgegevens'
import { hoofdadres, klantEmailadressen, verkoopprijsPerStuk } from '../../lib/verkooporders'
import {
  STATUS_LABEL,
  artikelAanbiedingVelden,
  laadCalculatieVoorAfdruk,
  verwijderCalculatie,
  wijzigArtikelAanbieding,
} from '../../lib/calculaties'
import { aanbiedingMailTekst, aanbiedingTitel, mailAanbieding } from '../../lib/calculatieMail'
import ArtikelKiezer from '../../components/ArtikelKiezer'
import { GetalCel, gridToets } from '../../components/RegelGrid'
import MailVenster, { MailStatus } from '../../components/MailVenster'
import KlantKiezerVenster from './KlantKiezerVenster'
import AanbiedingVoorwaarden from './AanbiedingVoorwaarden'

let volgendeSleutel = 1
const metSleutel = (r) => ({ ...r, sleutel: volgendeSleutel++ })

function naarForm(c) {
  return {
    klantId: c.klantId || '',
    klantcode: c.klantcode || '',
    klantNaam: c.klantNaam || '',
    adres: { naam: c.klantNaam || '', straat: '', postcode: '', plaats: '', land: '', ...(c.adres || {}) },
    taal: c.taal || 'nl',
    contactpersoon: c.contactpersoon || '',
    referentie: c.referentie || '',
    artikelRegels: (c.artikelRegels || []).map(metSleutel),
    valuta: c.valuta || 'EUR',
    leveringsvoorwaarde: c.leveringsvoorwaarde || '',
    levertijd: c.levertijd || '',
    geldigDagen: c.geldigDagen ?? 30,
    betalingstermijn: c.betalingstermijn ?? 30,
    opmerkingen: c.opmerkingen || '',
    notities: c.notities || '',
    status: c.status || 'concept',
  }
}

const LEGE_REGEL = { artikelnummer: '', artikel: null, aantal: '', prijs: '', klantArtikelnummer: '' }

// Aanbieding met artikelen die al bestaan: artikel kiezen, aantal en prijs per
// stuk zelf invullen, dan de voorwaarden. Afdrukken en mailen gaat hetzelfde
// als bij een calculatie.
export default function ArtikelAanbiedingForm({ aanbieding: start, onDone }) {
  const { profile, isAdmin } = useAuth()
  const gebruiker = profile?.naam || profile?.email

  const [aanbieding, setAanbieding] = useState(start)
  useEffect(
    () =>
      onSnapshot(doc(db, 'calculaties', start.id), (snap) => {
        if (snap.exists()) setAanbieding({ id: snap.id, ...snap.data() })
      }),
    [start.id]
  )
  const [klant, setKlant] = useState(null)
  useEffect(() => {
    if (!aanbieding.klantId) return undefined
    return onSnapshot(doc(db, 'klanten', aanbieding.klantId), (snap) => {
      setKlant(snap.exists() ? { id: snap.id, ...snap.data() } : null)
    })
  }, [aanbieding.klantId])

  const [form, setForm] = useState(() => naarForm(start))
  const [gewijzigd, setGewijzigd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [melding, setMelding] = useState(null)
  const [mail, setMail] = useState(null) // { gegevens, tekst }
  const [mailen, setMailen] = useState(false)
  const [klantKiezen, setKlantKiezen] = useState(false)

  // De status verandert na het mailen buiten het formulier om.
  useEffect(() => {
    if (!gewijzigd) setForm((f) => ({ ...f, status: aanbieding.status || f.status }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aanbieding.status])

  function set(veld, waarde) {
    setForm((f) => ({ ...f, [veld]: waarde }))
    setGewijzigd(true)
    setMelding(null)
  }

  function kiesKlant(k) {
    setForm((f) => ({
      ...f,
      klantId: k.id,
      klantcode: k.klantcode || '',
      klantNaam: k.naam || '',
      adres: hoofdadres(k),
      contactpersoon: k.contactpersoon || '',
      taal: k.taal || f.taal,
    }))
    setGewijzigd(true)
    setMelding(`Klant gewijzigd in ${k.klantcode} — ${k.naam}. Vergeet niet op te slaan.`)
    setKlantKiezen(false)
  }

  // ---------------------------------------------------------------- regels

  function setRegel(sleutel, veld, waarde) {
    setForm((f) => ({
      ...f,
      artikelRegels: f.artikelRegels.map((r) => (r.sleutel === sleutel ? { ...r, [veld]: waarde } : r)),
    }))
    setGewijzigd(true)
    setMelding(null)
  }

  function getalRegel(regel, veld, waarde) {
    if (waarde === '' || Number(waarde) === Number(regel[veld])) return
    if (veld === 'aantal' && !(Number(waarde) > 0)) {
      setError('Het aantal moet groter dan 0 zijn.')
      return
    }
    setRegel(regel.sleutel, veld, Number(waarde))
  }

  function verwijderRegel(sleutel) {
    set(
      'artikelRegels',
      form.artikelRegels.filter((r) => r.sleutel !== sleutel)
    )
  }

  const [nieuweRegel, setNieuweRegelState] = useState(LEGE_REGEL)
  // Ook in een ref, zodat Enter direct na het verlaten van een cel de laatste invoer meeneemt.
  const nieuweRegelRef = useRef(LEGE_REGEL)
  const nieuweRijRef = useRef(null)
  function setNieuweRegel(updates) {
    nieuweRegelRef.current = { ...nieuweRegelRef.current, ...updates }
    setNieuweRegelState(nieuweRegelRef.current)
  }

  // Voorstel uit het artikel: verkoopprijs per stuk en, als het artikel bij
  // deze klant hoort, het artikelnummer van de klant.
  function kiesArtikel(artikel) {
    const updates = { artikel }
    if (artikel) {
      updates.prijs = verkoopprijsPerStuk(artikel) || ''
      updates.klantArtikelnummer =
        !artikel.klantId || artikel.klantId === form.klantId ? artikel.klantArtikelnummer || '' : ''
    }
    setNieuweRegel(updates)
  }

  function voegRegelToe() {
    setError(null)
    const r = nieuweRegelRef.current
    if (!r.artikel) {
      setError(
        r.artikelnummer.trim() ? `Artikel "${r.artikelnummer.trim()}" bestaat niet.` : 'Vul een artikelnummer in.'
      )
      return
    }
    if (!(Number(r.aantal) > 0)) {
      setError('Vul een aantal in.')
      return
    }
    set('artikelRegels', [
      ...form.artikelRegels,
      metSleutel({
        artikelId: r.artikel.id,
        artikelnummer: r.artikel.artikelnummer,
        omschrijving: r.artikel.naam || '',
        klantArtikelnummer: r.klantArtikelnummer || '',
        eenheid: r.artikel.eenheid || 'Stuks',
        aantal: Number(r.aantal),
        prijs: r.prijs === '' ? 0 : Number(r.prijs),
      }),
    ])
    setNieuweRegel(LEGE_REGEL)
    // Direct verder met het volgende artikel.
    setTimeout(() => nieuweRijRef.current?.querySelector('[data-kolom="artikelnummer"]')?.focus(), 0)
  }

  // Wat er nu in het formulier staat, zoals het opgeslagen wordt.
  const velden = useMemo(() => artikelAanbiedingVelden(form), [form])
  const totaal = velden.artikelRegels.reduce((som, r) => som + r.aantal * r.prijs, 0)
  const aantalRegels = form.artikelRegels.length

  // ---------------------------------------------------------------- opslaan, bekijken, mailen

  async function slaOp() {
    setError(null)
    setSaving(true)
    try {
      await wijzigArtikelAanbieding(aanbieding, form)
      setGewijzigd(false)
      setMelding('Opgeslagen.')
      return true
    } catch (err) {
      setError(err.message)
      return false
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    await slaOp()
  }

  function controleerAanbieding() {
    if (velden.artikelRegels.length === 0) throw new Error('Voeg minimaal één artikel toe.')
    const zonderPrijs = velden.artikelRegels.find((r) => !(r.prijs > 0))
    if (zonderPrijs) throw new Error(`Artikel ${zonderPrijs.artikelnummer} heeft nog geen prijs per stuk.`)
    const zonderAantal = velden.artikelRegels.find((r) => !(r.aantal > 0))
    if (zonderAantal) throw new Error(`Artikel ${zonderAantal.artikelnummer} heeft nog geen aantal.`)
  }

  async function bekijkAanbieding() {
    setError(null)
    try {
      controleerAanbieding()
      if (gewijzigd && !(await slaOp())) return
      window.open(`/calculaties/${aanbieding.id}/afdruk`, '_blank', 'noopener')
    } catch (err) {
      setError(err.message)
    }
  }

  async function openMail() {
    setError(null)
    try {
      controleerAanbieding()
      if (gewijzigd && !(await slaOp())) return
      const gegevens = await laadCalculatieVoorAfdruk(aanbieding.id)
      setMail({
        gegevens,
        tekst: aanbiedingMailTekst({ gegevens, gebruiker, handtekening: profile?.handtekening }),
      })
    } catch (err) {
      setError(err.message)
    }
  }

  async function verstuurMail(ontvangers) {
    setMailen(true)
    try {
      await mailAanbieding({
        gegevens: mail.gegevens,
        ontvangers,
        tekst: mail.tekst,
        gebruiker,
        gebruikerEmail: profile?.email,
        handtekening: profile?.handtekening,
      })
      setMail(null)
      setMelding('De aanbieding is klaargezet om te mailen en opgeslagen.')
    } finally {
      setMailen(false)
    }
  }

  async function handleDelete() {
    if (!confirm(`Aanbieding ${aanbieding.calculatienummer} verwijderen? De artikelen blijven staan.`)) return
    setError(null)
    try {
      await verwijderCalculatie(aanbieding)
      onDone?.()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <div className="banner banner-danger">{error}</div>}
      {melding && <div className="banner banner-info">{melding}</div>}

      <div className="field-row">
        <div className="field">
          <label>Klant</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input type="text" value={`${form.klantcode} — ${form.klantNaam}`} disabled />
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setKlantKiezen(true)}
              style={{ whiteSpace: 'nowrap' }}
            >
              Wijzigen
            </button>
          </div>
        </div>
        <div className="field" style={{ maxWidth: 140 }}>
          <label>Valuta</label>
          <select value={form.valuta} onChange={(e) => set('valuta', e.target.value)}>
            {VALUTA.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Status</label>
          <select value={form.status} onChange={(e) => set('status', e.target.value)}>
            {Object.entries(STATUS_LABEL).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <MailStatus document={aanbieding} titel="Aanbieding gemaild" />

      <div className="regel-grid-kop">
        <h3>Artikelen</h3>
      </div>
      <div className="regel-grid-wrap">
        <table className="regel-grid">
          <thead>
            <tr>
              <th>Artikelnummer</th>
              <th>Omschrijving</th>
              <th>Art.nr. klant</th>
              <th className="num">Aantal</th>
              <th>Eenheid</th>
              <th className="num">Prijs per stuk ({form.valuta})</th>
              <th className="num">Bedrag ({form.valuta})</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {form.artikelRegels.map((r, i) => (
              <tr key={r.sleutel}>
                <td className="alleen-lezen">{r.artikelnummer}</td>
                <td>
                  <input
                    type="text"
                    data-rij={i}
                    data-kolom="omschrijving"
                    value={r.omschrijving}
                    onChange={(e) => setRegel(r.sleutel, 'omschrijving', e.target.value)}
                    onKeyDown={gridToets}
                    aria-label="Omschrijving"
                  />
                </td>
                <td>
                  <input
                    type="text"
                    data-rij={i}
                    data-kolom="klantArtikelnummer"
                    value={r.klantArtikelnummer}
                    onChange={(e) => setRegel(r.sleutel, 'klantArtikelnummer', e.target.value)}
                    onKeyDown={gridToets}
                    aria-label="Artikelnummer van de klant"
                  />
                </td>
                <td className="num">
                  <GetalCel
                    rij={i}
                    kolom="aantal"
                    value={r.aantal}
                    decimalen={0}
                    maxDecimalen={2}
                    onCommit={(v) => getalRegel(r, 'aantal', v)}
                  />
                </td>
                <td className="alleen-lezen">{r.eenheid}</td>
                <td className="num">
                  <GetalCel
                    rij={i}
                    kolom="prijs"
                    value={r.prijs}
                    decimalen={2}
                    maxDecimalen={4}
                    onCommit={(v) => getalRegel(r, 'prijs', v)}
                  />
                </td>
                <td className="num alleen-lezen">
                  {formatNumber((Number(r.aantal) || 0) * (Number(r.prijs) || 0), 2)}
                </td>
                <td className="alleen-lezen" style={{ textAlign: 'right' }}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => verwijderRegel(r.sleutel)}
                    aria-label={`Regel ${r.artikelnummer} verwijderen`}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}

            <tr
              ref={nieuweRijRef}
              className="regel-grid-nieuw"
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return
                e.preventDefault()
                e.target.blur()
                setTimeout(voegRegelToe, 0)
              }}
            >
              <td>
                <ArtikelKiezer
                  data-rij={aantalRegels}
                  data-kolom="artikelnummer"
                  placeholder="Artikel toevoegen…"
                  value={nieuweRegel.artikelnummer}
                  onChange={(artikelnummer) => setNieuweRegel({ artikelnummer })}
                  onKies={kiesArtikel}
                  onKeyDown={gridToets}
                  filter={(a) => !a.geblokkeerd}
                  autoFocus={aantalRegels === 0}
                />
              </td>
              <td className="alleen-lezen">{nieuweRegel.artikel?.naam || ''}</td>
              <td>
                <input
                  type="text"
                  data-rij={aantalRegels}
                  data-kolom="klantArtikelnummer"
                  value={nieuweRegel.klantArtikelnummer}
                  onChange={(e) => setNieuweRegel({ klantArtikelnummer: e.target.value })}
                  onKeyDown={gridToets}
                  aria-label="Artikelnummer van de klant"
                />
              </td>
              <td className="num">
                <GetalCel
                  rij={aantalRegels}
                  kolom="aantal"
                  value={nieuweRegel.aantal}
                  decimalen={0}
                  maxDecimalen={2}
                  onCommit={(v) => setNieuweRegel({ aantal: v })}
                />
              </td>
              <td className="alleen-lezen">{nieuweRegel.artikel?.eenheid || ''}</td>
              <td className="num">
                <GetalCel
                  rij={aantalRegels}
                  kolom="prijs"
                  value={nieuweRegel.prijs}
                  decimalen={2}
                  maxDecimalen={4}
                  onCommit={(v) => setNieuweRegel({ prijs: v })}
                />
              </td>
              <td className="num alleen-lezen">
                {nieuweRegel.aantal !== '' && nieuweRegel.prijs !== ''
                  ? formatNumber(Number(nieuweRegel.aantal) * Number(nieuweRegel.prijs), 2)
                  : ''}
              </td>
              <td className="alleen-lezen" style={{ textAlign: 'right' }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={voegRegelToe}>
                  Toevoegen
                </button>
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={6}>
                {formatNumber(aantalRegels, 0)} {aantalRegels === 1 ? 'regel' : 'regels'}
              </td>
              <td className="num">{formatNumber(totaal, 2)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="hint" style={{ marginTop: 8 }}>
        Kies een artikel, vul het aantal en de prijs per stuk in en druk op Enter. De verkoopprijs van het artikel wordt
        voorgesteld. Hetzelfde artikel mag vaker voorkomen, bijvoorbeeld voor een staffel met verschillende aantallen.
      </p>

      <AanbiedingVoorwaarden form={form} set={set} calculatiedatum={aanbieding.calculatiedatum} />

      <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
        <div>
          {isAdmin && (
            <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={saving}>
              Verwijderen
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={() => onDone?.()} disabled={saving}>
            Sluiten
          </button>
          <button type="button" className="btn btn-secondary" onClick={bekijkAanbieding} disabled={saving}>
            Aanbieding bekijken
          </button>
          <button type="button" className="btn btn-secondary" onClick={openMail} disabled={saving}>
            Aanbieding mailen
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving || !gewijzigd}>
            {saving ? 'Opslaan…' : 'Opslaan'}
          </button>
        </div>
      </div>

      {klantKiezen && (
        <KlantKiezerVenster
          huidigeKlantId={form.klantId}
          onKies={kiesKlant}
          onAnnuleren={() => setKlantKiezen(false)}
          uitleg="Naam, adres, contactpersoon en taal van de aanbieding worden die van de gekozen klant. De artikelen blijven staan."
        />
      )}

      {mail && (
        <MailVenster
          titel={`${aanbiedingTitel(mail.gegevens)} mailen`}
          standaardAdressen={klantEmailadressen(mail.gegevens.klant || klant, 'bevestiging')}
          eerderGemaildOp={aanbieding.gemaildOp}
          gebruikerEmail={profile?.email}
          bezig={mailen}
          width={640}
          onVersturen={verstuurMail}
          onAnnuleren={() => setMail(null)}
        >
          <div className="field">
            <label>Bericht</label>
            <textarea rows={11} value={mail.tekst} onChange={(e) => setMail({ ...mail, tekst: e.target.value })} />
            <span className="hint">
              De aanbieding gaat als PDF mee: {formatNumber(mail.gegevens.regels.length, 0)}{' '}
              {mail.gegevens.regels.length === 1 ? 'regel' : 'regels'}, totaal{' '}
              {mail.gegevens.calculatie.valuta || 'EUR'}{' '}
              {formatPrijs(mail.gegevens.regels.reduce((som, r) => som + r.bedrag, 0))}.
            </span>
          </div>
        </MailVenster>
      )}
    </form>
  )
}

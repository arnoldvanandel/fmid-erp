import { useMemo, useRef, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useCollection } from '../../hooks/useCollection'
import { formatCurrency, formatNumber } from '../../lib/format'
import { mailInkooporder } from '../../lib/inkooporderMail'
import { haalArtikelOpNummer } from '../../lib/artikelZoeken'
import ArtikelKiezer from '../../components/ArtikelKiezer'
import MailVenster, { MailStatus } from '../../components/MailVenster'
import { GetalCel, gridToets } from '../../components/RegelGrid'
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
  const [mailGegevens, setMailGegevens] = useState(null)
  const [error, setError] = useState(null)

  const { data: regels, loading: loadingRegels } = useCollection('inkooporderregels')

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

  const [regelSaving, setRegelSaving] = useState(false)
  const [regelError, setRegelError] = useState(null)
  const [geselecteerdeRegel, setGeselecteerdeRegel] = useState(null)

  // De lege regel onderaan de tabel, voor een nieuw artikel. De waarden staan
  // ook in een ref, zodat Enter direct na het verlaten van een cel de laatste
  // invoer meeneemt.
  const LEGE_REGEL = {
    artikelnummer: '',
    artikel: null,
    aantal: '',
    prijs: '',
    leverdatum: '',
    leverancierArtikelnummer: '',
  }
  const [nieuweRegel, setNieuweRegelState] = useState(LEGE_REGEL)
  const nieuweRegelRef = useRef(LEGE_REGEL)
  function setNieuweRegel(updates) {
    nieuweRegelRef.current = { ...nieuweRegelRef.current, ...updates }
    setNieuweRegelState(nieuweRegelRef.current)
  }
  const nieuwArtikel = nieuweRegel.artikel

  // Aangeroepen door ArtikelKiezer zodra de ingetypte tekst een bestaand
  // artikelnummer is (of juist niet meer).
  function kiesArtikel(artikel) {
    const updates = { artikel }
    // Inkoopprijzen uit Axapta gelden vaak per 100 of 1000 stuks; een
    // orderregel rekent met de prijs per stuk.
    if (artikel) {
      const perStuk = (Number(artikel.inkoopprijs) || 0) / (Number(artikel.inkoopprijsHoeveelheid) || 1)
      updates.prijs = Math.round(perStuk * 10000) / 10000
    }
    setNieuweRegel(updates)
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
      // Na het opslaan vragen of de order gemaild moet worden (MailVenster).
      // Zonder regels valt er niets te mailen.
      const gegevens = await laadInkooporderVoorAfdruk(inkooporder.id)
      if (gegevens.regels.length === 0) onDone?.()
      else setMailGegevens(gegevens)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function verstuurMail(ontvangers) {
    setMailen(true)
    try {
      await mailInkooporder({
        inkooporderId: inkooporder.id,
        gebruiker: profile?.naam || profile?.email,
        gebruikerEmail: profile?.email,
        handtekening: profile?.handtekening,
        gegevens: mailGegevens,
        ontvangers,
      })
      onDone?.()
    } finally {
      setMailen(false)
    }
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

  async function handleRegelToevoegen() {
    if (regelSaving) return
    setRegelError(null)
    const r = nieuweRegelRef.current
    const artikel = r.artikel || (await haalArtikelOpNummer(r.artikelnummer))
    if (!artikel) {
      setRegelError(
        r.artikelnummer.trim() ? `Artikel "${r.artikelnummer.trim()}" bestaat niet.` : 'Vul een artikelnummer in.'
      )
      return
    }
    setRegelSaving(true)
    try {
      await voegInkooporderRegelToe({
        inkooporder: { ...inkooporder, verwachteLeverdatum },
        artikel,
        aantal: r.aantal,
        prijs: r.prijs === '' ? 0 : r.prijs,
        leverdatum: r.leverdatum,
        leverancierArtikelnummer: r.leverancierArtikelnummer,
        hoogsteRegelnummer,
      })
      setNieuweRegel(LEGE_REGEL)
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
    if (veld === 'aantal' && !(Number(value) > 0)) {
      setRegelError('Hoeveelheid moet groter dan 0 zijn.')
      return
    }
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
      setGeselecteerdeRegel(null)
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
          {saving ? 'Opslaan…' : 'Opslaan'}
        </button>
      </div>

      {mailGegevens && (
        <MailVenster
          titel={`Inkooporder ${inkooporder.ordernummer} mailen`}
          standaardAdressen={inkooporderEmailadressen(mailGegevens.leverancier)}
          eerderGemaildOp={inkooporder.gemaildOp}
          adressenHint="vaste adressen stel je in bij de leverancier (tabblad Inkooporder)"
          gebruikerEmail={profile?.email}
          bezig={mailen}
          annulerenLabel="Niet mailen"
          onVersturen={verstuurMail}
          onAnnuleren={() => {
            setMailGegevens(null)
            onDone?.()
          }}
        />
      )}

      <MailStatus document={inkooporder} />

      <div className="regel-grid-kop">
        <h3>Orderregels</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          {isAdmin && (
            <button
              type="button"
              className="btn btn-danger btn-sm"
              disabled={!geselecteerdeRegel || geselecteerdeRegel === 'nieuw'}
              onClick={() => {
                const regel = regelsVoorOrder.find((r) => r.id === geselecteerdeRegel)
                if (regel) handleRegelVerwijderen(regel)
              }}
            >
              Regel verwijderen
            </button>
          )}
          <button type="button" className="btn btn-secondary btn-sm" onClick={handleRegelToevoegen} disabled={regelSaving}>
            {regelSaving ? 'Toevoegen…' : '+ Regel toevoegen'}
          </button>
        </div>
      </div>

      {regelError && <div className="banner banner-danger">{regelError}</div>}


      <div className="regel-grid-wrap">
        <table className="regel-grid">
          <thead>
            <tr>
              <th className="regel-grid-selector"></th>
              <th>Artikelnummer</th>
              <th className="num">Hoeveelheid</th>
              <th>Eenheid</th>
              <th className="num">Prijs per stuk</th>
              <th className="num">Nettobedrag</th>
              <th>Artikelnaam</th>
              <th>Leveringsdatum</th>
              <th>Art.nr. leverancier</th>
            </tr>
          </thead>
          <tbody>
            {loadingRegels ? (
              <tr>
                <td colSpan={9} className="regel-grid-leeg">
                  Laden…
                </td>
              </tr>
            ) : (
              regelsVoorOrder.map((r, i) => (
                <tr
                  key={r.id}
                  className={geselecteerdeRegel === r.id ? 'geselecteerd' : ''}
                  onFocus={() => setGeselecteerdeRegel(r.id)}
                  onClick={() => setGeselecteerdeRegel(r.id)}
                >
                  <td className="regel-grid-selector">{geselecteerdeRegel === r.id ? '▸' : ''}</td>
                  <td className="alleen-lezen">{r.artikelnummer}</td>
                  <td className="num">
                    <GetalCel
                      rij={i}
                      kolom="aantal"
                      value={r.aantal}
                      decimalen={2}
                      onCommit={(v) => handleRegelVeldChange(r, 'aantal', v)}
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
                      onCommit={(v) => handleRegelVeldChange(r, 'prijs', v)}
                    />
                  </td>
                  <td className="num alleen-lezen">
                    {formatNumber((Number(r.aantal) || 0) * (Number(r.prijs) || 0), 2)}
                  </td>
                  <td className="alleen-lezen">{r.artikelnaam}</td>
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
                      data-rij={i}
                      data-kolom="leverancierArtikelnummer"
                      defaultValue={r.leverancierArtikelnummer || ''}
                      onKeyDown={gridToets}
                      onBlur={(e) => handleRegelTekstChange(r, 'leverancierArtikelnummer', e.target.value)}
                    />
                  </td>
                </tr>
              ))
            )}

            <tr
              className={'regel-grid-nieuw' + (geselecteerdeRegel === 'nieuw' ? ' geselecteerd' : '')}
              onFocus={() => setGeselecteerdeRegel('nieuw')}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  e.target.blur()
                  setTimeout(handleRegelToevoegen, 0)
                }
              }}
            >
              <td className="regel-grid-selector">*</td>
              <td>
                <ArtikelKiezer
                  data-rij={regelsVoorOrder.length}
                  data-kolom="artikelnummer"
                  placeholder="Nieuw artikel…"
                  value={nieuweRegel.artikelnummer}
                  onChange={(artikelnummer) => setNieuweRegel({ artikelnummer })}
                  onKies={kiesArtikel}
                  onKeyDown={gridToets}
                />
              </td>
              <td className="num">
                <GetalCel
                  rij={regelsVoorOrder.length}
                  kolom="aantal"
                  value={nieuweRegel.aantal}
                  decimalen={2}
                  onCommit={(v) => setNieuweRegel({ aantal: v })}
                />
              </td>
              <td className="alleen-lezen">{nieuwArtikel?.eenheid || ''}</td>
              <td className="num">
                <GetalCel
                  rij={regelsVoorOrder.length}
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
              <td className="alleen-lezen">{nieuwArtikel?.naam || ''}</td>
              <td>
                <input
                  type="date"
                  value={nieuweRegel.leverdatum}
                  onChange={(e) => setNieuweRegel({ leverdatum: e.target.value })}
                />
              </td>
              <td>
                <input
                  type="text"
                  data-rij={regelsVoorOrder.length}
                  data-kolom="leverancierArtikelnummer"
                  value={nieuweRegel.leverancierArtikelnummer}
                  onChange={(e) => setNieuweRegel({ leverancierArtikelnummer: e.target.value })}
                  onKeyDown={gridToets}
                />
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td className="regel-grid-selector"></td>
              <td colSpan={4}>
                {formatNumber(regelsVoorOrder.length)} {regelsVoorOrder.length === 1 ? 'regel' : 'regels'}
              </td>
              <td className="num">{formatNumber(totaalbedrag, 2)}</td>
              <td colSpan={3}>Totaal nettobedrag ({formatCurrency(totaalbedrag)})</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="hint" style={{ marginTop: 6 }}>
        Klik in een cel om te wijzigen; de wijziging wordt opgeslagen zodra je de cel verlaat. Nieuw artikel: vul de
        onderste regel in en druk op Enter. Met ↑ en ↓ ga je naar de regel erboven of eronder.
      </p>

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

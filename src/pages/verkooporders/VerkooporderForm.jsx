import { useEffect, useMemo, useRef, useState } from 'react'
import { doc, getDoc, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import { useQueryWhere } from '../../hooks/useQueryWhere'
import { formatCurrency, formatDate, formatNumber } from '../../lib/format'
import { LEVERINGSVOORWAARDEN } from '../../lib/stamgegevens'
import {
  STATUS_LABEL,
  adresKeuzes,
  berekenTotalen,
  btwPercentage,
  klantEmailadressen,
  laadDocumentVoorAfdruk,
  laadVerkooporderVoorAfdruk,
  verkoopprijsPerStuk,
  verwijderVerkooporder,
  verwijderVerkooporderRegel,
  voegVerkooporderRegelToe,
  wijzigVerkooporder,
  wijzigVerkooporderRegel,
} from '../../lib/verkooporders'
import { documentTitel, mailVerkoopDocument } from '../../lib/verkoopMail'
import ArtikelKiezer from '../../components/ArtikelKiezer'
import MailVenster, { MailStatus } from '../../components/MailVenster'
import { GetalCel, gridToets } from '../../components/RegelGrid'
import PakbonVenster from './PakbonVenster'
import FactuurVenster from './FactuurVenster'

// Zelfde opzet als InkooporderForm: kopgegevens bovenaan, daaronder de
// orderregels als bewerkbare tabel zoals in Axapta. Vanuit de order maak je de
// orderbevestiging, pakbonnen en facturen.
export default function VerkooporderForm({ verkooporder: begin, onDone }) {
  const { isAdmin, profile } = useAuth()
  const gebruiker = profile?.naam || profile?.email

  // De order live volgen: status en mailgegevens veranderen door pakbonnen,
  // facturen en mails.
  const [order, setOrder] = useState(begin)
  useEffect(
    () =>
      onSnapshot(doc(db, 'verkooporders', begin.id), (snap) => {
        if (snap.exists()) setOrder({ id: snap.id, ...snap.data() })
      }),
    [begin.id]
  )

  const [klant, setKlant] = useState(null)
  useEffect(() => {
    if (!begin.klantId) return
    getDoc(doc(db, 'klanten', begin.klantId)).then((s) => s.exists() && setKlant({ id: s.id, ...s.data() }))
  }, [begin.klantId])

  const [kop, setKop] = useState({
    orderdatum: begin.orderdatum || '',
    gewensteLeverdatum: begin.gewensteLeverdatum || '',
    referentie: begin.referentie || '',
    contactpersoon: begin.contactpersoon || '',
    verkoper: begin.verkoper || '',
    leveringsvoorwaarde: begin.leveringsvoorwaarde || '',
    leveringswijze: begin.leveringswijze || '',
    leveradresKeuze: begin.leveradresKeuze || 'hoofdadres',
    factuuradresKeuze: begin.factuuradresKeuze || 'hoofdadres',
    opmerkingen: begin.opmerkingen || '',
  })
  const [kopGewijzigd, setKopGewijzigd] = useState(false)
  function setKopVeld(veld, waarde) {
    setKop((k) => ({ ...k, [veld]: waarde }))
    setKopGewijzigd(true)
  }

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [venster, setVenster] = useState(null) // 'pakbon' | 'factuur' | { mail: gegevens }
  const [mailen, setMailen] = useState(false)

  const { data: regels, loading: loadingRegels } = useQueryWhere('verkooporderregels', 'verkooporderId', begin.id)
  const { data: pakbonnen } = useQueryWhere('pakbonnen', 'verkooporderId', begin.id)
  const { data: facturen } = useQueryWhere('facturen', 'verkooporderId', begin.id)

  const regelsVoorOrder = useMemo(
    () => [...regels].sort((a, b) => (Number(a.regelnummer) || 0) - (Number(b.regelnummer) || 0)),
    [regels]
  )
  const hoogsteRegelnummer = regelsVoorOrder.reduce((max, r) => Math.max(max, Number(r.regelnummer) || 0), 0)
  const totalen = berekenTotalen(
    regelsVoorOrder.map((r) => ({ ...r, btwPercentage: btwPercentage(r.btwGroep, order.btwGroep) }))
  )
  const teLeveren = regelsVoorOrder.some((r) => (Number(r.geleverd) || 0) < Number(r.aantal))
  const teFactureren = regelsVoorOrder.some((r) => (Number(r.gefactureerd) || 0) < Number(r.aantal))
  const documenten = [
    ...pakbonnen.map((p) => ({ ...p, soort: 'pakbon', nummer: p.pakbonnummer, datumTekst: p.leverdatum })),
    ...facturen.map((f) => ({ ...f, soort: 'factuur', nummer: f.factuurnummer, datumTekst: f.factuurdatum })),
  ].sort((a, b) => (a.nummer < b.nummer ? -1 : 1))

  const leverKeuzes = adresKeuzes(klant, 'levering')
  const factuurKeuzes = adresKeuzes(klant, 'factuur')

  // ---------------------------------------------------------------- kop

  async function slaKopOp() {
    const lever = leverKeuzes.find((k) => k.sleutel === kop.leveradresKeuze)
    const factuur = factuurKeuzes.find((k) => k.sleutel === kop.factuuradresKeuze)
    await wijzigVerkooporder(order.id, {
      orderdatum: kop.orderdatum,
      gewensteLeverdatum: kop.gewensteLeverdatum,
      referentie: kop.referentie.trim(),
      contactpersoon: kop.contactpersoon.trim(),
      verkoper: kop.verkoper.trim(),
      leveringsvoorwaarde: kop.leveringsvoorwaarde,
      leveringswijze: kop.leveringswijze.trim(),
      leveradresKeuze: kop.leveradresKeuze,
      factuuradresKeuze: kop.factuuradresKeuze,
      // Zolang de klant nog laadt, het eerder gekozen adres laten staan.
      ...(lever ? { leveradres: lever.adres } : {}),
      ...(factuur ? { factuuradres: factuur.adres } : {}),
      opmerkingen: kop.opmerkingen.trim(),
    })
    setKopGewijzigd(false)
  }

  async function handleOpslaan() {
    setError(null)
    setSaving(true)
    try {
      await slaKopOp()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleStatus(status) {
    setError(null)
    try {
      await wijzigVerkooporder(order.id, { status })
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDelete() {
    if (!confirm(`Verkooporder ${order.ordernummer} verwijderen?`)) return
    setSaving(true)
    try {
      await verwijderVerkooporder(order.id)
      onDone?.()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  // ---------------------------------------------------------------- mailen

  async function openMail(soort, documentId) {
    setError(null)
    try {
      if (soort === 'bevestiging') {
        if (regelsVoorOrder.length === 0) throw new Error('De order heeft nog geen regels.')
        if (kopGewijzigd) await slaKopOp()
      }
      const gegevens =
        soort === 'bevestiging'
          ? await laadVerkooporderVoorAfdruk(order.id)
          : await laadDocumentVoorAfdruk(soort === 'factuur' ? 'facturen' : 'pakbonnen', documentId)
      setVenster({ mail: gegevens })
    } catch (err) {
      setError(err.message)
    }
  }

  async function verstuurMail(ontvangers) {
    setMailen(true)
    try {
      await mailVerkoopDocument({
        gegevens: venster.mail,
        ontvangers,
        gebruiker,
        gebruikerEmail: profile?.email,
        handtekening: profile?.handtekening,
      })
      setVenster(null)
    } finally {
      setMailen(false)
    }
  }

  // ---------------------------------------------------------------- regels

  const [regelSaving, setRegelSaving] = useState(false)
  const [regelError, setRegelError] = useState(null)
  const [geselecteerdeRegel, setGeselecteerdeRegel] = useState(null)

  const LEGE_REGEL = { artikelnummer: '', artikel: null, aantal: '', prijs: '', leverdatum: '', klantArtikelnummer: '' }
  const [nieuweRegel, setNieuweRegelState] = useState(LEGE_REGEL)
  // Ook in een ref, zodat Enter direct na het verlaten van een cel de laatste invoer meeneemt.
  const nieuweRegelRef = useRef(LEGE_REGEL)
  function setNieuweRegel(updates) {
    nieuweRegelRef.current = { ...nieuweRegelRef.current, ...updates }
    setNieuweRegelState(nieuweRegelRef.current)
  }
  const nieuwArtikel = nieuweRegel.artikel

  function kiesArtikel(artikel) {
    const updates = { artikel }
    if (artikel) updates.prijs = verkoopprijsPerStuk(artikel)
    setNieuweRegel(updates)
  }

  async function handleRegelToevoegen() {
    setRegelError(null)
    const r = nieuweRegelRef.current
    const artikel = r.artikel
    if (!artikel) {
      setRegelError(
        r.artikelnummer.trim() ? `Artikel "${r.artikelnummer.trim()}" bestaat niet.` : 'Vul een artikelnummer in.'
      )
      return
    }
    setRegelSaving(true)
    try {
      await voegVerkooporderRegelToe({
        verkooporder: { ...order, gewensteLeverdatum: kop.gewensteLeverdatum },
        artikel,
        aantal: r.aantal,
        prijs: r.prijs === '' ? 0 : r.prijs,
        leverdatum: r.leverdatum,
        klantArtikelnummer: r.klantArtikelnummer,
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
      await wijzigVerkooporderRegel(regel.id, { [veld]: value.trim() })
    } catch (err) {
      setRegelError(err.message)
    }
  }

  async function handleRegelVeldChange(regel, veld, value) {
    if (value === '' || Number(value) === Number(regel[veld])) return
    if (veld === 'aantal') {
      if (!(Number(value) > 0)) {
        setRegelError('Hoeveelheid moet groter dan 0 zijn.')
        return
      }
      const minimaal = Math.max(Number(regel.geleverd) || 0, Number(regel.gefactureerd) || 0)
      if (Number(value) < minimaal) {
        setRegelError(`Er is al ${formatNumber(minimaal)} geleverd of gefactureerd; minder kan niet.`)
        return
      }
    }
    if (veld === 'prijs' && (Number(regel.gefactureerd) || 0) > 0) {
      setRegelError('Let op: deze regel is al (deels) gefactureerd; de nieuwe prijs geldt alleen voor wat nog gefactureerd wordt.')
    }
    try {
      await wijzigVerkooporderRegel(regel.id, { [veld]: Number(value) || 0 })
    } catch (err) {
      setRegelError(err.message)
    }
  }

  async function handleRegelVerwijderen(regel) {
    if (!confirm(`Regel ${regel.artikelnummer} verwijderen uit deze verkooporder?`)) return
    try {
      await verwijderVerkooporderRegel(regel)
      setGeselecteerdeRegel(null)
    } catch (err) {
      setRegelError(err.message)
    }
  }

  // ---------------------------------------------------------------- weergave

  const orderOpen = order.status !== 'geannuleerd'

  return (
    <div>
      {error && <div className="banner banner-danger">{error}</div>}

      <div className="field-row">
        <div className="field">
          <label>Klant</label>
          <input type="text" value={`${order.klantcode} — ${order.klantNaam}`} disabled />
        </div>
        <div className="field">
          <label>Status</label>
          <select value={order.status} onChange={(e) => handleStatus(e.target.value)}>
            {Object.entries(STATUS_LABEL).map(([s, label]) => (
              <option key={s} value={s}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Orderdatum</label>
          <input type="date" value={kop.orderdatum} onChange={(e) => setKopVeld('orderdatum', e.target.value)} />
        </div>
        <div className="field">
          <label>Gewenste leverdatum</label>
          <input
            type="date"
            value={kop.gewensteLeverdatum}
            onChange={(e) => setKopVeld('gewensteLeverdatum', e.target.value)}
          />
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label>Uw referentie</label>
          <input
            type="text"
            value={kop.referentie}
            onChange={(e) => setKopVeld('referentie', e.target.value)}
            placeholder="Ordernummer van de klant"
          />
        </div>
        <div className="field">
          <label>Contactpersoon</label>
          <input type="text" value={kop.contactpersoon} onChange={(e) => setKopVeld('contactpersoon', e.target.value)} />
        </div>
        <div className="field">
          <label>Behandeld door</label>
          <input type="text" value={kop.verkoper} onChange={(e) => setKopVeld('verkoper', e.target.value)} />
        </div>
        <div className="field">
          <label>Leveringsvoorwaarde</label>
          <select value={kop.leveringsvoorwaarde} onChange={(e) => setKopVeld('leveringsvoorwaarde', e.target.value)}>
            <option value="">—</option>
            {Object.entries(LEVERINGSVOORWAARDEN).map(([code, omschrijving]) => (
              <option key={code} value={code}>
                {code} — {omschrijving}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Verzendwijze</label>
          <input
            type="text"
            value={kop.leveringswijze}
            onChange={(e) => setKopVeld('leveringswijze', e.target.value)}
            placeholder="bijv. TNT, Afhalen"
          />
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label>Leveradres</label>
          <select value={kop.leveradresKeuze} onChange={(e) => setKopVeld('leveradresKeuze', e.target.value)}>
            {leverKeuzes.map((k) => (
              <option key={k.sleutel} value={k.sleutel}>
                {k.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Factuuradres</label>
          <select value={kop.factuuradresKeuze} onChange={(e) => setKopVeld('factuuradresKeuze', e.target.value)}>
            {factuurKeuzes.map((k) => (
              <option key={k.sleutel} value={k.sleutel}>
                {k.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field">
        <label>Opmerkingen (komen onder de regels op de orderbevestiging)</label>
        <textarea rows={2} value={kop.opmerkingen} onChange={(e) => setKopVeld('opmerkingen', e.target.value)} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
        <a
          className="btn btn-secondary btn-sm"
          href={`/verkooporders/${order.id}/afdruk`}
          target="_blank"
          rel="noreferrer"
        >
          Orderbevestiging (PDF)
        </a>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => openMail('bevestiging')}>
          Bevestiging mailen
        </button>
        <a
          className="btn btn-secondary btn-sm"
          href={`/verkooporders/${order.id}/picklijst`}
          target="_blank"
          rel="noreferrer"
          title={!teLeveren ? 'Alles is al geleverd' : 'Picklijst voor het magazijn'}
        >
          Picklijst
        </a>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setVenster('pakbon')}
          disabled={!orderOpen || !teLeveren}
          title={!teLeveren ? 'Alles is al geleverd' : undefined}
        >
          Pakbon maken
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setVenster('factuur')}
          disabled={!orderOpen || !teFactureren}
          title={!teFactureren ? 'Alles is al gefactureerd' : undefined}
        >
          Factuur maken
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={handleOpslaan} disabled={saving}>
          {saving ? 'Opslaan…' : 'Opslaan'}
        </button>
      </div>

      <MailStatus document={order} />

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
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleRegelToevoegen}
            disabled={regelSaving}
          >
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
              <th>Art.nr. klant</th>
              <th className="num">Geleverd</th>
              <th className="num">Gefactureerd</th>
            </tr>
          </thead>
          <tbody>
            {loadingRegels ? (
              <tr>
                <td colSpan={11} className="regel-grid-leeg">
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
                      data-kolom="klantArtikelnummer"
                      defaultValue={r.klantArtikelnummer || ''}
                      onKeyDown={gridToets}
                      onBlur={(e) => handleRegelTekstChange(r, 'klantArtikelnummer', e.target.value)}
                    />
                  </td>
                  <td className="num alleen-lezen">{formatNumber(r.geleverd || 0, 0)}</td>
                  <td className="num alleen-lezen">{formatNumber(r.gefactureerd || 0, 0)}</td>
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
                  data-kolom="klantArtikelnummer"
                  value={nieuweRegel.klantArtikelnummer}
                  onChange={(e) => setNieuweRegel({ klantArtikelnummer: e.target.value })}
                  onKeyDown={gridToets}
                />
              </td>
              <td className="alleen-lezen"></td>
              <td className="alleen-lezen"></td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td className="regel-grid-selector"></td>
              <td colSpan={4}>
                {formatNumber(regelsVoorOrder.length)} {regelsVoorOrder.length === 1 ? 'regel' : 'regels'}
              </td>
              <td className="num">{formatNumber(totalen.netto, 2)}</td>
              <td colSpan={5}>
                Totaal netto {formatCurrency(totalen.netto)} · BTW {formatCurrency(totalen.btwTotaal)} · incl. BTW{' '}
                {formatCurrency(totalen.totaal)}
                {order.valuta && order.valuta !== 'EUR' && ` (bedragen in ${order.valuta})`}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="hint" style={{ marginTop: 6 }}>
        Klik in een cel om te wijzigen; de wijziging wordt opgeslagen zodra je de cel verlaat. Nieuw artikel: vul de
        onderste regel in en druk op Enter. Met ↑ en ↓ ga je naar de regel erboven of eronder.
      </p>

      {documenten.length > 0 && (
        <>
          <div className="regel-grid-kop">
            <h3>Pakbonnen en facturen</h3>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Document</th>
                <th>Datum</th>
                <th className="num">Bedrag incl. BTW</th>
                <th>Mail</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {documenten.map((d) => (
                <tr key={d.id} style={{ cursor: 'default' }}>
                  <td>
                    {d.soort === 'factuur' ? 'Factuur' : 'Pakbon'} {d.nummer}
                    {d.locatieCode && <span className="hint"> · afgeboekt van {d.locatieCode}</span>}
                  </td>
                  <td>{formatDate(d.datumTekst)}</td>
                  <td className="num">{d.soort === 'factuur' ? formatNumber(d.totaal, 2) : ''}</td>
                  <td>
                    <MailStatus document={d} compact />
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <a
                      className="btn btn-ghost btn-sm"
                      href={`/${d.soort === 'factuur' ? 'facturen' : 'pakbonnen'}/${d.id}/afdruk`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      PDF
                    </a>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => openMail(d.soort, d.id)}>
                      Mailen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <div className="modal-actions" style={{ justifyContent: isAdmin ? 'space-between' : 'flex-end' }}>
        {isAdmin && (
          <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={saving}>
            Verkooporder verwijderen
          </button>
        )}
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            if (kopGewijzigd && !confirm('De kopgegevens zijn gewijzigd maar niet opgeslagen. Toch sluiten?')) return
            onDone?.()
          }}
          disabled={saving}
        >
          Sluiten
        </button>
      </div>

      {venster === 'pakbon' && (
        <PakbonVenster
          order={order}
          regels={regelsVoorOrder}
          gebruiker={gebruiker}
          onKlaar={(pakbon) => {
            setVenster(null)
            if (pakbon && confirm(`Pakbon ${pakbon.pakbonnummer} is gemaakt. Nu naar de klant mailen?`)) {
              openMail('pakbon', pakbon.id)
            }
          }}
        />
      )}

      {venster === 'factuur' && (
        <FactuurVenster
          order={order}
          regels={regelsVoorOrder}
          gebruiker={gebruiker}
          onKlaar={(factuur) => {
            setVenster(null)
            if (factuur && confirm(`Factuur ${factuur.factuurnummer} is gemaakt. Nu naar de klant mailen?`)) {
              openMail('factuur', factuur.id)
            }
          }}
        />
      )}

      {venster?.mail && (
        <MailVenster
          titel={`${documentTitel(venster.mail)} mailen`}
          standaardAdressen={klantEmailadressen(klant || venster.mail.klant, venster.mail.soort)}
          eerderGemaildOp={(venster.mail.document || venster.mail.order)?.gemaildOp}
          adressenHint="vaste adressen stel je in bij de klant (tabblad Contactgegevens)"
          gebruikerEmail={profile?.email}
          bezig={mailen}
          onVersturen={verstuurMail}
          onAnnuleren={() => setVenster(null)}
        />
      )}
    </div>
  )
}

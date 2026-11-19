import { useEffect, useMemo, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import { formatNumber, formatPrijs } from '../../lib/format'
import { VALUTA } from '../../lib/stamgegevens'
import { hoofdadres, klantEmailadressen } from '../../lib/verkooporders'
import KlantKiezerVenster from './KlantKiezerVenster'
import AanbiedingVoorwaarden from './AanbiedingVoorwaarden'
import {
  stukSeconden,
  STATUS_LABEL,
  berekenPrijzen,
  calculatieVelden,
  kostenOpbouw,
  laadCalculatieVoorAfdruk,
  leesAantallen,
  prijsUitBedrag,
  prijsUitMarge,
  prijsUitOpslag,
  verwijderCalculatie,
  wijzigCalculatie,
} from '../../lib/calculaties'
import { aanbiedingMailTekst, aanbiedingTitel, mailAanbieding } from '../../lib/calculatieMail'
import { GetalCel } from '../../components/RegelGrid'
import MailVenster, { MailStatus } from '../../components/MailVenster'
import { DocumentenTab } from '../artikelen/ArtikelForm'
import KostenTabellen from './KostenTabellen'

const TABS = [
  { id: 'artikel', label: '1. Artikel en tekening' },
  { id: 'calculatie', label: '2. Calculatie' },
  { id: 'prijs', label: '3. Prijs en voorwaarden' },
]

function naarForm(c) {
  return {
    klantId: c.klantId || '',
    klantcode: c.klantcode || '',
    klantNaam: c.klantNaam || '',
    adres: { naam: c.klantNaam || '', straat: '', postcode: '', plaats: '', land: '', ...(c.adres || {}) },
    taal: c.taal || 'nl',
    omschrijving: c.omschrijving || '',
    klantArtikelnummer: c.klantArtikelnummer || '',
    revisie: c.revisie || '',
    contactpersoon: c.contactpersoon || '',
    referentie: c.referentie || '',
    aantallen: (c.aantallen || []).join(', '),
    // Tijd per stuk in seconden (oude calculaties hadden minuten).
    bewerkingen: (c.bewerkingen || []).map(({ stukMinuten, ...b }) => ({
      ...b,
      stukSeconden: stukSeconden({ ...b, stukMinuten }),
    })),
    kosten: (c.kosten || []).map((k) => ({ ...k })),
    marge: c.marge ?? 0,
    prijzen: { ...(c.prijzen || {}) },
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

function euro(waarde, decimalen = 2) {
  return `€ ${formatNumber(waarde, decimalen)}`
}

// Een calculatie in de volgorde van het werk: artikel en tekening, de
// calculatie zelf, de prijs met de voorwaarden, en dan de aanbieding mailen.
export default function CalculatieForm({ calculatie: start, startFout = null, onDone }) {
  const { profile, isAdmin } = useAuth()
  const gebruiker = profile?.naam || profile?.email

  // Live volgen: status en mailgegevens veranderen na het mailen.
  const [calculatie, setCalculatie] = useState(start)
  useEffect(
    () =>
      onSnapshot(doc(db, 'calculaties', start.id), (snap) => {
        if (snap.exists()) setCalculatie({ id: snap.id, ...snap.data() })
      }),
    [start.id]
  )
  const [artikel, setArtikel] = useState(null)
  useEffect(() => {
    if (!start.artikelId) return undefined
    return onSnapshot(doc(db, 'artikelen', start.artikelId), (snap) => {
      setArtikel(snap.exists() ? { id: snap.id, ...snap.data() } : null)
    })
  }, [start.artikelId])
  const [klant, setKlant] = useState(null)
  useEffect(() => {
    // Volgt de opgeslagen klant, ook nadat die gewijzigd is.
    if (!calculatie.klantId) return undefined
    return onSnapshot(doc(db, 'klanten', calculatie.klantId), (snap) => {
      setKlant(snap.exists() ? { id: snap.id, ...snap.data() } : null)
    })
  }, [calculatie.klantId])

  const [form, setForm] = useState(() => naarForm(start))
  const [gewijzigd, setGewijzigd] = useState(false)
  const [activeTab, setActiveTab] = useState('artikel')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(startFout)
  const [melding, setMelding] = useState(null)
  const [mail, setMail] = useState(null) // { gegevens, tekst }
  const [mailen, setMailen] = useState(false)
  const [klantKiezen, setKlantKiezen] = useState(false)

  // Andere klant: naam, adres, contactpersoon en taal van de aanbieding gaan mee.
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

  // De status verandert na het mailen buiten het formulier om.
  useEffect(() => {
    if (!gewijzigd) setForm((f) => ({ ...f, status: calculatie.status || f.status }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calculatie.status])

  function set(veld, waarde) {
    setForm((f) => ({ ...f, [veld]: waarde }))
    setGewijzigd(true)
    setMelding(null)
  }

  // ---------------------------------------------------------------- prijstabel
  // Elke aanpassing in de prijstabel wordt een vaste prijs per stuk voor dat aantal.

  function zetPrijs(aantal, prijs) {
    set('prijzen', { ...form.prijzen, [String(aantal)]: prijs })
  }

  // Een getalcel meldt zich bij elk verlaten, ook zonder wijziging. Alleen een
  // andere waarde telt; een leeggemaakte cel gaat terug naar de adviesprijs.
  function prijsCel(aantal, getoond, nieuw, naarPrijs) {
    if (nieuw === '') {
      if (form.prijzen[String(aantal)] !== undefined) naarAdviesprijs(aantal)
      return
    }
    if (Number(nieuw) === Number(getoond)) return
    probeer(() => zetPrijs(aantal, naarPrijs(Number(nieuw))))
  }

  function naarAdviesprijs(aantal) {
    const { [String(aantal)]: _weg, ...rest } = form.prijzen
    set('prijzen', rest)
  }

  function zetAantallen(lijst, prijzen = form.prijzen) {
    const uniek = [...new Set(lijst.filter((n) => n > 0))].sort((a, b) => a - b)
    setForm((f) => ({ ...f, aantallen: uniek.join(', '), prijzen }))
    setGewijzigd(true)
    setMelding(null)
  }

  // Ander aantal: een eigen prijs verhuist mee naar het nieuwe aantal.
  function wijzigAantal(oud, nieuw) {
    if (!(nieuw > 0) || nieuw === oud) return
    const { [String(oud)]: prijs, ...rest } = form.prijzen
    const prijzen =
      prijs === undefined || rest[String(nieuw)] !== undefined ? rest : { ...rest, [String(nieuw)]: prijs }
    zetAantallen(
      leesAantallen(form.aantallen).map((a) => (a === oud ? nieuw : a)),
      prijzen
    )
  }

  function verwijderAantal(aantal) {
    const { [String(aantal)]: _weg, ...rest } = form.prijzen
    zetAantallen(
      leesAantallen(form.aantallen).filter((a) => a !== aantal),
      rest
    )
  }

  const [nieuwAantal, setNieuwAantal] = useState('')
  function voegAantalToe() {
    const n = Number(String(nieuwAantal).replace(',', '.'))
    if (!(n > 0)) return
    zetAantallen([...leesAantallen(form.aantallen), n])
    setNieuwAantal('')
  }

  function probeer(fn) {
    try {
      setError(null)
      fn()
    } catch (err) {
      setError(err.message)
    }
  }

  // Wat er nu in het formulier staat, doorgerekend.
  const velden = useMemo(() => calculatieVelden(form), [form])
  const aantallenLijst = velden.aantallen
  const opbouw = useMemo(() => kostenOpbouw(velden), [velden])
  const regels = useMemo(() => berekenPrijzen(velden), [velden])

  async function slaOp() {
    setError(null)
    setSaving(true)
    try {
      await wijzigCalculatie(calculatie, form)
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
    if (regels.length === 0) throw new Error('Vul minimaal één aantal in.')
    if (regels.some((r) => !(r.prijs > 0))) {
      throw new Error('Nog niet elk aantal heeft een prijs. Vul de calculatie of de prijs in.')
    }
  }

  async function bekijkAanbieding() {
    setError(null)
    try {
      controleerAanbieding()
      if (gewijzigd && !(await slaOp())) return
      window.open(`/calculaties/${calculatie.id}/afdruk`, '_blank', 'noopener')
    } catch (err) {
      setError(err.message)
    }
  }

  async function openMail() {
    setError(null)
    try {
      controleerAanbieding()
      if (gewijzigd && !(await slaOp())) return
      const gegevens = await laadCalculatieVoorAfdruk(calculatie.id)
      setMail({
        gegevens,
        tekst: aanbiedingMailTekst({
          gegevens,
          gebruiker,
          handtekening: profile?.handtekening,
        }),
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
      setMelding('De aanbieding is klaargezet om te mailen en opgeslagen bij de calculatie.')
    } finally {
      setMailen(false)
    }
  }

  async function handleDelete() {
    if (!confirm(`Calculatie ${calculatie.calculatienummer} verwijderen? Het artikel en de tekening blijven staan.`))
      return
    setError(null)
    try {
      await verwijderCalculatie(calculatie)
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
        <div className="field">
          <label>Artikel</label>
          <input type="text" value={calculatie.artikelnummer || ''} disabled />
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

      <MailStatus document={calculatie} titel="Aanbieding gemaild" />

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

      <div className="tab-paneel">
        {activeTab === 'artikel' && (
          <>
            <div className="field-row">
              <div className="field">
                <label>Ons artikelnummer</label>
                <input type="text" value={calculatie.artikelnummer || ''} disabled />
                <span className="hint">Eerste 3 letters van de klant + het artikelnummer van de klant.</span>
              </div>
              <div className="field">
                <label>Artikelnummer van de klant</label>
                <input
                  type="text"
                  value={form.klantArtikelnummer}
                  onChange={(e) => set('klantArtikelnummer', e.target.value)}
                />
              </div>
              <div className="field" style={{ maxWidth: 140 }}>
                <label>Revisie tekening</label>
                <input type="text" value={form.revisie} onChange={(e) => set('revisie', e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label>Omschrijving</label>
              <input type="text" value={form.omschrijving} onChange={(e) => set('omschrijving', e.target.value)} />
              <span className="hint">Staat op de aanbieding en is de naam van het artikel.</span>
            </div>

            {artikel ? (
              <DocumentenTab artikel={artikel} titel="Tekening" />
            ) : (
              <div className="banner banner-warning">
                Het artikel {calculatie.artikelnummer} bestaat niet meer; een tekening toevoegen kan daardoor niet.
              </div>
            )}
          </>
        )}

        {activeTab === 'calculatie' && (
          <>
            <div className="field-row">
              <div className="field">
                <label>Aantallen</label>
                <input
                  type="text"
                  value={form.aantallen}
                  onChange={(e) => set('aantallen', e.target.value)}
                  placeholder="bijv. 10, 50, 100"
                />
                <span className="hint">
                  Voor elk aantal komt er een prijs op de aanbieding
                  {leesAantallen(form.aantallen).length ? `: ${leesAantallen(form.aantallen).join(', ')} stuks.` : '.'}
                </span>
              </div>
            </div>

            <KostenTabellen
              bewerkingen={form.bewerkingen}
              kosten={form.kosten}
              aantallen={aantallenLijst}
              wijzig={set}
            />

            {regels.length > 0 && (
              <div className="regel-grid-wrap" style={{ marginTop: 14 }}>
                <table className="regel-grid">
                  <tbody>
                    <tr>
                      <td style={{ fontWeight: 600 }}>Kostprijs per stuk (bewerkingen + materiaal en kosten)</td>
                      {regels.map((r) => (
                        <td key={r.aantal} className="num" style={{ fontWeight: 600 }}>
                          bij {formatNumber(r.aantal, 0)}: {euro(r.kostprijs, 4)}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            <p className="hint" style={{ marginTop: 8 }}>
              Eenmalig per serie (instellen, gereedschap): <strong>{euro(opbouw.vast)}</strong> · per stuk:{' '}
              <strong>{euro(opbouw.perStuk, 4)}</strong>. De prijs voor de klant stel je in op het tabblad Prijs en
              voorwaarden.
            </p>

            <div className="field" style={{ marginTop: 14 }}>
              <label>Notities bij de calculatie (intern)</label>
              <textarea rows={3} value={form.notities} onChange={(e) => set('notities', e.target.value)} />
              <span className="hint">Komt niet op de aanbieding.</span>
            </div>
          </>
        )}

        {activeTab === 'prijs' && (
          <>
            <div className="field-row">
              <div className="field">
                <label>Standaard opslag op de kostprijs (%)</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={form.marge}
                  onChange={(e) => set('marge', e.target.value)}
                />
                <span className="hint">Geldt voor elk aantal zonder eigen prijs (de adviesprijs).</span>
              </div>
              <div className="field">
                <label>Valuta</label>
                <select value={form.valuta} onChange={(e) => set('valuta', e.target.value)}>
                  {VALUTA.map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="regel-grid-kop">
              <h3>Prijs per aantal</h3>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="number"
                  min="1"
                  step="any"
                  value={nieuwAantal}
                  onChange={(e) => setNieuwAantal(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return
                    e.preventDefault()
                    voegAantalToe()
                  }}
                  placeholder="Aantal"
                  aria-label="Aantal toevoegen"
                  style={{ width: 100 }}
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={voegAantalToe}
                  disabled={!(Number(String(nieuwAantal).replace(',', '.')) > 0)}
                >
                  + Aantal
                </button>
              </div>
            </div>
            <div className="regel-grid-wrap">
              <table className="regel-grid">
                <thead>
                  <tr>
                    <th className="num">Aantal</th>
                    <th className="num">Eenmalig per stuk</th>
                    <th className="num">Kosten per stuk</th>
                    <th className="num">Kostprijs</th>
                    <th className="num">Opslag (%)</th>
                    <th className="num">Prijs per stuk ({form.valuta})</th>
                    <th className="num">Marge (%)</th>
                    <th className="num">Bedrag ({form.valuta})</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {regels.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="regel-grid-leeg">
                        Nog geen aantallen. Vul hierboven een aantal in en kies + Aantal.
                      </td>
                    </tr>
                  ) : (
                    regels.map((r) => (
                      <tr key={r.aantal}>
                        <td className="num">
                          <GetalCel
                            value={r.aantal}
                            decimalen={0}
                            maxDecimalen={2}
                            onCommit={(v) => wijzigAantal(r.aantal, v)}
                          />
                        </td>
                        <td className="num alleen-lezen">{formatNumber(r.vastPerStuk, 2)}</td>
                        <td className="num alleen-lezen">{formatNumber(r.perStuk, 2)}</td>
                        <td className="num alleen-lezen">{formatNumber(r.kostprijs, 2)}</td>
                        <td className="num">
                          <GetalCel
                            value={Math.round(r.opslagPct * 10) / 10}
                            decimalen={1}
                            maxDecimalen={2}
                            onCommit={(v) =>
                              prijsCel(r.aantal, Math.round(r.opslagPct * 10) / 10, v, (o) =>
                                prijsUitOpslag(r.kostprijs, o)
                              )
                            }
                          />
                        </td>
                        <td className="num">
                          <GetalCel
                            value={r.prijs}
                            decimalen={2}
                            maxDecimalen={4}
                            onCommit={(v) => prijsCel(r.aantal, r.prijs, v, (p) => p)}
                          />
                        </td>
                        <td className="num">
                          <GetalCel
                            value={Math.round(r.margePct * 10) / 10}
                            decimalen={1}
                            maxDecimalen={2}
                            onCommit={(v) =>
                              prijsCel(r.aantal, Math.round(r.margePct * 10) / 10, v, (m) =>
                                prijsUitMarge(r.kostprijs, m)
                              )
                            }
                          />
                        </td>
                        <td className="num">
                          <GetalCel
                            value={Math.round(r.bedrag * 100) / 100}
                            decimalen={2}
                            onCommit={(v) =>
                              prijsCel(r.aantal, Math.round(r.bedrag * 100) / 100, v, (b) =>
                                prijsUitBedrag(b, r.aantal)
                              )
                            }
                          />
                        </td>
                        <td className="alleen-lezen" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {r.handmatig && (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => naarAdviesprijs(r.aantal)}
                              title={`Terug naar de adviesprijs (${formatNumber(r.advies, 2)})`}
                            >
                              Advies
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => verwijderAantal(r.aantal)}
                            aria-label={`Aantal ${r.aantal} verwijderen`}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <p className="hint" style={{ marginTop: 8 }}>
              Pas het aantal, de opslag, de prijs per stuk, de marge of het bedrag aan; de rest rekent mee. Opslag is
              over de kostprijs, marge over de verkoopprijs. Een aangepaste regel houdt zijn eigen prijs; met Advies
              gaat hij terug naar de standaard opslag.
              {Object.keys(velden.prijzen).length > 1 && (
                <>
                  {' '}
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => set('prijzen', {})}>
                    Alles terug naar adviesprijzen
                  </button>
                </>
              )}
            </p>

            <AanbiedingVoorwaarden form={form} set={set} calculatiedatum={calculatie.calculatiedatum} />
          </>
        )}
      </div>

      <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
        <div>
          {isAdmin && (
            <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={saving}>
              Verwijderen
            </button>
          )}
        </div>
        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            justifyContent: 'flex-end',
          }}
        >
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
        />
      )}

      {mail && (
        <MailVenster
          titel={`${aanbiedingTitel(mail.gegevens)} mailen`}
          standaardAdressen={klantEmailadressen(mail.gegevens.klant || klant, 'bevestiging')}
          eerderGemaildOp={calculatie.gemaildOp}
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
              {mail.gegevens.regels.length === 1 ? 'prijs' : 'prijzen'}, vanaf{' '}
              {mail.gegevens.calculatie.valuta || 'EUR'}{' '}
              {formatPrijs(Math.min(...mail.gegevens.regels.map((r) => r.prijs)))} per stuk.
            </span>
          </div>
        </MailVenster>
      )}
    </form>
  )
}

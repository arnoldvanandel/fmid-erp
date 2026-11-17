import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useCollection } from '../../hooks/useCollection'
import { formatDate, formatPrijs } from '../../lib/format'
import {
  STATUS_BADGE,
  STATUS_LABEL,
  isArtikelAanbieding,
  klantVoorvoegsel,
  maakArtikelAanbieding,
  maakCalculatie,
  stelArtikelnummerVoor,
} from '../../lib/calculaties'
import { haalArtikelOpNummer } from '../../lib/artikelZoeken'
import { uploadArtikelDocument } from '../../lib/documenten'
import { leesTekening } from '../../lib/tekeningLezen'
import Modal from '../../components/Modal'
import CalculatieForm from './CalculatieForm'
import ArtikelAanbiedingForm from './ArtikelAanbiedingForm'
import KlantKiezerVenster from './KlantKiezerVenster'

// Klant waarvan de naam op de tekening staat (bijv. in de copyrightregel).
// Alleen bij precies één treffer, anders kiest de gebruiker zelf.
function klantOpTekening(klanten, tekst) {
  const splits = (t) =>
    String(t || '')
      .toLowerCase()
      .split(/[^a-z0-9à-ÿ]+/)
  const woorden = new Set(splits(tekst))
  const treffers = klanten.filter((k) => {
    if (k.geblokkeerd) return false
    const woord = splits(k.zoeknaam || k.naam).find((w) => w.length >= 4)
    return woord && woorden.has(woord)
  })
  return treffers.length === 1 ? treffers[0] : null
}

// Stap 1 en 2 van de calculatie: de tekening erin slepen, klant kiezen en het
// artikel aanmaken. Nummer en omschrijving komen uit het titelblok van de
// tekening (lib/tekeningLezen.js). Ons artikelnummer is de eerste 3 letters
// van de klant + het artikelnummer van de klant.
function NieuweCalculatieForm({ onCreated, onCancel }) {
  const { profile } = useAuth()
  const { data: klanten, loading } = useCollection('klanten', { orderByField: 'klantcode' })
  const [zoek, setZoek] = useState('')
  const [klantId, setKlantId] = useState('')
  const [klantArtikelnummer, setKlantArtikelnummer] = useState('')
  const [revisie, setRevisie] = useState('')
  const [tekening, setTekening] = useState(null) // { file, gelezen }
  const [lezen, setLezen] = useState(false)
  const [slepen, setSlepen] = useState(false)
  const sleepTeller = useRef(0)
  const fileInputRef = useRef(null)
  const [artikelnummer, setArtikelnummer] = useState('')
  const [zelfIngevuld, setZelfIngevuld] = useState(false)
  const [omschrijving, setOmschrijving] = useState('')
  const [bestaand, setBestaand] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const gefilterd = useMemo(() => {
    const q = zoek.trim().toLowerCase()
    const actief = klanten.filter((k) => !k.geblokkeerd)
    if (!q) return actief
    return actief.filter(
      (k) =>
        k.klantcode?.toLowerCase().includes(q) ||
        k.naam?.toLowerCase().includes(q) ||
        k.zoeknaam?.toLowerCase().includes(q) ||
        k.plaats?.toLowerCase().includes(q)
    )
  }, [klanten, zoek])
  const klant = klanten.find((k) => k.id === klantId)

  // Voorstel voor ons artikelnummer, tot de gebruiker het zelf aanpast.
  useEffect(() => {
    if (!zelfIngevuld) setArtikelnummer(stelArtikelnummerVoor(klant, klantArtikelnummer))
  }, [klant, klantArtikelnummer, zelfIngevuld])

  // Bestaat het artikel al, dan komt de calculatie bij dat artikel.
  useEffect(() => {
    const nummer = artikelnummer.trim()
    setBestaand(null)
    if (!nummer) return undefined
    let actief = true
    const timer = setTimeout(() => {
      haalArtikelOpNummer(nummer)
        .then((a) => actief && setBestaand(a || null))
        .catch(() => {})
    }, 400)
    return () => {
      actief = false
      clearTimeout(timer)
    }
  }, [artikelnummer])

  // Tekening gekozen of hierheen gesleept: titelblok lezen en de velden invullen.
  async function kiesTekening(bestanden) {
    const file = [...(bestanden || [])][0]
    if (!file) return
    setError(null)
    if (file.type !== 'application/pdf') {
      setError('Alleen PDF-bestanden zijn toegestaan.')
      return
    }
    setLezen(true)
    try {
      const gelezen = await leesTekening(file)
      setTekening({ file, gelezen })
      if (gelezen.klantArtikelnummer) setKlantArtikelnummer(gelezen.klantArtikelnummer)
      setRevisie(gelezen.revisie || '')
      if (gelezen.omschrijving) setOmschrijving(gelezen.omschrijving)
      if (!klantId) {
        const gevonden = klantOpTekening(klanten, gelezen.tekst)
        if (gevonden) setKlantId(gevonden.id)
      }
    } finally {
      setLezen(false)
    }
  }

  const sleeptBestanden = (e) => [...(e.dataTransfer?.types || [])].includes('Files')
  const sleepProps = {
    onDragEnter: (e) => {
      if (!sleeptBestanden(e)) return
      e.preventDefault()
      sleepTeller.current += 1
      setSlepen(true)
    },
    onDragOver: (e) => {
      if (!sleeptBestanden(e)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    },
    onDragLeave: (e) => {
      if (!sleeptBestanden(e)) return
      sleepTeller.current = Math.max(0, sleepTeller.current - 1)
      if (sleepTeller.current === 0) setSlepen(false)
    },
    onDrop: (e) => {
      if (!sleeptBestanden(e)) return
      e.preventDefault()
      sleepTeller.current = 0
      setSlepen(false)
      kiesTekening(e.dataTransfer.files)
    },
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      const gebruiker = profile?.naam || profile?.email
      const { calculatie } = await maakCalculatie({
        klant,
        artikelnummer,
        klantArtikelnummer,
        revisie,
        omschrijving: omschrijving.trim() || bestaand?.naam || '',
        gebruiker,
      })
      // De tekening hoort bij het artikel. Lukt het uploaden niet, dan bestaat
      // de calculatie al wel; de tekening kan er daarna alsnog bij.
      let uploadFout = null
      if (tekening?.file) {
        try {
          await uploadArtikelDocument({
            artikel: { id: calculatie.artikelId, artikelnummer: calculatie.artikelnummer },
            file: tekening.file,
            gebruiker,
          })
        } catch (err) {
          uploadFout = `De calculatie is aangemaakt, maar de tekening is niet opgeslagen: ${err.message}`
        }
      }
      onCreated(calculatie, uploadFout)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className={'sleepvak' + (slepen ? ' sleepvak-actief' : '')} {...sleepProps}>
      {slepen && <div className="sleepvak-melding">Laat los om de tekening te lezen</div>}
      {error && <div className="banner banner-danger">{error}</div>}

      <div className="tekening-kiezer">
        <div>
          {lezen ? (
            'Tekening lezen…'
          ) : tekening ? (
            <>
              <strong>{tekening.file.name}</strong>
              <div className="hint">
                {tekening.gelezen.klantArtikelnummer || tekening.gelezen.omschrijving
                  ? `Nummer en omschrijving overgenomen uit de ${tekening.gelezen.bron || 'tekening'}. Controleer ze hieronder.`
                  : 'Op deze tekening is geen nummer of benaming gevonden. Vul ze hieronder zelf in.'}
              </div>
            </>
          ) : (
            <>
              <strong>Sleep de tekening (PDF) hierheen</strong>
              <div className="hint">Het artikelnummer en de omschrijving worden van de tekening overgenomen.</div>
            </>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {tekening && !lezen && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTekening(null)}>
              Weghalen
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={lezen || saving}
          >
            {tekening ? 'Andere tekening' : 'Tekening kiezen'}
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          style={{ display: 'none' }}
          onChange={(e) => {
            const bestanden = [...(e.target.files || [])]
            e.target.value = ''
            kiesTekening(bestanden)
          }}
        />
      </div>

      {!loading && klanten.length === 0 ? (
        <div className="banner banner-danger">Er zijn nog geen klanten aangemaakt. Voeg eerst een klant toe.</div>
      ) : (
        <>
          <div className="field">
            <label>Zoek klant</label>
            <input
              type="text"
              value={zoek}
              onChange={(e) => setZoek(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return
                e.preventDefault()
                if (gefilterd.length === 1) setKlantId(gefilterd[0].id)
              }}
              placeholder="Klantnummer, naam of plaats…"
              autoFocus
            />
          </div>
          <div className="field">
            <label>Klant</label>
            <div className="klant-keuze" role="listbox" aria-label="Klant">
              {loading ? (
                <div className="hint" style={{ padding: '8px 10px' }}>
                  Klanten laden…
                </div>
              ) : gefilterd.length === 0 ? (
                <div className="hint" style={{ padding: '8px 10px' }}>
                  Geen klanten gevonden.
                </div>
              ) : (
                gefilterd.map((k) => (
                  <button
                    type="button"
                    key={k.id}
                    role="option"
                    aria-selected={klantId === k.id}
                    className={klantId === k.id ? 'geselecteerd' : ''}
                    onClick={() => setKlantId(k.id)}
                  >
                    {k.klantcode} — {k.naam}
                    {k.plaats ? ` (${k.plaats})` : ''}
                  </button>
                ))
              )}
            </div>
            <span className="hint">
              {klant
                ? `Geselecteerd: ${klant.klantcode} — ${klant.naam} (voorvoegsel ${klantVoorvoegsel(klant) || '—'})`
                : 'Geblokkeerde klanten staan niet in de lijst.'}
            </span>
          </div>

          <div className="field-row">
            <div className="field">
              <label>Artikelnummer van de klant</label>
              <input
                type="text"
                value={klantArtikelnummer}
                onChange={(e) => setKlantArtikelnummer(e.target.value)}
                placeholder="Nummer op de tekening"
              />
            </div>
            <div className="field" style={{ maxWidth: 110 }}>
              <label>Revisie</label>
              <input type="text" value={revisie} onChange={(e) => setRevisie(e.target.value)} />
            </div>
            <div className="field">
              <label>Ons artikelnummer</label>
              <input
                type="text"
                value={artikelnummer}
                onChange={(e) => {
                  setZelfIngevuld(true)
                  setArtikelnummer(e.target.value)
                }}
              />
              <span className="hint">
                {bestaand
                  ? `Dit artikel bestaat al (${bestaand.naam}); de calculatie komt bij dat artikel.`
                  : 'Eerste 3 letters van de klant + het artikelnummer van de klant. Wordt als nieuw artikel aangemaakt.'}
              </span>
            </div>
          </div>
          <div className="field">
            <label>Omschrijving</label>
            <input
              type="text"
              value={omschrijving}
              onChange={(e) => setOmschrijving(e.target.value)}
              placeholder={bestaand?.naam || 'bijv. As Ø25 x 180 RVS'}
            />
          </div>
        </>
      )}

      <div className="modal-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
          Annuleren
        </button>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={saving || !klant || !klantArtikelnummer.trim() || !artikelnummer.trim()}
        >
          {saving ? 'Aanmaken…' : 'Aanmaken'}
        </button>
      </div>
    </form>
  )
}

function prijsTekst(c) {
  const regels = c.regels || []
  if (regels.length === 0) return '-'
  const valuta = c.valuta && c.valuta !== 'EUR' ? `${c.valuta} ` : '€ '
  const prijzen = regels.map((r) => Number(r.prijs) || 0)
  const laag = Math.min(...prijzen)
  const hoog = Math.max(...prijzen)
  return laag === hoog ? `${valuta}${formatPrijs(laag)}` : `${valuta}${formatPrijs(laag)} – ${formatPrijs(hoog)}`
}

export default function CalculatiesList() {
  const { profile } = useAuth()
  const { data: calculaties, loading } = useCollection('calculaties', { orderByField: 'datum', orderDirection: 'desc' })
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [showNieuw, setShowNieuw] = useState(false)
  const [editing, setEditing] = useState(null)
  const [startFout, setStartFout] = useState(null)
  const [showArtikelAanbieding, setShowArtikelAanbieding] = useState(false)
  const [aanmaken, setAanmaken] = useState(false)
  const [lijstFout, setLijstFout] = useState(null)

  // Aanbieding met bestaande artikelen: alleen de klant kiezen, de rest in het formulier.
  async function maakAanbiedingVoor(klant) {
    setLijstFout(null)
    setAanmaken(true)
    try {
      const aanbieding = await maakArtikelAanbieding({ klant, gebruiker: profile?.naam || profile?.email })
      setShowArtikelAanbieding(false)
      setStartFout(null)
      setEditing(aanbieding)
    } catch (err) {
      setShowArtikelAanbieding(false)
      setLijstFout(err.message)
    } finally {
      setAanmaken(false)
    }
  }

  const gefilterd = useMemo(() => {
    const q = search.trim().toLowerCase()
    return calculaties.filter(
      (c) =>
        (!status || c.status === status) &&
        (!q ||
          c.calculatienummer?.toLowerCase().includes(q) ||
          c.klantcode?.toLowerCase().includes(q) ||
          c.klantNaam?.toLowerCase().includes(q) ||
          c.artikelnummer?.toLowerCase().includes(q) ||
          c.klantArtikelnummer?.toLowerCase().includes(q) ||
          c.omschrijving?.toLowerCase().includes(q) ||
          c.referentie?.toLowerCase().includes(q))
    )
  }, [calculaties, search, status])

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1>Calculaties</h1>
          <div className="page-header-sub">{calculaties.length} calculaties en aanbiedingen</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={() => setShowArtikelAanbieding(true)}>
            + Aanbieding met artikelen
          </button>
          <button className="btn btn-primary" onClick={() => setShowNieuw(true)}>
            + Nieuwe calculatie
          </button>
        </div>
      </div>

      {lijstFout && <div className="banner banner-danger">{lijstFout}</div>}

      <div className="card">
        <div className="card-pad" style={{ paddingBottom: 0 }}>
          <div className="data-table-toolbar" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              className="search-input"
              type="text"
              placeholder="Zoek op nummer, klant, artikel of referentie…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              style={{ width: 'auto' }}
              aria-label="Status"
            >
              <option value="">Alle statussen</option>
              {Object.entries(STATUS_LABEL).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {loading ? (
          <div className="empty-state">
            <div className="spinner" style={{ margin: '0 auto' }} />
          </div>
        ) : gefilterd.length === 0 ? (
          <div className="empty-state">
            {calculaties.length === 0 ? 'Nog geen calculaties gemaakt.' : 'Geen calculaties gevonden.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nummer</th>
                  <th>Datum</th>
                  <th>Klant</th>
                  <th>Artikel</th>
                  <th>Omschrijving</th>
                  <th>Aantallen</th>
                  <th className="num">Prijs per stuk</th>
                  <th>Status</th>
                  <th>Gemaild</th>
                </tr>
              </thead>
              <tbody>
                {gefilterd.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => {
                      setStartFout(null)
                      setEditing(c)
                    }}
                  >
                    <td>{c.calculatienummer}</td>
                    <td>{formatDate(c.calculatiedatum)}</td>
                    <td>
                      {c.klantcode} — {c.klantNaam}
                    </td>
                    <td>
                      {isArtikelAanbieding(c) && <span className="badge badge-neutral">Artikelen</span>}{' '}
                      {c.artikelnummer}
                    </td>
                    <td>{c.omschrijving}</td>
                    <td>{(c.aantallen || []).join(', ') || '-'}</td>
                    <td className="num">{prijsTekst(c)}</td>
                    <td>
                      <span className={'badge ' + (STATUS_BADGE[c.status] || 'badge-neutral')}>
                        {STATUS_LABEL[c.status] || c.status}
                      </span>
                    </td>
                    <td>{c.gemaildOp ? formatDate(c.gemaildOp) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showNieuw && (
        <Modal title="Nieuwe calculatie" onClose={() => setShowNieuw(false)} width={680}>
          <NieuweCalculatieForm
            onCreated={(calculatie, uploadFout) => {
              setShowNieuw(false)
              setStartFout(uploadFout || null)
              setEditing(calculatie)
            }}
            onCancel={() => setShowNieuw(false)}
          />
        </Modal>
      )}

      {showArtikelAanbieding && (
        <KlantKiezerVenster
          titel="Aanbieding met artikelen"
          knop={aanmaken ? 'Aanmaken…' : 'Aanmaken'}
          bezig={aanmaken}
          uitleg="Daarna kies je de artikelen en vul je de prijzen en voorwaarden zelf in."
          onKies={maakAanbiedingVoor}
          onAnnuleren={() => setShowArtikelAanbieding(false)}
        />
      )}

      {editing &&
        (isArtikelAanbieding(editing) ? (
          <Modal title={`Aanbieding ${editing.calculatienummer}`} onClose={() => setEditing(null)} width={1100}>
            <ArtikelAanbiedingForm aanbieding={editing} onDone={() => setEditing(null)} />
          </Modal>
        ) : (
          <Modal title={`Calculatie ${editing.calculatienummer}`} onClose={() => setEditing(null)} width={1100}>
            <CalculatieForm calculatie={editing} startFout={startFout} onDone={() => setEditing(null)} />
          </Modal>
        ))}
    </div>
  )
}

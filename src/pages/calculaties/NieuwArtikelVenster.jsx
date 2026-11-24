import { useEffect, useRef, useState } from 'react'
import Modal from '../../components/Modal'
import { haalArtikelOpNummer } from '../../lib/artikelZoeken'
import { leesAantallen, maakAanbiedingArtikel, stelArtikelnummerVoor } from '../../lib/calculaties'
import { uploadArtikelDocument } from '../../lib/documenten'
import { leesTekening } from '../../lib/tekeningLezen'

// Nieuw artikel in een aanbieding: de tekening erin slepen, nummer en
// omschrijving komen uit het titelblok (lib/tekeningLezen.js), en de aantallen
// waarvoor een prijs gevraagd is. Ons artikelnummer is de eerste 3 letters van
// de klant + het artikelnummer van de klant. Daarna volgt de calculatie.
export default function NieuwArtikelVenster({ klant, gebruiker, onToegevoegd, onAnnuleren }) {
  const [klantArtikelnummer, setKlantArtikelnummer] = useState('')
  const [revisie, setRevisie] = useState('')
  const [tekening, setTekening] = useState(null) // { file, gelezen }
  const [lezen, setLezen] = useState(false)
  const [slepen, setSlepen] = useState(false)
  const sleepTeller = useRef(0)
  const fileInputRef = useRef(null)
  const [eigenNummer, setEigenNummer] = useState(null) // null = voorstel
  const [omschrijving, setOmschrijving] = useState('')
  const [aantallen, setAantallen] = useState('1')
  const [bestaand, setBestaand] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const artikelnummer = eigenNummer ?? stelArtikelnummerVoor(klant, klantArtikelnummer)
  const aantallenLijst = leesAantallen(aantallen)

  // Bestaat het artikel al, dan komt dat artikel in de aanbieding.
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
    if (!file || lezen || saving) return
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
    } catch (err) {
      setError(err.message)
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
    // Het venster staat via een portal binnen het aanbiedingsformulier.
    e.stopPropagation()
    if (aantallenLijst.length === 0) {
      setError('Vul minimaal één aantal in.')
      return
    }
    setError(null)
    setSaving(true)
    try {
      const { artikel } = await maakAanbiedingArtikel({
        klant,
        artikelnummer,
        klantArtikelnummer,
        omschrijving: omschrijving.trim() || bestaand?.naam || '',
      })
      // De tekening hoort bij het artikel. Lukt het uploaden niet, dan bestaat
      // het artikel al wel; de tekening kan er daarna alsnog bij.
      let waarschuwing = null
      if (tekening?.file) {
        try {
          await uploadArtikelDocument({ artikel, file: tekening.file, gebruiker })
        } catch (err) {
          waarschuwing = `Het artikel is toegevoegd, maar de tekening is niet opgeslagen: ${err.message}`
        }
      }
      onToegevoegd({
        artikel,
        omschrijving: omschrijving.trim() || artikel.naam || '',
        klantArtikelnummer: klantArtikelnummer.trim(),
        revisie: revisie.trim(),
        aantallen: aantallenLijst,
        waarschuwing,
      })
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <Modal title="Nieuw artikel" onClose={() => !saving && onAnnuleren()} width={680}>
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
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTekening(null)} disabled={saving}>
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

        <div className="field-row">
          <div className="field">
            <label>Artikelnummer van de klant</label>
            <input
              type="text"
              value={klantArtikelnummer}
              onChange={(e) => setKlantArtikelnummer(e.target.value)}
              placeholder="Nummer op de tekening"
              autoFocus
            />
          </div>
          <div className="field" style={{ maxWidth: 110 }}>
            <label>Revisie</label>
            <input type="text" value={revisie} onChange={(e) => setRevisie(e.target.value)} />
          </div>
          <div className="field">
            <label>Ons artikelnummer</label>
            <input type="text" value={artikelnummer} onChange={(e) => setEigenNummer(e.target.value)} />
            <span className="hint">
              {bestaand
                ? `Dit artikel bestaat al (${bestaand.naam}) en wordt toegevoegd.`
                : 'Eerste 3 letters van de klant + het artikelnummer van de klant.'}
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
        <div className="field">
          <label>Aantallen</label>
          <input
            type="text"
            value={aantallen}
            onChange={(e) => setAantallen(e.target.value)}
            placeholder="bijv. 10, 50, 100"
          />
          <span className="hint">
            Voor elk aantal komt er een regel op de aanbieding
            {aantallenLijst.length ? `: ${aantallenLijst.join(', ')} stuks.` : '.'}
          </span>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onAnnuleren} disabled={saving}>
            Annuleren
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={saving || lezen || !klantArtikelnummer.trim() || !artikelnummer.trim()}
          >
            {saving ? 'Toevoegen…' : 'Toevoegen en calculeren'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

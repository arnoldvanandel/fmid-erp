import { useEffect, useState } from 'react'
import Modal from './Modal'
import { koppelBarcodeAanArtikel } from '../lib/artikelBarcodes'
import { useArtikelZoeken } from '../lib/artikelZoeken'

export default function BarcodeKoppelen({
  barcode,
  voorstel = null,
  onGekoppeld,
  onSluiten,
}) {
  const [zoek, setZoek] = useState(voorstel?.artikelnummer || '')
  const [gekozen, setGekozen] = useState(voorstel)
  const [soort, setSoort] = useState('zak')
  const [stuksPerDoos, setStuksPerDoos] = useState(
    voorstel?.stuksPerDoos > 0 ? String(voorstel.stuksPerDoos) : ''
  )
  const [stuksPerZak, setStuksPerZak] = useState(
    voorstel?.stuksPerZak > 0 ? String(voorstel.stuksPerZak) : ''
  )
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState(null)
  const { artikelen, loading } = useArtikelZoeken(zoek, { max: 12 })

  useEffect(() => {
    if (voorstel) setGekozen(voorstel)
  }, [voorstel])

  async function opslaan(e) {
    e?.preventDefault()
    if (!gekozen) {
      setFout('Kies eerst een artikel.')
      return
    }
    setBezig(true)
    setFout(null)
    try {
      const bijgewerkt = await koppelBarcodeAanArtikel(gekozen, {
        barcode,
        soort,
        stuksPerDoos,
        stuksPerZak,
      })
      onGekoppeld?.(bijgewerkt)
    } catch (err) {
      setFout(err.message)
    } finally {
      setBezig(false)
    }
  }

  return (
    <Modal title="Barcode koppelen" onClose={onSluiten} width={480}>
      <form onSubmit={opslaan}>
        <p className="hint" style={{ marginTop: 0 }}>
          De barcode is niet bekend. Koppel hem aan een artikel, met doos- en zakinhoud indien bekend.
        </p>

        <div className="field">
          <label>Barcode</label>
          <input type="text" value={barcode || ''} readOnly />
        </div>

        <div className="field">
          <label htmlFor="barcode-koppel-zoek">Artikel</label>
          <input
            id="barcode-koppel-zoek"
            type="text"
            value={zoek}
            onChange={(e) => {
              setZoek(e.target.value)
              setGekozen(null)
            }}
            placeholder="Zoek op artikelnummer of naam"
            autoComplete="off"
            autoFocus={!voorstel}
          />
          {gekozen ? (
            <div className="banner banner-info" style={{ marginTop: 8 }}>
              Gekozen: <strong>{gekozen.artikelnummer}</strong>
              {gekozen.naam ? ` — ${gekozen.naam}` : ''}
            </div>
          ) : (
            <div className="opv-locaties" style={{ marginTop: 8, maxHeight: 180, overflow: 'auto' }}>
              {loading ? (
                <span className="hint">Zoeken…</span>
              ) : artikelen.length === 0 ? (
                <span className="hint">{zoek.trim() ? 'Geen artikel gevonden.' : 'Typ een artikelnummer.'}</span>
              ) : (
                artikelen.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className="opv-locatie kolom"
                    onClick={() => {
                      setGekozen(a)
                      setZoek(a.artikelnummer)
                      if (a.stuksPerDoos > 0) setStuksPerDoos(String(a.stuksPerDoos))
                      if (a.stuksPerZak > 0) setStuksPerZak(String(a.stuksPerZak))
                    }}
                  >
                    <strong>{a.artikelnummer}</strong>
                    {a.naam ? <span>{a.naam}</span> : null}
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <div className="field">
          <label htmlFor="barcode-koppel-soort">Dit is de barcode van</label>
          <select id="barcode-koppel-soort" value={soort} onChange={(e) => setSoort(e.target.value)}>
            <option value="zak">Zakje</option>
            <option value="doos">Doos</option>
            <option value="beide">Zakje en doos (zelfde code)</option>
          </select>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="barcode-koppel-doos">Stuks per doos</label>
            <input
              id="barcode-koppel-doos"
              type="number"
              min="0"
              step="any"
              value={stuksPerDoos}
              onChange={(e) => setStuksPerDoos(e.target.value)}
              placeholder="bijv. 180"
            />
          </div>
          <div className="field">
            <label htmlFor="barcode-koppel-zak">Stuks per zakje</label>
            <input
              id="barcode-koppel-zak"
              type="number"
              min="0"
              step="any"
              value={stuksPerZak}
              onChange={(e) => setStuksPerZak(e.target.value)}
              placeholder="bijv. 10"
            />
          </div>
        </div>

        {fout && <div className="banner banner-danger">{fout}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" className="btn btn-secondary" onClick={onSluiten} disabled={bezig}>
            Annuleren
          </button>
          <button type="submit" className="btn btn-primary" disabled={bezig || !gekozen}>
            {bezig ? 'Opslaan…' : 'Koppelen'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

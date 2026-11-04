import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import ArtikelKiezer from '../../components/ArtikelKiezer'
import LocatieKiezer from '../../components/LocatieKiezer'
import { useAuth } from '../../contexts/AuthContext'
import { haalArtikelOpBarcode } from '../../lib/artikelZoeken'
import { formatNumber } from '../../lib/format'
import { boekVoorraadMutatie, haalStandenVanArtikel, stuksUitVerpakking } from '../../lib/voorraad'

function toon(n) {
  const x = Number(n)
  if (!Number.isFinite(x)) return '-'
  return formatNumber(x, Number.isInteger(x) ? 0 : 2)
}

function verpakking(artikel) {
  const doos = Number(artikel?.stuksPerDoos)
  const zak = Number(artikel?.stuksPerZak)
  return {
    doos: Number.isFinite(doos) && doos > 0 ? doos : 0,
    zak: Number.isFinite(zak) && zak > 0 ? zak : 0,
  }
}

function cameraBeschikbaar() {
  return window.isSecureContext && 'BarcodeDetector' in window && navigator.mediaDevices?.getUserMedia
}

export default function OpVoorraadMobiel() {
  const { profile } = useAuth()
  const [artikel, setArtikel] = useState(null)
  const [standen, setStanden] = useState([])
  const [ladenStanden, setLadenStanden] = useState(false)
  const [barcode, setBarcode] = useState('')
  const [zoek, setZoek] = useState('')
  const [camera, setCamera] = useState(false)
  const [locatieCode, setLocatieCode] = useState('')
  const [locatie, setLocatie] = useState(null)
  const [modus, setModus] = useState('stuks')
  const [aantal, setAantal] = useState('')
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState(null)
  const [melding, setMelding] = useState(null)
  const barcodeRef = useRef(null)

  useEffect(() => {
    document.title = 'Op voorraad zetten'
  }, [])

  useEffect(() => {
    if (artikel) return undefined
    barcodeRef.current?.focus()
    return undefined
  }, [artikel])

  function kiesArtikel(gevonden) {
    setArtikel(gevonden)
    setZoek('')
    setBarcode('')
    setFout(null)
    setMelding(null)
    setModus('stuks')
    setAantal('')
    setLocatie(null)
    setLocatieCode('')
    setLadenStanden(true)
    haalStandenVanArtikel(gevonden.id)
      .then((lijst) => {
        setStanden(lijst)
        if (lijst.length === 1) {
          setLocatie({ id: lijst[0].locatieId, code: lijst[0].locatieCode })
          setLocatieCode(lijst[0].locatieCode || '')
        }
      })
      .catch((err) => setFout(err.message))
      .finally(() => setLadenStanden(false))
  }

  function anderArtikel() {
    setArtikel(null)
    setStanden([])
    setLocatie(null)
    setLocatieCode('')
    setAantal('')
    setModus('stuks')
    setFout(null)
    setMelding(null)
  }

  async function zoekCode(code) {
    const waarde = String(code || '').trim()
    if (!waarde) {
      setFout('Scan of typ een barcode.')
      return
    }
    setBezig(true)
    setFout(null)
    try {
      const gevonden = await haalArtikelOpBarcode(waarde)
      if (!gevonden) {
        setFout(`Geen artikel met barcode of artikelnummer "${waarde}". Vul de barcode in bij het artikel.`)
        barcodeRef.current?.focus()
        barcodeRef.current?.select()
        return
      }
      kiesArtikel(gevonden)
    } catch (err) {
      setFout(err.message)
    } finally {
      setBezig(false)
    }
  }

  async function verversStanden() {
    const lijst = await haalStandenVanArtikel(artikel.id)
    setStanden(lijst)
    return lijst
  }

  async function opVoorraad(e) {
    e.preventDefault()
    setFout(null)
    setMelding(null)
    if (!locatie?.id) {
      setFout(locatieCode.trim() ? `Locatie "${locatieCode.trim()}" bestaat niet.` : 'Kies een locatie.')
      return
    }
    const stuks = stuksUitVerpakking(artikel, modus, aantal)
    if (stuks <= 0) {
      setFout('Vul een aantal in.')
      return
    }
    const pak = verpakking(artikel)
    const eenheid = artikel.eenheid || 'stuks'
    let reden = 'Op voorraad gezet'
    if (modus === 'doos') reden = `${toon(aantal)} dozen × ${toon(pak.doos)} ${eenheid}`
    if (modus === 'zak') reden = `${toon(aantal)} zakjes × ${toon(pak.zak)} ${eenheid}`

    setBezig(true)
    try {
      await boekVoorraadMutatie({
        artikelId: artikel.id,
        locatieId: locatie.id,
        type: 'in',
        aantal: stuks,
        reden,
        bron: 'opvoorraad',
        gebruiker: profile?.naam || profile?.email,
      })
      const lijst = await verversStanden()
      const stand = lijst.find((s) => s.locatieId === locatie.id)
      const via =
        modus === 'doos' ? `${toon(aantal)} dozen (${toon(stuks)} ${eenheid})` : modus === 'zak' ? `${toon(aantal)} zakjes (${toon(stuks)} ${eenheid})` : `${toon(stuks)} ${eenheid}`
      setMelding(`${via} op ${locatie.code} gezet. Daar liggen er nu ${toon(stand?.aantal ?? stuks)}.`)
      setAantal('')
    } catch (err) {
      setFout(err.message)
    } finally {
      setBezig(false)
    }
  }

  const pak = verpakking(artikel)
  const modi = [
    { id: 'stuks', label: artikel?.eenheid || 'Stuks' },
    ...(pak.doos ? [{ id: 'doos', label: 'Dozen' }] : []),
    ...(pak.zak ? [{ id: 'zak', label: 'Zakjes' }] : []),
  ]
  const stuks = artikel ? stuksUitVerpakking(artikel, modus, aantal) : 0
  const eenheid = artikel?.eenheid || 'stuks'

  return (
    <div className="pick-mobiel opv">
      <header className="pick-mobiel-kop">
        <Link to="/voorraad">Stoppen</Link>
        <div className="pick-mobiel-kop-midden">
          <strong>Op voorraad</strong>
          {artikel ? <span>{artikel.artikelnummer}</span> : <span>Scan of kies een artikel</span>}
        </div>
        <div className="pick-mobiel-teller" />
      </header>

      <div className="pick-mobiel-inhoud">
        {!artikel ? (
          <KiesArtikel
            barcode={barcode}
            setBarcode={setBarcode}
            barcodeRef={barcodeRef}
            zoek={zoek}
            setZoek={setZoek}
            bezig={bezig}
            fout={fout}
            onBarcode={(e) => {
              e.preventDefault()
              zoekCode(barcode)
            }}
            onArtikel={kiesArtikel}
            onCamera={() => setCamera(true)}
            toonCamera={cameraBeschikbaar()}
          />
        ) : (
          <form id="opv-boek" className="opv-form" onSubmit={opVoorraad}>
            <div className="opv-artikel">
              <div className="pick-mobiel-label">Artikel</div>
              <div className="pick-mobiel-artikel">{artikel.artikelnummer}</div>
              {artikel.naam ? <div className="pick-mobiel-naam">{artikel.naam}</div> : null}
              {artikel.barcode ? <div className="opv-barcode">Barcode {artikel.barcode}</div> : null}
              <button type="button" className="btn btn-ghost btn-sm" onClick={anderArtikel}>
                Ander artikel
              </button>
            </div>

            {artikel.geblokkeerd && (
              <div className="banner banner-warning">Dit artikel is geblokkeerd.</div>
            )}
            {fout && <div className="banner banner-danger">{fout}</div>}
            {melding && <div className="banner banner-info">{melding}</div>}

            <div>
              <div className="pick-mobiel-label">Ligt al op</div>
              {ladenStanden ? (
                <div className="spinner" />
              ) : standen.length === 0 ? (
                <p className="hint">Dit artikel ligt nog nergens. Kies hieronder een locatie.</p>
              ) : (
                <div className="opv-locaties">
                  {standen.map((s) => (
                    <button
                      key={s.locatieId}
                      type="button"
                      className={'opv-locatie' + (locatie?.id === s.locatieId ? ' actief' : '')}
                      onClick={() => {
                        setLocatie({ id: s.locatieId, code: s.locatieCode })
                        setLocatieCode(s.locatieCode || '')
                      }}
                    >
                      <strong>{s.locatieCode}</strong>
                      <span>
                        {toon(s.aantal)} {eenheid}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="field">
              <label htmlFor="opv-locatie">Locatie</label>
              <LocatieKiezer
                id="opv-locatie"
                value={locatieCode}
                onChange={(code) => {
                  setLocatieCode(code)
                  const stand = standen.find(
                    (s) => String(s.locatieCode).toUpperCase() === String(code).trim().toUpperCase()
                  )
                  setLocatie(stand ? { id: stand.locatieId, code: stand.locatieCode } : null)
                }}
                onKies={(l) => {
                  if (l) setLocatie({ id: l.id, code: l.code })
                }}
                placeholder="Typ een locatiecode, bijv. 1343-1"
              />
              {locatieCode.trim() && !locatie && <span className="hint">Onbekende locatie</span>}
            </div>

            <div className="field">
              <label htmlFor="opv-aantal">Aantal erbij</label>
              {modi.length > 1 && (
                <div className="opv-modus" role="group" aria-label="Invoeren als">
                  {modi.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className={modus === m.id ? 'actief' : ''}
                      onClick={() => {
                        setModus(m.id)
                        setAantal('')
                      }}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              )}
              <input
                id="opv-aantal"
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                value={aantal}
                onChange={(e) => setAantal(e.target.value)}
                autoFocus
              />
              {modus === 'doos' && (
                <span className="hint">
                  1 doos = {toon(pak.doos)} {eenheid}
                  {stuks > 0 ? ` → ${toon(stuks)} ${eenheid}` : ''}
                </span>
              )}
              {modus === 'zak' && (
                <span className="hint">
                  1 zakje = {toon(pak.zak)} {eenheid}
                  {stuks > 0 ? ` → ${toon(stuks)} ${eenheid}` : ''}
                </span>
              )}
              {modus === 'stuks' && (pak.doos > 0 || pak.zak > 0) && (
                <span className="hint">
                  {pak.doos > 0 ? `1 doos = ${toon(pak.doos)} ${eenheid}` : ''}
                  {pak.doos > 0 && pak.zak > 0 ? ' · ' : ''}
                  {pak.zak > 0 ? `1 zakje = ${toon(pak.zak)} ${eenheid}` : ''}
                </span>
              )}
            </div>
          </form>
        )}
      </div>

      {artikel && (
        <footer className="pick-mobiel-voet">
          <button type="submit" form="opv-boek" className="btn btn-primary pick-mobiel-gepikt" disabled={bezig || !locatie?.id}>
            {bezig ? 'Bezig…' : 'Op voorraad zetten'}
          </button>
        </footer>
      )}

      {camera && (
        <BarcodeCamera
          onCode={(code) => {
            setCamera(false)
            setBarcode(code)
            zoekCode(code)
          }}
          onSluiten={() => setCamera(false)}
        />
      )}
    </div>
  )
}

function KiesArtikel({
  barcode,
  setBarcode,
  barcodeRef,
  zoek,
  setZoek,
  bezig,
  fout,
  onBarcode,
  onArtikel,
  onCamera,
  toonCamera,
}) {
  return (
    <div className="opv-kies">
      {fout && <div className="banner banner-danger">{fout}</div>}
      <form onSubmit={onBarcode}>
        <div className="field">
          <label htmlFor="opv-barcode">Barcode</label>
          <input
            id="opv-barcode"
            ref={barcodeRef}
            type="text"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            placeholder="Scan of typ de barcode"
            autoComplete="off"
            autoFocus
            enterKeyHint="search"
          />
          <span className="hint">
            Een scanner vult dit veld en stuurt enter. De camera werkt alleen op een beveiligd adres (https), niet via het wifi-adres van de QR-code.
          </span>
        </div>
        <button type="submit" className="btn btn-secondary" disabled={bezig}>
          {bezig ? 'Zoeken…' : 'Zoek barcode'}
        </button>
      </form>
      {toonCamera && (
        <button type="button" className="btn btn-secondary" onClick={onCamera}>
          Scan met camera
        </button>
      )}
      <div className="opv-of">of kies een artikel</div>
      <div className="field">
        <label htmlFor="opv-artikel">Artikel</label>
        <ArtikelKiezer
          id="opv-artikel"
          value={zoek}
          onChange={setZoek}
          onKies={(a) => a && onArtikel(a)}
          placeholder="Artikelnummer of naam"
        />
      </div>
    </div>
  )
}

function BarcodeCamera({ onCode, onSluiten }) {
  const videoRef = useRef(null)
  const onCodeRef = useRef(onCode)
  const [fout, setFout] = useState(null)
  onCodeRef.current = onCode

  useEffect(() => {
    let stop = false
    let stream
    let detector
    try {
      detector = new window.BarcodeDetector({
        formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'code_93', 'codabar', 'itf', 'upc_a', 'upc_e', 'qr_code'],
      })
    } catch {
      setFout('Dit toestel kan geen barcodes met de camera lezen. Gebruik de scanner of typ de code.')
      return undefined
    }

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then(async (s) => {
        stream = s
        const video = videoRef.current
        if (!video || stop) return
        video.srcObject = s
        await video.play()
        const tick = async () => {
          if (stop) return
          try {
            const codes = await detector.detect(video)
            const waarde = codes[0]?.rawValue?.trim()
            if (waarde) {
              stop = true
              stream?.getTracks().forEach((t) => t.stop())
              onCodeRef.current(waarde)
              return
            }
          } catch {
            // Volgende beeld.
          }
          if (!stop) setTimeout(tick, 250)
        }
        setTimeout(tick, 400)
      })
      .catch(() => setFout('Camera niet beschikbaar. Gebruik de scanner of typ de barcode.'))

    return () => {
      stop = true
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  return (
    <div className="opv-camera">
      <video ref={videoRef} muted playsInline />
      <p>Richt de camera op de barcode.</p>
      {fout && <div className="banner banner-warning">{fout}</div>}
      <button type="button" className="btn btn-secondary" onClick={onSluiten}>
        Sluiten
      </button>
    </div>
  )
}

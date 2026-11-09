import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import ArtikelKiezer from '../../components/ArtikelKiezer'
import AantalInput from '../../components/AantalInput'
import LocatieKiezer from '../../components/LocatieKiezer'
import { useAuth } from '../../contexts/AuthContext'
import { haalArtikelOpBarcode, haalArtikelenOp } from '../../lib/artikelZoeken'
import { formatNumber } from '../../lib/format'
import { zorgLocatie } from '../../lib/locatieZoeken'
import { evalueerAantal, isVerzamellocatie, leesRecenteArtikelen, onthoudArtikel } from '../../lib/magazijnInvoer'
import { boekVoorraadMutatie, haalStandenVanArtikel } from '../../lib/voorraad'

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
  const [extraLocaties, setExtraLocaties] = useState([])
  const [perLocatie, setPerLocatie] = useState({})
  const [andereOpen, setAndereOpen] = useState(false)
  const [andereCode, setAndereCode] = useState('')
  const [andereAantal, setAndereAantal] = useState('')
  const [dozen, setDozen] = useState('')
  const [restDoos, setRestDoos] = useState('')
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
    setAantal('')
    setDozen('')
    setRestDoos('')
    setExtraLocaties([])
    setPerLocatie({})
    setAndereOpen(false)
    setAndereCode('')
    setAndereAantal('')
    setLadenStanden(true)
    onthoudArtikel(gevonden)
    haalStandenVanArtikel(gevonden.id)
      .then((lijst) => setStanden(lijst.filter((s) => !isVerzamellocatie(s.locatieCode))))
      .catch((err) => setFout(err.message))
      .finally(() => setLadenStanden(false))
  }

  function anderArtikel() {
    setArtikel(null)
    setStanden([])
    setExtraLocaties([])
    setPerLocatie({})
    setAndereOpen(false)
    setAndereCode('')
    setAndereAantal('')
    setAantal('')
    setDozen('')
    setRestDoos('')
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

  function zetLocatieAantal(id, waarde) {
    setPerLocatie((h) => ({ ...h, [id]: waarde }))
  }

  function neemTotaalOver(id) {
    const n = evalueerAantal(aantal)
    if (!Number.isFinite(n) || n <= 0) {
      setFout('Vul eerst het totaal aantal in.')
      return
    }
    setPerLocatie((h) => ({ ...h, [id]: String(n) }))
    setFout(null)
  }

  function klikLocatie(e, id) {
    if (e.target.closest('input')?.value.trim()) return
    neemTotaalOver(id)
  }

  function kiesAndereLocatie(l) {
    if (!l) return
    if (isVerzamellocatie(l.code)) {
      setFout('Locatie 1111-1 is de verzamellocatie en kan hier niet gekozen worden.')
      return
    }
    const ingevuld = String(andereAantal).trim()
    setExtraLocaties((h) => (h.some((e) => e.id === l.id) ? h : [...h, { id: l.id, code: l.code }]))
    setAndereCode('')
    setAndereAantal('')
    setAndereOpen(false)
    setFout(null)
    if (ingevuld) setPerLocatie((h) => ({ ...h, [l.id]: ingevuld }))
    else neemTotaalOver(l.id)
  }

  async function enterAndereLocatie(e) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const code = andereCode.trim().toUpperCase()
    if (!code) return
    if (isVerzamellocatie(code)) {
      setFout('Locatie 1111-1 is de verzamellocatie en kan hier niet gekozen worden.')
      return
    }
    try {
      kiesAndereLocatie(await zorgLocatie(code))
    } catch (err) {
      setFout(err.message)
    }
  }

  async function openLocatieMeenemen() {
    const code = andereCode.trim().toUpperCase()
    if (!andereOpen || !code) return { extra: extraLocaties, aantallen: perLocatie }
    if (isVerzamellocatie(code)) {
      throw new Error('Locatie 1111-1 is de verzamellocatie en kan hier niet gekozen worden.')
    }
    const l = await zorgLocatie(code)
    const extra = extraLocaties.some((e) => e.id === l.id) ? extraLocaties : [...extraLocaties, { id: l.id, code: l.code }]
    const ingevuld = String(andereAantal).trim()
    const totaal = evalueerAantal(aantal)
    const qty = ingevuld || (Number.isFinite(totaal) && totaal > 0 ? String(totaal) : '')
    const aantallen = qty ? { ...perLocatie, [l.id]: perLocatie[l.id] || qty } : perLocatie
    setExtraLocaties(extra)
    setPerLocatie(aantallen)
    setAndereCode('')
    setAndereAantal('')
    setAndereOpen(false)
    return { extra, aantallen }
  }

  async function verversStanden() {
    const lijst = (await haalStandenVanArtikel(artikel.id)).filter((s) => !isVerzamellocatie(s.locatieCode))
    setStanden(lijst)
    return lijst
  }

  async function opVoorraad(e) {
    e?.preventDefault()
    setFout(null)
    setMelding(null)
    const eenheid = artikel.eenheid || 'stuks'
    let extraNu = extraLocaties
    let aantallenNu = perLocatie
    try {
      const meegenomen = await openLocatieMeenemen()
      extraNu = meegenomen.extra
      aantallenNu = meegenomen.aantallen
    } catch (err) {
      setFout(err.message)
      return
    }
    const ingetypt = evalueerAantal(aantal)
    const tegels = [
      ...standen.map((s) => ({ id: s.locatieId, code: s.locatieCode })),
      ...extraNu.filter((l) => !standen.some((s) => s.locatieId === l.id)).map((l) => ({ id: l.id, code: l.code })),
    ]
    const ingevuld = tegels
      .map((t) => ({ ...t, aantal: evalueerAantal(aantallenNu[t.id] || '') }))
      .filter((t) => Number.isFinite(t.aantal) && t.aantal > 0)
    const somVooraf = ingevuld.reduce((s, p) => s + p.aantal, 0)
    const n = Number.isFinite(ingetypt) && ingetypt > 0 ? ingetypt : somVooraf
    const plaatsingen = ingevuld.length > 0 ? ingevuld : Number.isFinite(n) && n > 0 && tegels.length === 1 ? [{ ...tegels[0], aantal: n }] : []
    if (!Number.isFinite(n) || n <= 0) {
      setFout('Vul een totaal aantal in. Een berekening zoals 80*2+20 mag ook.')
      return
    }
    if (plaatsingen.length === 0) {
      setFout('Kies per locatie hoeveel stuks daar zijn geplaatst. Een volle locatie vult u niet verder; de rest komt op een andere locatie.')
      return
    }
    const som = plaatsingen.reduce((s, p) => s + p.aantal, 0)
    if (Math.abs(som - n) > 0.001) {
      setFout(`Per locatie staat ${toon(som)} ${eenheid}, het totaal is ${toon(n)}. Maak die gelijk voor u boekt.`)
      return
    }

    setBezig(true)
    try {
      for (const plek of plaatsingen) {
        await boekVoorraadMutatie({
          artikelId: artikel.id,
          locatieId: plek.id,
          type: 'in',
          aantal: plek.aantal,
          reden: 'Op voorraad gezet',
          bron: 'opvoorraad',
          gebruiker: profile?.naam || profile?.email,
        })
      }
      await verversStanden().then((lijst) => setStanden(lijst.filter((s) => !isVerzamellocatie(s.locatieCode))))
      setMelding(`${toon(n)} ${eenheid} op ${plaatsingen.map((p) => p.code).join(', ')} gezet.`)
      setAantal('')
      setDozen('')
      setRestDoos('')
      setPerLocatie({})
    } catch (err) {
      setFout(err.message)
    } finally {
      setBezig(false)
    }
  }

  const pak = verpakking(artikel)
  const eenheid = artikel?.eenheid || 'stuks'

  async function kiesRecent(kort) {
    if (!kort.artikelId) {
      setFout('Zoek dit artikel opnieuw op artikelnummer.')
      return
    }
    setBezig(true)
    setFout(null)
    try {
      const map = await haalArtikelenOp([kort.artikelId])
      const volledig = map[kort.artikelId]
      if (!volledig) {
        setFout('Artikel niet gevonden.')
        return
      }
      kiesArtikel(volledig)
    } catch (err) {
      setFout(err.message)
    } finally {
      setBezig(false)
    }
  }

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
            onRecent={kiesRecent}
            onCamera={() => setCamera(true)}
            toonCamera={cameraBeschikbaar()}
          />
        ) : (
          <form id="opv-boek" className="opv-form" onSubmit={(e) => e.preventDefault()}>
            <div className="opv-artikel">
              <div className="pick-mobiel-label">Artikel</div>
              <div className="pick-mobiel-artikel">{artikel.artikelnummer}</div>
              {artikel.naam ? <div className="pick-mobiel-naam">{artikel.naam}</div> : null}
              {artikel.barcodeDoos ? <div className="opv-barcode">Doos {artikel.barcodeDoos}</div> : null}
              {artikel.barcodeZak ? <div className="opv-barcode">Zakje {artikel.barcodeZak}</div> : null}
              {!artikel.barcodeDoos && !artikel.barcodeZak && artikel.barcode ? (
                <div className="opv-barcode">Barcode {artikel.barcode}</div>
              ) : null}
              <button type="button" className="btn btn-ghost btn-sm" onClick={anderArtikel}>
                Ander artikel
              </button>
            </div>

            {artikel.geblokkeerd && (
              <div className="banner banner-warning">Dit artikel is geblokkeerd.</div>
            )}
            {fout && <div className="banner banner-danger">{fout}</div>}
            {melding && <div className="banner banner-info">{melding}</div>}

            {pak.doos > 0 && (
              <div className="aantal-rij">
                <div className="field">
                  <label htmlFor="opv-dozen">Volle dozen</label>
                  <AantalInput
                    id="opv-dozen"
                    value={dozen}
                    onValue={(waarde) => {
                      setDozen(waarde)
                      const d = evalueerAantal(waarde)
                      const r = evalueerAantal(restDoos)
                      const totaal = (Number.isFinite(d) ? d : 0) * pak.doos + (Number.isFinite(r) ? r : 0)
                      setAantal(String(waarde).trim() || restDoos.trim() ? String(totaal) : '')
                    }}
                    placeholder="bijv. 4 of 2x2"
                  />
                  <span className="hint">1 doos = {toon(pak.doos)} {eenheid}</span>
                </div>
                <div className="field">
                  <label htmlFor="opv-rest">Rest in doos</label>
                  <AantalInput
                    id="opv-rest"
                    value={restDoos}
                    onValue={(waarde) => {
                      setRestDoos(waarde)
                      const d = evalueerAantal(dozen)
                      const r = evalueerAantal(waarde)
                      const totaal = (Number.isFinite(d) ? d : 0) * pak.doos + (Number.isFinite(r) ? r : 0)
                      setAantal(dozen.trim() || String(waarde).trim() ? String(totaal) : '')
                    }}
                    placeholder="bijv. 12"
                  />
                </div>
              </div>
            )}

            <div className="field">
              <label htmlFor="opv-aantal">Totaal aantal</label>
              <AantalInput
                id="opv-aantal"
                value={aantal}
                onValue={(waarde) => {
                  setAantal(waarde)
                  setDozen('')
                  setRestDoos('')
                }}
                placeholder="bijv. 80x2 of 80*2+20"
                autoFocus
              />
              <span className="hint">Klik daarna een locatie: het totaal komt in die tegel. Enter boekt nog niet.</span>
            </div>

            <div>
              <div className="pick-mobiel-label">Locaties</div>
              {ladenStanden ? (
                <div className="spinner" />
              ) : (
                <>
                  {standen.length === 0 && extraLocaties.length === 0 && (
                    <p className="hint">Dit artikel ligt nog nergens, of alleen op de verzamellocatie. Kies een andere locatie.</p>
                  )}
                  <div className="locatie-tegels">
                    {standen.map((s) => (
                      <div
                        key={s.locatieId}
                        className={'locatie-tegel' + (perLocatie[s.locatieId] ? ' actief' : '')}
                        onClick={(e) => klikLocatie(e, s.locatieId)}
                      >
                        <strong>{s.locatieCode}</strong>
                        <span>ligt er {toon(s.aantal)}</span>
                        <AantalInput
                          value={perLocatie[s.locatieId] || ''}
                          onValue={(waarde) => zetLocatieAantal(s.locatieId, waarde)}
                          placeholder="Aantal"
                          aria-label={`Aantal op ${s.locatieCode}`}
                        />
                      </div>
                    ))}
                    {extraLocaties
                      .filter((l) => !standen.some((s) => s.locatieId === l.id))
                      .map((l) => (
                        <div
                          key={l.id}
                          className={'locatie-tegel' + (perLocatie[l.id] ? ' actief' : '')}
                          onClick={(e) => klikLocatie(e, l.id)}
                        >
                          <strong>{l.code}</strong>
                          <span>nieuwe locatie</span>
                          <AantalInput
                            value={perLocatie[l.id] || ''}
                            onValue={(waarde) => zetLocatieAantal(l.id, waarde)}
                            placeholder="Aantal"
                            aria-label={`Aantal op ${l.code}`}
                          />
                        </div>
                      ))}
                    {andereOpen ? (
                      <div
                        className="locatie-tegel actief"
                        onClick={(e) => {
                          if (e.target.closest('input')?.value.trim()) return
                          const n = evalueerAantal(aantal)
                          if (Number.isFinite(n) && n > 0) setAndereAantal(String(n))
                        }}
                      >
                        <strong>Locatie</strong>
                        <LocatieKiezer
                          className="locatie-code"
                          value={andereCode}
                          onChange={setAndereCode}
                          onKies={kiesAndereLocatie}
                          onKeyDown={enterAndereLocatie}
                          placeholder="Locatiecode"
                          autoFocus
                          aria-label="Andere locatie"
                        />
                        <AantalInput
                          value={andereAantal}
                          onValue={setAndereAantal}
                          placeholder="Aantal"
                          aria-label="Aantal op deze locatie"
                        />
                      </div>
                    ) : (
                      <button type="button" className="locatie-tegel" onClick={() => setAndereOpen(true)}>
                        <strong>Andere locatie</strong>
                        <span>typ de code</span>
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </form>
        )}
      </div>

      {artikel && (
        <footer className="pick-mobiel-voet">
          <button type="button" className="btn btn-primary pick-mobiel-gepikt" onClick={opVoorraad} disabled={bezig}>
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
  onRecent,
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
      {leesRecenteArtikelen().length > 0 && (
        <div>
          <div className="pick-mobiel-label">Laatst gekozen</div>
          <div className="locatie-tegels">
            {leesRecenteArtikelen().map((a) => (
              <button key={a.artikelnummer} type="button" className="locatie-tegel" onClick={() => onRecent(a)}>
                <strong>{a.artikelnummer}</strong>
                {a.artikelnaam ? <span>{a.artikelnaam}</span> : null}
              </button>
            ))}
          </div>
        </div>
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

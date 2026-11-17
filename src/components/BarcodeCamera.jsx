import { useEffect, useRef, useState } from 'react'
import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  MultiFormatReader,
  RGBLuminanceSource,
} from '@zxing/library'

const FORMATEN = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93', 'codabar', 'itf', 'qr_code']

const ZXING_FORMATEN = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.CODE_93,
  BarcodeFormat.CODABAR,
  BarcodeFormat.ITF,
  BarcodeFormat.QR_CODE,
]

const OPSLAG_CAMERA = 'fmid-barcode-camera'

// De camera mag alleen aan in een beveiligde context: https, of localhost op deze pc.
export function cameraBeschikbaar() {
  return Boolean(navigator.mediaDevices?.getUserMedia)
}

export function CameraIcoon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="24" height="24">
      <path
        fill="currentColor"
        d="M9.2 6.2 7.8 8H5.2A1.2 1.2 0 0 0 4 9.2v8.6A1.2 1.2 0 0 0 5.2 19h13.6a1.2 1.2 0 0 0 1.2-1.2V9.2A1.2 1.2 0 0 0 18.8 8h-2.6l-1.4-1.8H9.2Zm2.8 10.3a3.4 3.4 0 1 1 0-6.8 3.4 3.4 0 0 1 0 6.8Z"
      />
    </svg>
  )
}

function httpsMelding() {
  const host = window.location.hostname
  const poort = window.location.port ? `:${window.location.port}` : ''
  return `De camera werkt niet op een http-adres. Open https://${host}${poort}${window.location.pathname} en ga bij de certificaatwaarschuwing door.`
}

function leesCameraKeuze() {
  try {
    return window.localStorage.getItem(OPSLAG_CAMERA) || ''
  } catch {
    return ''
  }
}

function bewaarCameraKeuze(id) {
  try {
    window.localStorage.setItem(OPSLAG_CAMERA, id)
  } catch {
    // Opslag niet beschikbaar; keuze geldt dan alleen nu.
  }
}

function stopStream(stream) {
  stream?.getTracks().forEach((spoor) => spoor.stop())
}

function wacht(ms) {
  return new Promise((klaar) => window.setTimeout(klaar, ms))
}

function mogelijkheden(spoor) {
  return typeof spoor?.getCapabilities === 'function' ? spoor.getCapabilities() : {}
}

// Op Android (Chrome) leest de BarcodeDetector van het toestel de code. Die is
// alleen zichtbaar op https; op http bestaat hij niet.
async function maakDetector() {
  if (!('BarcodeDetector' in window)) return null
  try {
    const ondersteund = await window.BarcodeDetector.getSupportedFormats()
    const formats = FORMATEN.filter((formaat) => ondersteund.includes(formaat))
    if (!formats.length) return null
    return new window.BarcodeDetector({ formats })
  } catch {
    return null
  }
}

// Reservelezer voor browsers zonder BarcodeDetector.
function maakZxing() {
  const hints = new Map()
  hints.set(DecodeHintType.POSSIBLE_FORMATS, ZXING_FORMATEN)
  hints.set(DecodeHintType.TRY_HARDER, true)
  const lezer = new MultiFormatReader()
  lezer.setHints(hints)
  return lezer
}

// Leest een beeld (video of foto) met de reservelezer. Met `draai` wordt het
// beeld ook een kwartslag gedraaid geprobeerd, voor een etiket dat rechtop staat.
function leesMetZxing(zxing, bron, bronW, bronH, canvas, { max = 1400, draai = false } = {}) {
  if (!bronW || !bronH) return ''
  const schaal = Math.min(1, max / Math.max(bronW, bronH))
  const w = Math.max(1, Math.floor(bronW * schaal))
  const h = Math.max(1, Math.floor(bronH * schaal))
  for (const gedraaid of draai ? [false, true] : [false]) {
    const cw = gedraaid ? h : w
    const ch = gedraaid ? w : h
    if (canvas.width !== cw) canvas.width = cw
    if (canvas.height !== ch) canvas.height = ch
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.save()
    if (gedraaid) {
      ctx.translate(cw, 0)
      ctx.rotate(Math.PI / 2)
    }
    ctx.drawImage(bron, 0, 0, w, h)
    ctx.restore()
    const waarde = decodeerCanvas(zxing, ctx, cw, ch)
    if (waarde) return waarde
  }
  return ''
}

function decodeerCanvas(zxing, ctx, w, h) {
  const pixels = ctx.getImageData(0, 0, w, h).data
  const grijs = new Uint8ClampedArray(w * h)
  for (let i = 0, j = 0; i < pixels.length; i += 4, j += 1) {
    grijs[j] = (pixels[i] + pixels[i + 1] * 2 + pixels[i + 2]) >> 2
  }
  try {
    return (
      zxing
        .decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(grijs, w, h))))
        .getText()
        ?.trim() || ''
    )
  } catch {
    return ''
  } finally {
    zxing.reset()
  }
}

async function zetCamera(spoor, instelling) {
  try {
    await spoor.applyConstraints({ advanced: [instelling] })
    return true
  } catch {
    return false
  }
}

// continuous houdt de barcode scherp; single-shot stelt scherp op de plek waar u tikt.
async function stelScherp(spoor, modus, punt) {
  if (!spoor?.applyConstraints) return
  const modi = mogelijkheden(spoor).focusMode || []
  const focusMode = modi.includes(modus) ? modus : modi.includes('continuous') ? 'continuous' : null
  if (!focusMode) return
  if (punt && (await zetCamera(spoor, { focusMode, pointsOfInterest: [punt] }))) return
  await zetCamera(spoor, { focusMode })
}

// Tablets hebben vaak meerdere camera's achterop; de groothoeklens heeft vaste
// scherpte. Chrome noemt de hoofdcamera "camera2 0, facing back".
function kiesHoofdcamera(achter) {
  return achter.find((c) => /camera2? 0\b/i.test(c.label)) || null
}

export default function BarcodeCamera({ onCode, onSluiten }) {
  const videoRef = useRef(null)
  const spoorRef = useRef(null)
  const onCodeRef = useRef(onCode)
  const [cameraId, setCameraId] = useState(leesCameraKeuze)
  const [cameras, setCameras] = useState([])
  const [fout, setFout] = useState(null)
  const [bezig, setBezig] = useState(true)
  const [lezer, setLezer] = useState('')
  const [info, setInfo] = useState(null)
  const [zoomAan, setZoomAan] = useState(false)
  const [afstand, setAfstand] = useState(null)
  const [melding, setMelding] = useState('')
  const [herstart, setHerstart] = useState(0)
  const [fotoBezig, setFotoBezig] = useState(false)
  const fotoRef = useRef(null)
  onCodeRef.current = onCode

  useEffect(() => {
    const video = videoRef.current
    if (!video) return undefined
    if (!window.isSecureContext) {
      setFout(httpsMelding())
      setBezig(false)
      return undefined
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setFout('Deze browser heeft geen camera. Gebruik Chrome, of typ het artikelnummer.')
      setBezig(false)
      return undefined
    }

    let gestopt = false
    let stream
    let tickTimer
    const canvas = document.createElement('canvas')
    setBezig(true)
    setFout(null)
    setInfo(null)
    setZoomAan(false)
    setAfstand(null)

    function gevonden(waarde) {
      const tekst = String(waarde || '').trim()
      if (gestopt || !tekst) return
      gestopt = true
      window.clearTimeout(tickTimer)
      stopStream(stream)
      onCodeRef.current(tekst)
    }

    async function start() {
      const formaat = { width: { ideal: 1920 }, height: { ideal: 1080 } }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: cameraId
            ? { ...formaat, deviceId: { exact: cameraId } }
            : { ...formaat, facingMode: { ideal: 'environment' } },
        })
      } catch (err) {
        if (cameraId && (err?.name === 'OverconstrainedError' || err?.name === 'NotFoundError')) {
          bewaarCameraKeuze('')
          if (!gestopt) setCameraId('')
          return
        }
        throw err
      }
      if (gestopt) {
        stopStream(stream)
        return
      }
      const spoor = stream.getVideoTracks()[0]
      spoorRef.current = spoor

      // Pas na toestemming geeft de browser de namen van de camera's.
      const apparaten = (await navigator.mediaDevices.enumerateDevices()).filter((a) => a.kind === 'videoinput')
      const achter = apparaten.filter((a) => /back|rear|achter|environment/i.test(a.label))
      const lijst = achter.length ? achter : apparaten
      if (gestopt) return
      setCameras(lijst)
      const huidigId = spoor.getSettings?.().deviceId || ''
      if (!cameraId) {
        const hoofd = kiesHoofdcamera(lijst)
        if (hoofd && hoofd.deviceId !== huidigId) {
          setCameraId(hoofd.deviceId)
          return
        }
      }

      video.srcObject = stream
      await video.play()
      if (gestopt) return

      await stelScherp(spoor, 'continuous')
      const caps = mogelijkheden(spoor)
      const focus = caps.focusMode || []
      setInfo({
        naam: spoor.label || 'Camera',
        focus,
        afstand: caps.focusDistance && focus.includes('manual') ? caps.focusDistance : null,
        zoom: caps.zoom && caps.zoom.max > caps.zoom.min ? caps.zoom : null,
      })

      // Op sommige Android-toestellen bestaat de BarcodeDetector wel, maar vindt
      // hij nooit iets. Daarom leest de reservelezer elk derde beeld mee.
      let detector = await maakDetector()
      const zxing = maakZxing()
      setLezer(
        detector ? 'Barcodelezer van Android + reservelezer' : 'Reservelezer (deze browser heeft geen barcodelezer)'
      )
      setBezig(false)

      let beeld = 0
      let detectorFouten = 0
      const tick = async () => {
        if (gestopt) return
        if (video.readyState >= 2) {
          beeld += 1
          if (detector) {
            try {
              const codes = await detector.detect(video)
              detectorFouten = 0
              const code = codes.find((c) => String(c.rawValue || '').trim())
              if (code) {
                gevonden(code.rawValue)
                return
              }
            } catch {
              detectorFouten += 1
              if (detectorFouten >= 5) {
                detector = null
                setLezer('Reservelezer (barcodelezer van Android werkt niet)')
              }
            }
          }
          if (!gestopt && (!detector || beeld % 3 === 0)) {
            const waarde = leesMetZxing(zxing, video, video.videoWidth, video.videoHeight, canvas)
            if (waarde) {
              gevonden(waarde)
              return
            }
          }
        }
        if (!gestopt) tickTimer = window.setTimeout(tick, detector ? 100 : 250)
      }
      tick()
    }

    // Korte vertraging: React start dit in de ontwikkelmodus twee keer, en twee
    // gelijktijdige camera-aanvragen laten Android de tweede weigeren.
    const startTimer = window.setTimeout(() => {
      start().catch((err) => {
        if (gestopt) return
        const naam = err?.name || ''
        if (naam === 'NotAllowedError' || naam === 'PermissionDeniedError') {
          setFout('De browser blokkeert de camera. Sta camera-toegang toe en probeer opnieuw.')
        } else if (naam === 'NotReadableError') {
          setFout('De camera is bezet door een andere app. Sluit die app en probeer opnieuw.')
        } else {
          setFout('Camera niet beschikbaar. Sta de camera toe, of typ het artikelnummer.')
        }
        setBezig(false)
      })
    }, 60)

    return () => {
      gestopt = true
      window.clearTimeout(startTimer)
      window.clearTimeout(tickTimer)
      stopStream(stream)
      spoorRef.current = null
      video.srcObject = null
    }
  }, [cameraId, herstart])

  // Foto met de camera-app: scherper en op volle resolutie. Beide lezers
  // proberen het, ook een kwartslag gedraaid.
  // Camera-app gesloten zonder foto: het live beeld weer starten.
  useEffect(() => {
    const invoer = fotoRef.current
    if (!invoer) return undefined
    const geannuleerd = () => setHerstart((n) => n + 1)
    invoer.addEventListener('cancel', geannuleerd)
    return () => invoer.removeEventListener('cancel', geannuleerd)
  }, [])

  function fotoKnop() {
    spoorRef.current?.stop()
    fotoRef.current?.click()
  }

  async function leesFoto(e) {
    const bestand = e.target.files?.[0]
    e.target.value = ''
    if (!bestand) {
      setHerstart((n) => n + 1)
      return
    }
    setFotoBezig(true)
    setMelding('Foto lezen…')
    try {
      const plaatje = await createImageBitmap(bestand)
      let waarde = ''
      const detector = await maakDetector()
      if (detector) {
        try {
          const codes = await detector.detect(plaatje)
          waarde = String(codes.find((c) => String(c.rawValue || '').trim())?.rawValue || '').trim()
        } catch {
          // Dan de reservelezer.
        }
      }
      if (!waarde) {
        const canvas = document.createElement('canvas')
        const zxing = maakZxing()
        waarde =
          leesMetZxing(zxing, plaatje, plaatje.width, plaatje.height, canvas, { max: 1600, draai: true }) ||
          leesMetZxing(zxing, plaatje, plaatje.width, plaatje.height, canvas, { max: 2600, draai: true })
      }
      plaatje.close?.()
      if (waarde) {
        onCodeRef.current(waarde)
        return
      }
      setMelding('')
      setFout('Geen streepjescode gevonden op de foto. Kom dichterbij, houd de code recht en probeer opnieuw.')
      setHerstart((n) => n + 1)
    } catch {
      setMelding('')
      setFout('De foto kon niet gelezen worden. Probeer opnieuw of typ het artikelnummer.')
      setHerstart((n) => n + 1)
    } finally {
      setFotoBezig(false)
    }
  }

  function toonMelding(tekst) {
    setMelding(tekst)
    window.setTimeout(() => setMelding((huidig) => (huidig === tekst ? '' : huidig)), 1500)
  }

  async function scherpOp(punt) {
    const spoor = spoorRef.current
    if (!spoor || !info) return
    const modi = info.focus
    if (!modi.length) {
      toonMelding('Deze camera laat scherpstellen niet toe. Probeer "Andere camera".')
      return
    }
    toonMelding('Scherpstellen…')
    setAfstand(null)
    if (modi.includes('single-shot')) {
      await stelScherp(spoor, 'single-shot', punt)
    } else if (info.afstand) {
      // Geen eenmalige scherpstelling: even handmatig op dichtbij en terug naar
      // automatisch dwingt de camera opnieuw scherp te stellen.
      await zetCamera(spoor, { focusMode: 'manual', focusDistance: info.afstand.min })
      await wacht(150)
    }
    await wacht(600)
    if (spoorRef.current === spoor) await stelScherp(spoor, 'continuous', punt)
  }

  function tikOpBeeld(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    scherpOp({
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    })
  }

  async function wijzigAfstand(waarde) {
    const spoor = spoorRef.current
    if (!spoor) return
    setAfstand(waarde)
    await zetCamera(spoor, { focusMode: 'manual', focusDistance: waarde })
  }

  async function wisselZoom() {
    const spoor = spoorRef.current
    const zoom = info?.zoom
    if (!spoor || !zoom) return
    const aan = !zoomAan
    const waarde = aan ? Math.min(zoom.max, Math.max(zoom.min, 2)) : zoom.min
    if (await zetCamera(spoor, { zoom: waarde })) setZoomAan(aan)
  }

  function andereCamera() {
    if (cameras.length < 2) return
    const index = cameras.findIndex((c) => c.deviceId === (spoorRef.current?.getSettings?.().deviceId || cameraId))
    const volgende = cameras[(index + 1) % cameras.length]
    bewaarCameraKeuze(volgende.deviceId)
    setCameraId(volgende.deviceId)
  }

  const uit = bezig || !!fout

  return (
    <div className="opv-camera">
      <video ref={videoRef} muted autoPlay playsInline onPointerDown={tikOpBeeld} />
      <p>
        {bezig && !fout
          ? 'Camera starten…'
          : melding || 'Houd de streepjescode in beeld. Tik op het beeld als het vaag is.'}
      </p>
      {info && (
        <p className="hint">
          {lezer} · {info.naam} · scherpstellen: {info.focus.length ? info.focus.join(', ') : 'niet instelbaar'}
        </p>
      )}
      {fout && <div className="banner banner-warning">{fout}</div>}
      {info?.afstand && (
        <label className="camera-afstand">
          Handmatig scherp
          <input
            type="range"
            min={info.afstand.min}
            max={info.afstand.max}
            step={info.afstand.step || (info.afstand.max - info.afstand.min) / 100}
            value={afstand ?? info.afstand.min}
            onChange={(e) => wijzigAfstand(Number(e.target.value))}
            disabled={uit}
          />
        </label>
      )}
      <div className="camera-knoppen">
        <button type="button" className="btn btn-secondary" onClick={() => scherpOp({ x: 0.5, y: 0.5 })} disabled={uit}>
          {afstand != null ? 'Automatisch scherp' : 'Scherpstellen'}
        </button>
        {info?.zoom && (
          <button type="button" className="btn btn-secondary" onClick={wisselZoom} disabled={uit}>
            {zoomAan ? 'Zoom uit' : 'Zoom 2×'}
          </button>
        )}
        <button type="button" className="btn btn-secondary" onClick={fotoKnop} disabled={fotoBezig}>
          Foto maken
        </button>
        {cameras.length > 1 && (
          <button type="button" className="btn btn-secondary" onClick={andereCamera} disabled={bezig}>
            Andere camera
          </button>
        )}
      </div>
      <input
        ref={fotoRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={leesFoto}
        style={{ display: 'none' }}
      />
      <button type="button" className="btn btn-secondary" onClick={onSluiten}>
        Sluiten
      </button>
    </div>
  )
}

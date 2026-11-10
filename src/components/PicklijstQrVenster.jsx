import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

function isLokaal(host) {
  return host === 'localhost' || host === '127.0.0.1'
}

// Op localhost kan een telefoon de pagina niet openen. Dan het wifi-adres van deze pc.
function useTelefoonUrl(pad) {
  const [url, setUrl] = useState(() => `${window.location.origin}${pad}`)

  useEffect(() => {
    let actief = true
    if (!isLokaal(window.location.hostname)) {
      setUrl(`${window.location.origin}${pad}`)
      return () => {
        actief = false
      }
    }
    fetch('/netwerk-adres')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!actief) return
        const host = data?.host
        const protocol = window.location.protocol || 'https:'
        setUrl(host ? `${protocol}//${host}:${window.location.port}${pad}` : `${window.location.origin}${pad}`)
      })
      .catch(() => {
        if (actief) setUrl(`${window.location.origin}${pad}`)
      })
    return () => {
      actief = false
    }
  }, [pad])

  return url
}

export function TelefoonQr({ pad, tekst, alt = 'QR-code', onClose }) {
  const url = useTelefoonUrl(pad)
  const [src, setSrc] = useState('')
  const [fout, setFout] = useState(null)
  const nogLokaal = isLokaal(new URL(url).hostname)

  useEffect(() => {
    let actief = true
    setSrc('')
    QRCode.toDataURL(url, { margin: 1, width: 280, errorCorrectionLevel: 'M' })
      .then((data) => actief && setSrc(data))
      .catch((err) => actief && setFout(err.message || 'QR-code maken is niet gelukt.'))
    return () => {
      actief = false
    }
  }, [url])

  return (
    <div className="pick-qr">
      <p>{tekst}</p>
      {nogLokaal ? (
        <div className="banner banner-warning">
          De telefoon kan localhost niet openen. Herstart de app even, dan gebruikt de code het
          wifi-adres van deze computer.
        </div>
      ) : (
        <p className="hint">
          De telefoon moet op hetzelfde wifi-netwerk zitten en ingelogd zijn. Op een tablet kun je de
          link hieronder openen.
        </p>
      )}
      {fout && <div className="banner banner-danger">{fout}</div>}
      {src ? <img src={src} alt={alt} /> : <div className="spinner" />}
      <a className="pick-qr-url" href={url}>
        {url}
      </a>
      {onClose && (
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Sluiten
        </button>
      )}
    </div>
  )
}

export function PicklijstQr({ klant, pad, inleiding, onClose }) {
  const naam = [klant.klantcode, klant.naam].filter(Boolean).join(' — ')
  const tekst = inleiding || `Scan de code met de telefoon. De picklijst van ${naam} opent dan.`
  return (
    <TelefoonQr
      pad={pad || `/picklijsten/${klant.id}/mobiel`}
      tekst={tekst}
      alt={`QR-code voor de picklijst van ${naam}`}
      onClose={onClose}
    />
  )
}

export default function PicklijstQrVenster({ klant, pad, inleiding, titel = 'Op telefoon', onClose }) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="modal" style={{ maxWidth: 440 }} onMouseDown={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <h2>{titel}</h2>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Sluiten">
            ✕
          </button>
        </div>
        <PicklijstQr klant={klant} pad={pad} inleiding={inleiding} />
      </div>
    </div>
  )
}

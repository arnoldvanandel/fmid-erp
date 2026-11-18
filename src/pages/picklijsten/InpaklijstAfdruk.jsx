import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import PicklijstQrVenster from '../../components/PicklijstQrVenster'
import { formatDateTime, formatNumber } from '../../lib/format'
import { maakInpaklijst } from '../../lib/picklijst'
import '../inkooporders/afdruk.css'

function aantal(v) {
  return formatNumber(v, Number.isInteger(Number(v)) ? 0 : 2)
}

// Papieren inpaklijst: per orderregel een vak om het doosnummer te noteren.
// PDF via html2canvas + jsPDF, net als pick- en ontvangstrapport.
export default function InpaklijstAfdruk() {
  const { klantId } = useParams()
  const [lijst, setLijst] = useState(null)
  const [error, setError] = useState(null)
  const [qrOpen, setQrOpen] = useState(false)
  const [gemaaktOp] = useState(() => new Date())
  const [pdfFout, setPdfFout] = useState(null)
  const [pdfBezig, setPdfBezig] = useState(false)

  async function downloadPdf() {
    const pagina = document.querySelector('.ontvangst-pagina')
    if (!pagina || pdfBezig) return
    setPdfBezig(true)
    setPdfFout(null)
    const schaduw = pagina.style.boxShadow
    pagina.style.boxShadow = 'none'
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')])
      await Promise.all(
        [...pagina.querySelectorAll('img')].map((img) => (img.complete ? null : img.decode().catch(() => null)))
      )
      await document.fonts?.ready
      const canvas = await html2canvas(pagina, { scale: 2, backgroundColor: '#ffffff', useCORS: true })
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
      const paginaHoogtePx = Math.round((canvas.width * 297) / 210)
      const stuk = document.createElement('canvas')
      stuk.width = canvas.width
      stuk.height = paginaHoogtePx
      const ctx = stuk.getContext('2d')
      for (let y = 0; y < canvas.height - 2; y += paginaHoogtePx) {
        if (y > 0) pdf.addPage()
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, stuk.width, stuk.height)
        ctx.drawImage(canvas, 0, -y)
        pdf.addImage(stuk.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297)
      }
      const naam = `Inpaklijst ${lijst.klant.klantcode || ''}`.trim().replace(/[/:]+/g, '-')
      pdf.save(`${naam}.pdf`)
    } catch (err) {
      setPdfFout(err.message || 'De PDF kon niet worden gemaakt.')
    } finally {
      pagina.style.boxShadow = schaduw
      setPdfBezig(false)
    }
  }

  useEffect(() => {
    let actief = true
    setError(null)
    maakInpaklijst(klantId)
      .then((l) => actief && setLijst(l))
      .catch((err) => actief && setError(err.message))
    return () => {
      actief = false
    }
  }, [klantId])

  useEffect(() => {
    if (lijst?.klant) document.title = `Inpaklijst ${lijst.klant.klantcode}`
  }, [lijst])

  if (error) {
    return (
      <div className="center-screen">
        <div className="banner banner-danger">{error}</div>
      </div>
    )
  }
  if (!lijst) {
    return (
      <div className="center-screen">
        <div className="spinner" />
      </div>
    )
  }

  const lijnen = lijst.lijnen || []
  const pad = `/picklijsten/${klantId}/inpakken`
  const naam = [lijst.klant.klantcode, lijst.klant.naam].filter(Boolean).join(' — ')

  return (
    <div className="afdruk-scherm magazijn-afdruk ontvangst-afdruk">
      <div className="afdruk-toolbar" style={{ gap: 8 }}>
        <Link className="btn btn-secondary" to="/picklijsten">
          Terug
        </Link>
        <button type="button" className="btn btn-secondary" onMouseDown={() => setQrOpen(true)}>
          Op telefoon
        </button>
        <button type="button" className="btn btn-primary" onClick={downloadPdf} disabled={pdfBezig}>
          {pdfBezig ? 'PDF…' : 'PDF'}
        </button>
      </div>
      {pdfFout && (
        <div className="banner banner-danger" style={{ maxWidth: '210mm', margin: '0 auto 12px' }}>
          {pdfFout}
        </div>
      )}

      {qrOpen && (
        <PicklijstQrVenster
          klant={lijst.klant}
          pad={pad}
          titel="Inpakken"
          inleiding={`Scan de code met de telefoon. Het inpakken van ${naam} opent dan.`}
          onClose={() => setQrOpen(false)}
        />
      )}

      <div className="ontvangst-pagina">
        <div className="doc-kop">
          <div className="doc-titelblok">
            <h1 className="doc-titel">Inpaklijst</h1>
            <div className="doc-nummer">
              {lijst.klant.klantcode}
              {lijst.klant.naam ? ` — ${lijst.klant.naam}` : ''}
            </div>
            <div className="doc-datum">{formatDateTime(gemaaktOp)}</div>
          </div>
          <img src="/fmid-logo.png" alt="FMID" className="ontvangst-logo" />
        </div>

        <p className="doc-instructie">
          {lijst.zonderPick
            ? 'Er is nog niets gepickt. Loop eerst de picklijst af. Alleen die regels kunnen ingepakt worden.'
            : 'Alleen wat gepickt is. Per regel staat de picklocatie en op welke verkooporder dit geboekt moet worden bij de pakbon. Noteer het doosnummer; één regel mag over meerdere dozen.'}
        </p>

        {!lijst.zonderPick && lijst.orders?.length > 0 && (
          <p className="doc-instructie">
            Verkooporders: {lijst.orders.map((o) => o.ordernummer).filter(Boolean).join(' · ') || '—'}
          </p>
        )}

        {lijnen.length === 0 ? (
          <p className="doc-instructie">
            {lijst.zonderPick ? 'Geen gepickte regels.' : 'Er is niets gepickt om in te pakken.'}
          </p>
        ) : (
          <table className="ontvangst-tabel">
            <thead>
              <tr>
                <th>Locatie</th>
                <th>Verkooporder</th>
                <th>Artikelnr.</th>
                <th>Omschrijving</th>
                <th className="num">Aantal</th>
                <th>Eenh.</th>
                <th>Doos</th>
              </tr>
            </thead>
            <tbody>
              {lijnen.map((l) => (
                <tr key={l.sleutel}>
                  <td className="ontvangst-locatie pickrapport-locatie">
                    {(l.locatieCodes || []).join(', ') || l.locatieCode || '—'}
                  </td>
                  <td className="doc-nowrap">{l.ordernummer || '—'}</td>
                  <td>
                    <div className="ontvangst-nummer">{l.artikelnummer}</div>
                  </td>
                  <td>{l.artikelnaam}</td>
                  <td className="num">{aantal(l.aantal)}</td>
                  <td className="doc-nowrap">{l.eenheid}</td>
                  <td>
                    <span className="pick-invul" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {!lijst.zonderPick && lijnen.length > 0 && (
          <p className="doc-instructie">
            Bij het maken van de pakbon: boeken op de verkooporder. Zelfde artikel op meerdere orders staat als aparte
            regels.
          </p>
        )}
      </div>
    </div>
  )
}

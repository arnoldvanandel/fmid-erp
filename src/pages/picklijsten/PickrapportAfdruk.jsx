import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { formatDateTime, formatNumber } from '../../lib/format'
import { laadPickrapport } from '../../lib/pickrapport'
import '../inkooporders/afdruk.css'

function aantal(v) {
  return formatNumber(v, Number.isInteger(Number(v)) ? 0 : 2)
}

// Zelfde PDF-opbouw als het rapport binnengekomen goederen: een canvas per
// A4, zodat de locaties op de telefoon en op de printer heel blijven.
export default function PickrapportAfdruk() {
  const { klantId } = useParams()
  const [rapport, setRapport] = useState(null)
  const [error, setError] = useState(null)
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
      const naam = `Pickrapport ${rapport.klantcode || ''}`.trim().replace(/[/:]+/g, '-')
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
    laadPickrapport(klantId)
      .then((r) => {
        if (!actief) return
        if (!r) setError('Er is nog geen pickrapport. Loop de lijst eerst af op de telefoon.')
        else setRapport(r)
      })
      .catch((err) => actief && setError(err.message))
    return () => {
      actief = false
    }
  }, [klantId])

  useEffect(() => {
    if (rapport) document.title = `Pickrapport ${rapport.klantcode || ''}`
  }, [rapport])

  if (error) {
    return (
      <div className="center-screen">
        <div className="banner banner-danger">{error}</div>
      </div>
    )
  }
  if (!rapport) {
    return (
      <div className="center-screen">
        <div className="spinner" />
      </div>
    )
  }

  const regels = rapport.regels || []
  const tekorten = rapport.tekorten || []

  return (
    <div className="afdruk-scherm magazijn-afdruk ontvangst-afdruk">
      <div className="afdruk-toolbar" style={{ gap: 8 }}>
        <Link className="btn btn-secondary" to="/picklijsten">
          Terug
        </Link>
        <button type="button" className="btn btn-primary" onClick={downloadPdf} disabled={pdfBezig}>
          {pdfBezig ? 'PDF…' : 'PDF'}
        </button>
      </div>
      {pdfFout && (
        <div className="banner banner-danger" style={{ maxWidth: '210mm', margin: '0 auto 12px' }}>
          {pdfFout}
        </div>
      )}

      <div className="ontvangst-pagina">
        <div className="doc-kop">
          <div className="doc-titelblok">
            <h1 className="doc-titel">Pickrapport</h1>
            <div className="doc-nummer">
              {rapport.klantcode}
              {rapport.klantNaam ? ` — ${rapport.klantNaam}` : ''}
            </div>
            <div className="doc-datum">
              Gepickt {formatDateTime(rapport.gepicktOp)}
              {rapport.gebruiker ? ` · ${rapport.gebruiker}` : ''}
            </div>
          </div>
          <img src="/fmid-logo.png" alt="FMID" className="ontvangst-logo" />
        </div>

        {rapport.ordernummers?.length ? (
          <p className="doc-instructie">Orders: {rapport.ordernummers.join(', ')}. De voorraad wordt afgeboekt bij de pakbon.</p>
        ) : (
          <p className="doc-instructie">De voorraad wordt afgeboekt bij de pakbon.</p>
        )}

        {regels.length === 0 ? (
          <p className="doc-instructie">Er zijn geen regels gepikt.</p>
        ) : (
          <table className="ontvangst-tabel">
            <colgroup>
              <col className="pickrapport-col-locatie" />
              <col className="pickrapport-col-artikel" />
              <col className="pickrapport-col-aantal" />
              <col className="pickrapport-col-blijft" />
              <col className="pickrapport-col-orders" />
            </colgroup>
            <thead>
              <tr>
                <th>Locatie</th>
                <th>Artikel</th>
                <th className="num">Gepikt</th>
                <th className="num">Blijft</th>
                <th>Orders</th>
              </tr>
            </thead>
            <tbody>
              {regels.map((r, i) => (
                <tr key={`${r.artikelnummer}-${r.locatieCode}-${i}`}>
                  <td className="ontvangst-locatie pickrapport-locatie">{r.locatieCode || '—'}</td>
                  <td>
                    <div className="ontvangst-nummer">{r.artikelnummer}</div>
                    {r.artikelnaam ? <div className="ontvangst-naam">{r.artikelnaam}</div> : null}
                    {r.totaalOpen != null ? <div className="ontvangst-naam">open {aantal(r.totaalOpen)}</div> : null}
                    {r.vervangt ? <div className="ontvangst-naam">omboeken naar {r.vervangt}</div> : null}
                  </td>
                  <td className="num">
                    {aantal(r.aantal)}
                    {r.eenheid ? <span className="ontvangst-eenheid"> {r.eenheid}</span> : null}
                    {r.gevraagd != null && Number(r.gevraagd) !== Number(r.aantal) ? (
                      <div className="ontvangst-naam">voorgesteld {aantal(r.gevraagd)}</div>
                    ) : null}
                  </td>
                  <td className="num">{r.blijft == null ? '—' : aantal(r.blijft)}</td>
                  <td>{(r.ordernummers || []).join(', ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tekorten.length > 0 && (
          <>
            <h2 className="pick-kop">Nog open na het picken</h2>
            <table className="ontvangst-tabel">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Artikel</th>
                  <th className="num">Open</th>
                  <th className="num">Tekort</th>
                </tr>
              </thead>
              <tbody>
                {tekorten.map((t, i) => (
                  <tr key={`${t.ordernummer}-${t.artikelnummer}-${i}`}>
                    <td>{t.ordernummer || '—'}</td>
                    <td>
                      <div className="ontvangst-nummer">{t.artikelnummer}</div>
                      {t.artikelnaam ? <div className="ontvangst-naam">{t.artikelnaam}</div> : null}
                    </td>
                    <td className="num">{t.nodig == null ? '—' : aantal(t.nodig)}</td>
                    <td className="num">
                      {aantal(t.tekort)}
                      {t.eenheid ? <span className="ontvangst-eenheid"> {t.eenheid}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  )
}

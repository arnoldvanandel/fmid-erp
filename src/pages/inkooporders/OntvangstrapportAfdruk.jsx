import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { formatDateTime, formatNumber } from '../../lib/format'
import { laadOntvangstrapport, leesOpenSessieId, sluitOntvangstsessie } from '../../lib/ontvangstrapport'
import './afdruk.css'

function toon(n) {
  const x = Number(n)
  if (!Number.isFinite(x)) return '-'
  return formatNumber(x, Number.isInteger(x) ? 0 : 2)
}

function tijd(value) {
  const d = value?.toDate ? value.toDate() : new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
}

// PDF van één inboeksessie: alleen wat in die sessie op voorraad is gezet.
export default function OntvangstrapportAfdruk() {
  const { id } = useParams()
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
      const naam = `Ontvangstrapport ${formatDateTime(rapport.gestartOp)}`.replace(/[/:]+/g, '-')
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
    laadOntvangstrapport(id)
      .then((r) => {
        if (!actief) return
        if (!r) setError('Dit ontvangstrapport is niet gevonden.')
        else setRapport(r)
      })
      .catch((err) => actief && setError(err.message))
    return () => {
      actief = false
    }
  }, [id])

  useEffect(() => {
    if (rapport) document.title = `Ontvangstrapport ${formatDateTime(rapport.gestartOp)}`
  }, [rapport])

  useEffect(() => {
    if (!rapport || rapport.afgeslotenOp || leesOpenSessieId() !== rapport.id) return
    sluitOntvangstsessie().catch(() => {})
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

  return (
    <div className="afdruk-scherm magazijn-afdruk ontvangst-afdruk">
      <div className="afdruk-toolbar" style={{ gap: 8 }}>
        <Link className="btn btn-secondary" to="/inkooporders/ontvangst/rapporten">
          Alle rapporten
        </Link>
        <Link className="btn btn-secondary" to="/inkooporders/ontvangst">
          Terug naar ontvangen
        </Link>
        <button type="button" className="btn btn-primary" onClick={downloadPdf} disabled={pdfBezig}>
          {pdfBezig ? 'PDF…' : 'PDF'}
        </button>
      </div>
      {pdfFout && <div className="banner banner-danger" style={{ maxWidth: '210mm', margin: '0 auto 12px' }}>{pdfFout}</div>}

      <div className="ontvangst-pagina">
        <div className="doc-kop">
          <div className="doc-titelblok">
            <h1 className="doc-titel">Binnengekomen goederen</h1>
            <div className="doc-nummer">{formatDateTime(rapport.gestartOp)}</div>
            <div className="doc-datum">
              {rapport.gebruiker || '—'} · {regels.length} {regels.length === 1 ? 'regel' : 'regels'}
            </div>
          </div>
          <img src="/fmid-logo.png" alt="FMID" className="ontvangst-logo" />
        </div>

        {regels.length === 0 ? (
          <p className="doc-instructie">In deze sessie is nog niets op voorraad gezet.</p>
        ) : (
          <table className="ontvangst-tabel">
            <colgroup>
              <col className="ontvangst-col-tijd" />
              <col className="ontvangst-col-artikel" />
              <col className="ontvangst-col-locatie" />
              <col className="ontvangst-col-aantal" />
              <col className="ontvangst-col-order" />
            </colgroup>
            <thead>
              <tr>
                <th>Tijd</th>
                <th>Artikel</th>
                <th>Locatie</th>
                <th className="num">Aantal</th>
                <th>Order</th>
              </tr>
            </thead>
            <tbody>
              {regels.map((r, i) => (
                <tr key={`${r.artikelnummer}-${r.ordernummer}-${r.locatieCode}-${i}`}>
                  <td>{tijd(r.geboektOp)}</td>
                  <td>
                    <div className="ontvangst-nummer">{r.artikelnummer}</div>
                    {r.artikelnaam ? <div className="ontvangst-naam">{r.artikelnaam}</div> : null}
                  </td>
                  <td className="ontvangst-locatie">{r.locatieCode || '—'}</td>
                  <td className="num">
                    {toon(r.aantal)}
                    {r.eenheid ? <span className="ontvangst-eenheid"> {r.eenheid}</span> : null}
                  </td>
                  <td>
                    <div>{r.ordernummer || '—'}</div>
                    {r.leverancier ? <div className="ontvangst-naam">{r.leverancier}</div> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

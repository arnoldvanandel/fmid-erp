import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import AantalInput from '../../components/AantalInput'
import { formatDateTime, formatNumber } from '../../lib/format'
import { invoerVan, leesAantal } from '../../lib/pickVerpakking'
import {
  laadPickrapport,
  laadPickrapportOpId,
  pasRapportRegel,
  pasRapportTekort,
  slaPickrapportOp,
  werkPickrapportLokaalBij,
} from '../../lib/pickrapport'
import '../inkooporders/afdruk.css'

function aantal(v) {
  return formatNumber(v, Number.isInteger(Number(v)) ? 0 : 2)
}

function conceptVan(rapport) {
  return {
    regels: (rapport.regels || []).map((r) => ({
      bron: r,
      locatieCode: r.locatieCode || '',
      aantalTekst: invoerVan(r.aantal),
    })),
    tekorten: (rapport.tekorten || []).map((t) => ({
      bron: t,
      tekortTekst: invoerVan(t.tekort),
    })),
  }
}

function weergaveVan(rapport, concept) {
  if (!concept) return rapport
  return {
    ...rapport,
    regels: concept.regels.map((r) => {
      const n = leesAantal(r.aantalTekst)
      return pasRapportRegel(r.bron, {
        aantal: n == null ? r.bron.aantal : n,
        locatieCode: r.locatieCode,
      })
    }),
    tekorten: concept.tekorten.map((t) => {
      const n = leesAantal(t.tekortTekst)
      return pasRapportTekort(t.bron, n == null ? t.bron.tekort : n)
    }),
  }
}

// Zelfde PDF-opbouw als het rapport binnengekomen goederen: een canvas per
// A4, zodat de locaties op de telefoon en op de printer heel blijven.
export default function PickrapportAfdruk() {
  const { klantId, rapportId } = useParams()
  const [rapport, setRapport] = useState(null)
  const [error, setError] = useState(null)
  const [pdfFout, setPdfFout] = useState(null)
  const [pdfBezig, setPdfBezig] = useState(false)
  const [concept, setConcept] = useState(null)
  const [opslaanFout, setOpslaanFout] = useState(null)
  const [opslaanBezig, setOpslaanBezig] = useState(false)
  const [melding, setMelding] = useState(null)

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
    const laden = rapportId ? laadPickrapportOpId(rapportId) : laadPickrapport(klantId)
    laden
      .then((r) => {
        if (!actief) return
        if (!r) {
          setError(
            rapportId
              ? 'Dit pickrapport is niet gevonden.'
              : 'Er is nog geen pickrapport. Loop de lijst eerst af op de telefoon.'
          )
        } else setRapport(r)
      })
      .catch((err) => actief && setError(err.message))
    return () => {
      actief = false
    }
  }, [klantId, rapportId])

  async function opslaan() {
    if (!concept || opslaanBezig) return
    const ongeldig =
      concept.regels.some((r) => leesAantal(r.aantalTekst) == null) ||
      concept.tekorten.some((t) => leesAantal(t.tekortTekst) == null)
    if (ongeldig) {
      setOpslaanFout('Vul een geldig aantal in. Een leeg veld telt als 0.')
      return
    }
    setOpslaanBezig(true)
    setOpslaanFout(null)
    try {
      const bijgewerkt = {
        ...weergaveVan(rapport, concept),
        gewijzigdOp: new Date().toISOString(),
      }
      const op = await slaPickrapportOp(bijgewerkt)
      werkPickrapportLokaalBij(op)
      setRapport(op)
      setConcept(null)
      setMelding('Het rapport is opgeslagen.')
    } catch (err) {
      setOpslaanFout(err.message || 'Opslaan is niet gelukt.')
    } finally {
      setOpslaanBezig(false)
    }
  }

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

  const tonen = weergaveVan(rapport, concept)
  const regels = tonen.regels || []
  const tekorten = tonen.tekorten || []

  return (
    <div className="afdruk-scherm magazijn-afdruk ontvangst-afdruk">
      <div className="afdruk-toolbar" style={{ gap: 8, justifyContent: 'space-between' }}>
        <Link className="btn btn-secondary" to="/picklijsten/rapporten">
          Rapporten
        </Link>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {concept ? (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setConcept(null)
                  setOpslaanFout(null)
                }}
                disabled={opslaanBezig}
              >
                Annuleren
              </button>
              <button type="button" className="btn btn-primary" onClick={opslaan} disabled={opslaanBezig}>
                {opslaanBezig ? 'Opslaan…' : 'Opslaan'}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setConcept(conceptVan(rapport))
                setMelding(null)
                setOpslaanFout(null)
              }}
            >
              Wijzigen
            </button>
          )}
          <button
            type="button"
            className={concept ? 'btn btn-secondary' : 'btn btn-primary'}
            onClick={downloadPdf}
            disabled={pdfBezig}
          >
            {pdfBezig ? 'PDF…' : 'PDF'}
          </button>
        </div>
      </div>
      {(pdfFout || opslaanFout) && (
        <div className="banner banner-danger pickrapport-wijzig" style={{ maxWidth: '210mm', margin: '0 auto 12px' }}>
          {pdfFout || opslaanFout}
        </div>
      )}
      {melding && !concept && (
        <div className="banner banner-info pickrapport-wijzig" style={{ maxWidth: '210mm', margin: '0 auto 12px' }}>
          {melding}
        </div>
      )}
      {concept && (
        <div className="card pickrapport-wijzig" style={{ maxWidth: '210mm', margin: '0 auto 16px' }}>
          <div className="card-pad">
            <h2 style={{ marginBottom: 4 }}>Regels wijzigen</h2>
            <p className="hint" style={{ marginBottom: 12 }}>
              Locatie en gepikt aantal kun je hier corrigeren. Een lager aantal past ook de inpaklijst aan. De PDF
              hieronder volgt meteen mee; opslaan bewaart het rapport.
            </p>
            {concept.regels.length === 0 ? (
              <p className="hint">Er zijn geen gepickte regels.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Locatie</th>
                      <th>Artikel</th>
                      <th className="num">Gepikt</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {concept.regels.map((r, i) => (
                      <tr key={`${r.bron.artikelnummer}-${i}`}>
                        <td>
                          <input
                            type="text"
                            value={r.locatieCode}
                            onChange={(e) =>
                              setConcept((c) => ({
                                ...c,
                                regels: c.regels.map((rij, j) => (j === i ? { ...rij, locatieCode: e.target.value } : rij)),
                              }))
                            }
                            aria-label="Locatie"
                          />
                        </td>
                        <td>
                          {r.bron.artikelnummer}
                          {r.bron.artikelnaam ? <div className="hint">{r.bron.artikelnaam}</div> : null}
                        </td>
                        <td className="num">
                          <AantalInput
                            type="text"
                            value={r.aantalTekst}
                            onValue={(waarde) =>
                              setConcept((c) => ({
                                ...c,
                                regels: c.regels.map((rij, j) => (j === i ? { ...rij, aantalTekst: waarde } : rij)),
                              }))
                            }
                            aria-label="Gepikt"
                            style={{ width: 90, textAlign: 'right' }}
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() =>
                              setConcept((c) => ({ ...c, regels: c.regels.filter((_, j) => j !== i) }))
                            }
                          >
                            Verwijderen
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {concept.tekorten.length > 0 && (
              <>
                <h2 style={{ margin: '16px 0 8px' }}>Nog open</h2>
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Order</th>
                        <th>Artikel</th>
                        <th className="num">Tekort</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {concept.tekorten.map((t, i) => (
                        <tr key={`${t.bron.ordernummer}-${t.bron.artikelnummer}-${i}`}>
                          <td>{t.bron.ordernummer || '—'}</td>
                          <td>{t.bron.artikelnummer}</td>
                          <td className="num">
                            <AantalInput
                              type="text"
                              value={t.tekortTekst}
                              onValue={(waarde) =>
                                setConcept((c) => ({
                                  ...c,
                                  tekorten: c.tekorten.map((rij, j) => (j === i ? { ...rij, tekortTekst: waarde } : rij)),
                                }))
                              }
                              aria-label="Tekort"
                              style={{ width: 90, textAlign: 'right' }}
                            />
                          </td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() =>
                                setConcept((c) => ({ ...c, tekorten: c.tekorten.filter((_, j) => j !== i) }))
                              }
                            >
                              Verwijderen
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
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
              {rapport.gewijzigdOp ? ` · gewijzigd ${formatDateTime(rapport.gewijzigdOp)}` : ''}
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

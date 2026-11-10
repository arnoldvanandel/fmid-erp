import { useState } from 'react'
import { downloadDocumentPdf, drukDocumentPdfAf } from '../lib/documentPdf'

// Knoppen boven een document op het briefpapier (inkooporder, orderbevestiging,
// pakbon, factuur). Beide maken dezelfde A4-PDF als de mailbijlage.
export default function DocumentKnoppen({ gegevens, Document, bestandsnaam }) {
  const [bezig, setBezig] = useState('')
  const [fout, setFout] = useState(null)

  async function doe(soort) {
    setBezig(soort)
    setFout(null)
    try {
      if (soort === 'download') await downloadDocumentPdf(gegevens, Document, bestandsnaam)
      else await drukDocumentPdfAf(gegevens, Document)
    } catch (err) {
      setFout(err.message || 'De PDF kon niet gemaakt worden.')
    } finally {
      setBezig('')
    }
  }

  return (
    <>
      <div className="afdruk-toolbar" style={{ gap: 8 }}>
        <button type="button" className="btn btn-secondary" onClick={() => doe('afdrukken')} disabled={!!bezig}>
          {bezig === 'afdrukken' ? 'Bezig…' : 'Afdrukken'}
        </button>
        <button type="button" className="btn btn-primary" onClick={() => doe('download')} disabled={!!bezig}>
          {bezig === 'download' ? 'Bezig…' : 'PDF downloaden'}
        </button>
      </div>
      {fout && (
        <div className="afdruk-toolbar">
          <div className="banner banner-danger" style={{ width: '100%' }}>
            {fout}
          </div>
        </div>
      )}
    </>
  )
}

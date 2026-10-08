import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { laadDocumentVoorAfdruk, laadVerkooporderVoorAfdruk } from '../../lib/verkooporders'
import { documentTitel } from '../../lib/verkoopMail'
import VerkoopDocument from './VerkoopDocument'

// Printbare orderbevestiging, pakbon of factuur (A4), zoals InkooporderAfdruk.
// `soort` komt uit de route: bevestiging (/verkooporders/:id/afdruk),
// pakbon (/pakbonnen/:id/afdruk) of factuur (/facturen/:id/afdruk).
export default function VerkoopAfdruk({ soort }) {
  const { id } = useParams()
  const [gegevens, setGegevens] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let actief = true
    const laden =
      soort === 'bevestiging'
        ? laadVerkooporderVoorAfdruk(id)
        : laadDocumentVoorAfdruk(soort === 'factuur' ? 'facturen' : 'pakbonnen', id)
    laden.then((g) => actief && setGegevens(g)).catch((err) => actief && setError(err.message))
    return () => {
      actief = false
    }
  }, [id, soort])

  useEffect(() => {
    if (gegevens) document.title = documentTitel(gegevens)
  }, [gegevens])

  if (error) {
    return (
      <div className="center-screen">
        <div className="banner banner-danger">{error}</div>
      </div>
    )
  }

  if (!gegevens) {
    return (
      <div className="center-screen">
        <div className="spinner" />
      </div>
    )
  }

  return (
    <div className="afdruk-scherm">
      <div className="afdruk-toolbar">
        <button className="btn btn-primary" onClick={() => window.print()}>
          Afdrukken / opslaan als PDF
        </button>
      </div>

      <VerkoopDocument {...gegevens} />
    </div>
  )
}

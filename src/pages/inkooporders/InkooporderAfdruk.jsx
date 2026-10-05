import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { laadInkooporderVoorAfdruk } from '../../lib/inkooporders'
import InkooporderDocument from './InkooporderDocument'

// Printbare inkooporder (A4). Opent in een eigen tabblad vanuit het
// inkooporderformulier; via de printdialoog van de browser sla je 'm op als PDF.
export default function InkooporderAfdruk() {
  const { id } = useParams()
  const [gegevens, setGegevens] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let actief = true
    laadInkooporderVoorAfdruk(id)
      .then((g) => actief && setGegevens(g))
      .catch((err) => actief && setError(err.message))
    return () => {
      actief = false
    }
  }, [id])

  useEffect(() => {
    if (gegevens) document.title = `Inkooporder ${gegevens.order.ordernummer}`
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

      <InkooporderDocument {...gegevens} />
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { laadInkooporderVoorAfdruk } from '../../lib/inkooporders'
import InkooporderDocument from './InkooporderDocument'
import DocumentKnoppen from '../../components/DocumentKnoppen'

// Printbare inkooporder (A4). Opent in een eigen tabblad vanuit het
// inkooporderformulier. "PDF downloaden" en "Afdrukken" gebruiken dezelfde
// A4-PDF als de mailbijlage (zie lib/documentPdf.js).
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
      <DocumentKnoppen gegevens={gegevens} Document={InkooporderDocument} bestandsnaam={`Inkooporder ${gegevens.order.ordernummer}`} />

      <InkooporderDocument {...gegevens} />
    </div>
  )
}

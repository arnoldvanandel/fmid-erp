import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { laadCalculatieVoorAfdruk } from '../../lib/calculaties'
import { aanbiedingTitel } from '../../lib/calculatieMail'
import AanbiedingDocument from './AanbiedingDocument'
import DocumentKnoppen from '../../components/DocumentKnoppen'

// Printbare aanbieding (A4), zoals VerkoopAfdruk.
export default function AanbiedingAfdruk() {
  const { id } = useParams()
  const [gegevens, setGegevens] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let actief = true
    laadCalculatieVoorAfdruk(id)
      .then((g) => actief && setGegevens(g))
      .catch((err) => actief && setError(err.message))
    return () => {
      actief = false
    }
  }, [id])

  useEffect(() => {
    if (gegevens) document.title = aanbiedingTitel(gegevens)
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
      <DocumentKnoppen gegevens={gegevens} Document={AanbiedingDocument} bestandsnaam={aanbiedingTitel(gegevens)} />

      <AanbiedingDocument {...gegevens} />
    </div>
  )
}

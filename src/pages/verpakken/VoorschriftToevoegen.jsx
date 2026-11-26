import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import VoorschriftForm from './VoorschriftForm'
import './verpakken.css'

// Pagina om verpakkingsvoorschriften toe te voegen. Na opslaan staat er meteen
// een leeg formulier klaar voor het volgende artikel.
export default function VoorschriftToevoegen() {
  const navigate = useNavigate()
  const [teller, setTeller] = useState(0)
  const [melding, setMelding] = useState(null)

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1>Voorschrift toevoegen</h1>
          <div className="page-header-sub">Nieuw verpakkingsvoorschrift voor een artikel</div>
        </div>
        <Link to="/verpakken/voorschriften" className="btn btn-secondary">
          Alle voorschriften
        </Link>
      </div>

      {melding && <div className="banner banner-info">{melding}</div>}

      <div className="card card-pad verpak-toevoegen">
        <VoorschriftForm
          key={teller}
          voorschrift={{}}
          onDone={(opgeslagen) => {
            if (!opgeslagen) return navigate('/verpakken/voorschriften')
            setMelding(`Voorschrift voor ${opgeslagen.artikelnummer} toegevoegd. Vul het volgende artikel in.`)
            setTeller((n) => n + 1)
          }}
        />
      </div>
    </div>
  )
}

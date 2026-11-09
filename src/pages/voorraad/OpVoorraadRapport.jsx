import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useOpVoorraadMutaties } from '../../hooks/useMutaties'
import { formatNumber } from '../../lib/format'
import '../inkooporders/afdruk.css'

function isoDatum(datum = new Date()) {
  const m = String(datum.getMonth() + 1).padStart(2, '0')
  const dag = String(datum.getDate()).padStart(2, '0')
  return `${datum.getFullYear()}-${m}-${dag}`
}

function verschoven(dagen) {
  const datum = new Date()
  datum.setDate(datum.getDate() + dagen)
  return isoDatum(datum)
}

function lang(iso) {
  const [jaar, maand, dag] = String(iso || '').split('-').map(Number)
  if (!jaar || !maand || !dag) return ''
  return new Date(jaar, maand - 1, dag).toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function periodeTekst(van, tot) {
  if (van && tot && van === tot) return lang(van)
  if (van && tot) return `${lang(van)} t/m ${lang(tot)}`
  if (van) return `vanaf ${lang(van)}`
  if (tot) return `t/m ${lang(tot)}`
  return 'Kies een periode'
}

function toelichting(m) {
  if (m.bron === 'inkooporder') return m.bronNummer || m.reden || '—'
  if (m.reden && m.reden !== 'Op voorraad gezet') return m.reden
  return '—'
}

function toon(n) {
  const x = Number(n)
  if (!Number.isFinite(x)) return '-'
  return formatNumber(x, Number.isInteger(x) ? 0 : 2)
}

function tijdstip(mutatie, alleenTijd) {
  const datum = mutatie.datum?.toDate ? mutatie.datum.toDate() : null
  if (!datum || Number.isNaN(datum.getTime())) return '-'
  if (alleenTijd) return datum.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
  return datum.toLocaleString('nl-NL', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function OpVoorraadRapport() {
  const [van, setVan] = useState(() => isoDatum())
  const [tot, setTot] = useState(() => isoDatum())
  const periodeOngeldig = Boolean(van && tot && van > tot)
  const { mutaties, loading, error, afgekapt } = useOpVoorraadMutaties({
    van: periodeOngeldig ? '' : van,
    tot: periodeOngeldig ? '' : tot,
  })
  const alleenTijd = Boolean(van && van === tot)

  useEffect(() => {
    document.title = 'Op voorraad gezet'
  }, [])

  const totalen = useMemo(() => {
    const perEenheid = new Map()
    for (const m of mutaties) {
      const eenheid = m.eenheid || ''
      perEenheid.set(eenheid, (perEenheid.get(eenheid) || 0) + (Number(m.aantal) || 0))
    }
    return [...perEenheid.entries()]
  }, [mutaties])

  function zetDag(dagen) {
    const iso = verschoven(dagen)
    setVan(iso)
    setTot(iso)
  }

  const periode = periodeTekst(van, tot)

  return (
    <div className="afdruk-scherm">
      <div className="afdruk-toolbar rapport-balk">
        <div className="rapport-filters">
          <div className="field">
            <label htmlFor="rapport-van">Van</label>
            <input id="rapport-van" type="date" value={van} onChange={(e) => setVan(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="rapport-tot">Tot en met</label>
            <input id="rapport-tot" type="date" value={tot} onChange={(e) => setTot(e.target.value)} />
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => zetDag(0)}>
            Vandaag
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => zetDag(-1)}>
            Gisteren
          </button>
        </div>
        <div className="rapport-acties">
          <Link className="btn btn-secondary" to="/voorraad">
            Terug
          </Link>
          <button type="button" className="btn btn-primary" onClick={() => window.print()} disabled={loading}>
            PDF
          </button>
        </div>
      </div>

      <div className="afdruk-pagina pick-pagina">
        <div className="doc-kop">
          <div className="doc-titelblok">
            <h1 className="doc-titel">Op voorraad gezet</h1>
            <div className="doc-nummer">{periode}</div>
          </div>
          <img src="/fmid-logo.png" alt="FMID" className="pick-logo" />
        </div>

        <p className="doc-instructie">
          Wat er op een locatie is bijgeboekt, via op voorraad zetten of via een ontvangst.
          {mutaties.length > 0
            ? ` ${mutaties.length} ${mutaties.length === 1 ? 'boeking' : 'boekingen'}` +
              (totalen.length
                ? `, samen ${totalen.map(([eenheid, aantal]) => `${toon(aantal)} ${eenheid || 'stuks'}`).join(', ')}.`
                : '.')
            : ''}
        </p>

        {periodeOngeldig && <div className="banner banner-warning">De begindatum ligt na de einddatum.</div>}
        {error && <div className="banner banner-danger">{error}</div>}
        {afgekapt && (
          <div className="banner banner-warning">
            Deze periode bevat te veel mutaties om ze allemaal te tonen. Kies een kortere periode.
          </div>
        )}

        {loading ? (
          <div className="spinner" />
        ) : periodeOngeldig ? null : mutaties.length === 0 ? (
          <p className="doc-instructie">In deze periode is er niets op voorraad gezet.</p>
        ) : (
          <table className="doc-regels pick-regels">
            <thead>
              <tr>
                <th>{alleenTijd ? 'Tijd' : 'Datum'}</th>
                <th>Artikelnr.</th>
                <th>Omschrijving</th>
                <th>Locatie</th>
                <th className="num">Aantal</th>
                <th>Eenh.</th>
                <th>Order / verpakking</th>
                <th>Door</th>
              </tr>
            </thead>
            <tbody>
              {mutaties.map((m) => (
                <tr key={m.id}>
                  <td className="doc-nowrap">{tijdstip(m, alleenTijd)}</td>
                  <td className="doc-artikelnummer doc-nowrap">{m.artikelnummer}</td>
                  <td>{m.artikelnaam}</td>
                  <td className="pick-locatie doc-nowrap">{m.locatieCode || '—'}</td>
                  <td className="num pick-aantal">{toon(m.aantal)}</td>
                  <td className="doc-nowrap">{m.eenheid || ''}</td>
                  <td>{toelichting(m)}</td>
                  <td>{m.gebruiker || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import LocatieKiezer from '../../components/LocatieKiezer'
import { useAuth } from '../../contexts/AuthContext'
import { useCollection } from '../../hooks/useCollection'
import { formatNumber } from '../../lib/format'
import { boekOntvangst, standaardLocaties } from '../../lib/inkooporders'

function toon(n) {
  const x = Number(n)
  if (!Number.isFinite(x)) return '-'
  return formatNumber(x, Number.isInteger(x) ? 0 : 2)
}

// Telefoon: kies een open inkoopregel, zie de locatie, vul het aantal in
// (vooringevuld met wat er op de order nog openstaat) en boek de ontvangst.
export default function OntvangstMobiel() {
  const { profile } = useAuth()
  const { data: orders, loading: ladenOrders, error: foutOrders } = useCollection('inkooporders')
  const { data: regels, loading: ladenRegels, error: foutRegels } = useCollection('inkooporderregels')
  const [regelId, setRegelId] = useState('')
  const [aantal, setAantal] = useState('')
  const [locatie, setLocatie] = useState(null)
  const [locatieCode, setLocatieCode] = useState('')
  const [ladenLocatie, setLadenLocatie] = useState(false)
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState(null)
  const [melding, setMelding] = useState(null)
  const locatieVraag = useRef(0)

  useEffect(() => {
    document.title = 'Goederen ontvangen'
  }, [])

  const openRegels = useMemo(() => {
    const orderById = Object.fromEntries(orders.map((o) => [o.id, o]))
    return regels
      .map((r) => {
        const order = orderById[r.inkooporderId]
        if (!order || order.status === 'geannuleerd') return null
        const besteld = Number(r.aantal) || 0
        const ontvangen = Number(r.ontvangen) || 0
        const open = Math.max(0, besteld - ontvangen)
        if (open <= 1e-9) return null
        return {
          id: r.id,
          inkooporderId: order.id,
          ordernummer: order.ordernummer || '',
          leverancier: [order.leverancierscode, order.leverancierNaam].filter(Boolean).join(' — '),
          artikelId: r.artikelId,
          artikelnummer: r.artikelnummer || '',
          artikelnaam: r.artikelnaam || '',
          eenheid: r.eenheid || '',
          besteld,
          ontvangen,
          open,
        }
      })
      .filter(Boolean)
      .sort(
        (a, b) =>
          String(a.artikelnummer).localeCompare(String(b.artikelnummer), 'nl', { numeric: true, sensitivity: 'base' }) ||
          String(a.ordernummer).localeCompare(String(b.ordernummer), 'nl', { numeric: true })
      )
  }, [orders, regels])

  const gekozen = openRegels.find((r) => r.id === regelId) || null
  const laden = ladenOrders || ladenRegels
  const laadFout = foutOrders || foutRegels

  function kiesRegel(id) {
    setRegelId(id)
    setFout(null)
    setMelding(null)
    setLocatie(null)
    setLocatieCode('')
    const regel = openRegels.find((r) => r.id === id)
    if (!regel) {
      setAantal('')
      return
    }
    setAantal(String(regel.open))
    setLadenLocatie(true)
    const vraag = ++locatieVraag.current
    standaardLocaties([regel.artikelId])
      .then((voorstel) => {
        if (vraag !== locatieVraag.current) return
        const plek = voorstel[regel.artikelId]
        if (plek) {
          setLocatie({ id: plek.id, code: plek.code })
          setLocatieCode(plek.code || '')
        }
      })
      .catch((err) => {
        if (vraag === locatieVraag.current) setFout(err.message)
      })
      .finally(() => {
        if (vraag === locatieVraag.current) setLadenLocatie(false)
      })
  }

  async function plaats(e) {
    e.preventDefault()
    setFout(null)
    setMelding(null)
    if (!gekozen) {
      setFout('Kies een artikel.')
      return
    }
    if (!locatie?.id) {
      setFout(locatieCode.trim() ? `Locatie "${locatieCode.trim()}" bestaat niet.` : 'Dit artikel ligt nog nergens. Kies een locatie.')
      return
    }
    const n = Number(String(aantal).replace(',', '.'))
    if (!Number.isFinite(n) || n <= 0) {
      setFout('Vul in hoeveel stuks op voorraad zijn gezet.')
      return
    }
    if (n > gekozen.open + 1e-9) {
      setFout(`Op ${gekozen.ordernummer} staat nog ${toon(gekozen.open)} ${gekozen.eenheid} open. Meer ontvangen kan niet.`)
      return
    }
    setBezig(true)
    try {
      await boekOntvangst({
        inkooporderId: gekozen.inkooporderId,
        ontvangst: { [gekozen.id]: { aantal: n, locatieId: locatie.id } },
        gebruiker: profile?.naam || profile?.email || '',
      })
      setMelding(`${toon(n)} ${gekozen.eenheid} ${gekozen.artikelnummer} op ${locatie.code} gezet.`)
      setRegelId('')
      setAantal('')
      setLocatie(null)
      setLocatieCode('')
    } catch (err) {
      setFout(err.message)
    } finally {
      setBezig(false)
    }
  }

  return (
    <div className="pick-mobiel opv">
      <header className="pick-mobiel-kop">
        <Link to="/inkooporders">Stoppen</Link>
        <div className="pick-mobiel-kop-midden">
          <strong>Ontvangen</strong>
          <span>{gekozen ? gekozen.artikelnummer : 'Kies een open artikel'}</span>
        </div>
        <div className="pick-mobiel-teller" />
      </header>

      <form id="ontvangst-boek" className="pick-mobiel-inhoud" onSubmit={plaats}>
        {laden ? (
          <div className="pick-mobiel-midden">
            <div className="spinner" />
          </div>
        ) : (
          <div className="pick-mobiel-kaart">
            {melding && <div className="banner banner-info">{melding}</div>}
            {(laadFout || fout) && <div className="banner banner-danger">{laadFout || fout}</div>}

            <div className="field">
              <label htmlFor="ontvangst-artikel">Artikel</label>
              <select id="ontvangst-artikel" value={regelId} onChange={(e) => kiesRegel(e.target.value)}>
                <option value="">Kies uit de openstaande inkooporders…</option>
                {openRegels.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.artikelnummer}
                    {r.artikelnaam ? ` — ${r.artikelnaam}` : ''} ({r.ordernummer}, open {toon(r.open)} {r.eenheid})
                  </option>
                ))}
              </select>
              {openRegels.length === 0 && <span className="hint">Er staat niets open op een inkooporder.</span>}
            </div>

            {gekozen && (
              <>
                <div>
                  <div className="pick-mobiel-label">Locatie</div>
                  {ladenLocatie ? (
                    <div className="spinner" />
                  ) : locatie?.code ? (
                    <div className="pick-mobiel-locatie">{locatie.code}</div>
                  ) : (
                    <>
                      <p className="hint">Dit artikel ligt nog nergens. Kies waar het komt te liggen.</p>
                      <LocatieKiezer
                        value={locatieCode}
                        onChange={setLocatieCode}
                        onKies={(l) => setLocatie(l ? { id: l.id, code: l.code } : null)}
                        placeholder="Locatie…"
                      />
                    </>
                  )}
                </div>
                <div className="pick-mobiel-extra">
                  {gekozen.ordernummer}
                  {gekozen.leverancier ? ` · ${gekozen.leverancier}` : ''}
                </div>
                <div className="field">
                  <label htmlFor="ontvangst-aantal">Aantal op voorraad gezet</label>
                  <input
                    id="ontvangst-aantal"
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    value={aantal}
                    onChange={(e) => setAantal(e.target.value)}
                  />
                  <span className="hint">
                    Op de order staat {toon(gekozen.besteld)} {gekozen.eenheid}
                    {gekozen.ontvangen > 0 ? `, waarvan ${toon(gekozen.ontvangen)} al ontvangen` : ''}. Het veld start op
                    het nog openstaande aantal ({toon(gekozen.open)}).
                  </span>
                </div>
              </>
            )}
          </div>
        )}

      </form>
      {gekozen && (
        <footer className="pick-mobiel-voet">
          <button type="submit" form="ontvangst-boek" className="btn btn-primary pick-mobiel-gepikt" disabled={bezig || ladenLocatie}>
            {bezig ? 'Boeken…' : 'Ontvangst boeken'}
          </button>
        </footer>
      )}
    </div>
  )
}

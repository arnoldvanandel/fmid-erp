import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { formatNumber } from '../../lib/format'
import { maakPicklijstPerKlant } from '../../lib/picklijst'
import { bouwPickrapport, leesPickrapportLokaal, pasPickHoeveelheid, schrijfPickrapportLokaal, slaPickrapportOp } from '../../lib/pickrapport'

function aantal(v) {
  return formatNumber(v, Number.isInteger(Number(v)) ? 0 : 2)
}

function leesAantal(waarde) {
  const tekst = String(waarde ?? '').trim().replace(',', '.')
  if (!tekst) return null
  const n = Number(tekst)
  return Number.isFinite(n) ? n : null
}

function invoerVan(n) {
  const afgerond = Math.round((Number(n) || 0) * 1000) / 1000
  if (Number.isInteger(afgerond)) return String(afgerond)
  return String(afgerond).replace('.', ',')
}

function leesVoortgang(sleutel) {
  try {
    const raw = sessionStorage.getItem(sleutel)
    if (!raw) return { index: 0, gepickt: {} }
    if (raw.startsWith('{')) {
      const data = JSON.parse(raw)
      return {
        index: Number.isInteger(data.index) && data.index >= 0 ? data.index : 0,
        gepickt: data.gepickt && typeof data.gepickt === 'object' ? data.gepickt : {},
      }
    }
    const n = Number(raw)
    return { index: Number.isInteger(n) && n >= 0 ? n : 0, gepickt: {} }
  } catch {
    return { index: 0, gepickt: {} }
  }
}

function schrijfVoortgang(sleutel, voortgang) {
  try {
    sessionStorage.setItem(sleutel, JSON.stringify(voortgang))
  } catch {
    // Opslag kan geblokkeerd zijn; de loop gaat gewoon door.
  }
}

// Eén regel tegelijk, voor op de telefoon in het magazijn. Boekt niets:
// de voorraad gaat pas af bij de pakbon.
export default function PicklijstMobiel() {
  const { klantId } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [lijst, setLijst] = useState(null)
  const [error, setError] = useState(null)
  const [index, setIndex] = useState(0)
  const [gepickt, setGepickt] = useState({})
  const [invoer, setInvoer] = useState('')
  const [fout, setFout] = useState(null)
  const [rapportFout, setRapportFout] = useState(null)
  const [rapportKlaar, setRapportKlaar] = useState(false)
  const inhoudRef = useRef(null)
  const laatstGeklikt = useRef(0)
  const voortgangSleutel = `picklijst-mobiel-${klantId}`

  useEffect(() => {
    let actief = true
    setError(null)
    setLijst(null)
    maakPicklijstPerKlant(klantId)
      .then((l) => {
        if (!actief) return
        const voortgang = leesVoortgang(voortgangSleutel)
        setLijst(l)
        setGepickt(voortgang.gepickt)
        setIndex(Math.min(voortgang.index, l.picks.length))
      })
      .catch((err) => actief && setError(err.message))
    return () => {
      actief = false
    }
  }, [klantId, voortgangSleutel])

  useEffect(() => {
    if (lijst) schrijfVoortgang(voortgangSleutel, { index, gepickt })
  }, [index, gepickt, lijst, voortgangSleutel])

  useEffect(() => {
    if (lijst?.klant) document.title = `Picken ${lijst.klant.klantcode}`
  }, [lijst])

  useEffect(() => {
    setRapportKlaar(Boolean(leesPickrapportLokaal(klantId)))
  }, [klantId])

  function bewaarRapport(bevestigd = gepickt) {
    if (!lijst?.picks?.length) return
    const rapport = bouwPickrapport({
      klant: lijst.klant,
      orders: lijst.orders,
      picks: lijst.picks.map((p) => pasPickHoeveelheid(p, bevestigd[p.sleutel])),
      tekorten: lijst.tekorten,
      gebruiker: profile?.naam || profile?.email || '',
    })
    schrijfPickrapportLokaal(rapport)
    setRapportKlaar(true)
    setRapportFout(null)
    slaPickrapportOp(rapport).catch((err) => setRapportFout(err.message))
  }

  useEffect(() => {
    inhoudRef.current?.scrollTo(0, 0)
  }, [index])

  const huidigePick = lijst?.picks?.[index]
  useEffect(() => {
    if (!huidigePick) return
    const bekend = gepickt[huidigePick.sleutel]
    setInvoer(invoerVan(bekend == null ? huidigePick.aantal : bekend))
    setFout(null)
    // Alleen bij een andere regel, niet terwijl het aantal wordt ingetypt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [huidigePick?.sleutel])

  function bevestig() {
    const nu = Date.now()
    if (nu - laatstGeklikt.current < 400) return
    laatstGeklikt.current = nu
    if (!pick) return
    const gevraagd = Number(pick.aantal) || 0
    const n = leesAantal(invoer)
    if (n == null || n < 0) {
      setFout('Vul het gepickte aantal in.')
      return
    }
    if (n > gevraagd + 1e-9) {
      setFout(`Maximaal ${aantal(gevraagd)} ${pick.eenheid || 'stuks'}.`)
      setInvoer(invoerVan(gevraagd))
      return
    }
    const nieuw = { ...gepickt, [pick.sleutel]: n }
    setGepickt(nieuw)
    setFout(null)
    const volgend = index + 1
    setIndex(volgend)
    if (lijst && volgend >= lijst.picks.length && lijst.picks.length > 0) bewaarRapport(nieuw)
  }

  function stapAantal(delta) {
    if (!pick) return
    const gevraagd = Number(pick.aantal) || 0
    const huidig = leesAantal(invoer)
    const basis = huidig == null ? gevraagd : huidig
    const volgende = Math.min(gevraagd, Math.max(0, basis + delta))
    setInvoer(invoerVan(volgende))
    setFout(null)
  }

  function openRapport() {
    if (!rapportKlaar) bewaarRapport()
    navigate(`/picklijsten/${klantId}/rapport`)
  }

  function vorige() {
    setIndex((i) => Math.max(0, i - 1))
  }

  function opnieuw() {
    setIndex(0)
    setGepickt({})
    setFout(null)
  }

  if (error) {
    return (
      <div className="pick-mobiel">
        <Kop />
        <div className="pick-mobiel-inhoud">
          <div className="banner banner-danger">{error}</div>
        </div>
      </div>
    )
  }

  if (!lijst) {
    return (
      <div className="pick-mobiel">
        <div className="pick-mobiel-inhoud pick-mobiel-midden">
          <div className="spinner" />
        </div>
      </div>
    )
  }

  const { klant, picks, tekorten } = lijst
  const klaar = index >= picks.length
  const pick = picks[index]
  const ingevuld = leesAantal(invoer)
  const minder = picks.filter((p) => {
    const bevestigd = gepickt[p.sleutel]
    return bevestigd != null && Number(bevestigd) < (Number(p.aantal) || 0) - 1e-9
  }).length

  return (
    <div className="pick-mobiel">
      <Kop klant={klant} index={klaar ? picks.length : index} totaal={picks.length} />
      {picks.length > 0 && (
        <div className="pick-mobiel-balk">
          <div style={{ width: `${(Math.min(index, picks.length) / picks.length) * 100}%` }} />
        </div>
      )}

      <div className="pick-mobiel-inhoud" ref={inhoudRef}>
        {picks.length === 0 ? (
          <Leeg tekorten={tekorten} />
        ) : klaar ? (
          <Klaar
            klant={klant}
            klantId={klantId}
            aantalRegels={picks.length}
            minder={minder}
            tekorten={tekorten}
            rapportFout={rapportFout}
            onRapport={openRapport}
            onVorige={vorige}
            onOpnieuw={opnieuw}
          />
        ) : (
          <Regel pick={pick} gepicktAantal={ingevuld} />
        )}
      </div>

      {pick && (
        <footer className="pick-mobiel-voet">
          {index > 0 && (
            <button type="button" className="btn btn-ghost pick-mobiel-vorige" onClick={vorige}>
              Vorige
            </button>
          )}
          <div className="field">
            <label htmlFor="gepickt-aantal">Gepickt</label>
            <div className="inpak-doos">
              <button
                type="button"
                className="btn btn-secondary"
                aria-label="Minder"
                onClick={() => stapAantal(-1)}
                disabled={ingevuld != null && ingevuld <= 0}
              >
                −
              </button>
              <input
                id="gepickt-aantal"
                value={invoer}
                onChange={(e) => {
                  setInvoer(e.target.value)
                  setFout(null)
                }}
                inputMode="decimal"
                autoComplete="off"
              />
              <button
                type="button"
                className="btn btn-secondary"
                aria-label="Meer"
                onClick={() => stapAantal(1)}
                disabled={ingevuld != null && ingevuld >= (Number(pick.aantal) || 0) - 1e-9}
              >
                +
              </button>
            </div>
            <p className="hint">Minder gepakt? Pas het aantal aan en bevestig.</p>
          </div>
          {fout && <div className="banner banner-danger">{fout}</div>}
          <button type="button" className="btn btn-primary pick-mobiel-gepikt" onClick={bevestig}>
            {ingevuld === 0 ? 'Niets gepickt' : ingevuld == null ? 'Bevestig' : `Bevestig ${aantal(ingevuld)}`}
          </button>
        </footer>
      )}
    </div>
  )
}

function Kop({ klant, index = 0, totaal = 0 }) {
  return (
    <header className="pick-mobiel-kop">
      <Link to="/picklijsten">Stoppen</Link>
      <div className="pick-mobiel-kop-midden">
        {klant ? (
          <>
            <strong>{klant.klantcode}</strong>
            <span>{klant.naam}</span>
          </>
        ) : (
          <strong>Picklijst</strong>
        )}
      </div>
      <div className="pick-mobiel-teller">
        {totaal > 0 ? (index >= totaal ? 'Klaar' : `${index + 1} van ${totaal}`) : ''}
      </div>
    </header>
  )
}

function blijftLiggen(pick) {
  const voorraad = Number(pick.voorraadOpLocatie ?? pick.opLocatie)
  if (!Number.isFinite(voorraad)) return null
  return Math.max(0, voorraad - (Number(pick.aantal) || 0))
}

function Regel({ pick, gepicktAantal }) {
  const orders = (pick.ordernummers || [pick.ordernummer]).filter(Boolean)
  const blijft = blijftLiggen({ ...pick, aantal: gepicktAantal == null ? pick.aantal : gepicktAantal })
  return (
    <div className="pick-mobiel-kaart">
      <div>
        <div className="pick-mobiel-label">Locatie</div>
        <div className="pick-mobiel-locatie">{pick.locatieCode || '—'}</div>
      </div>
      <div>
        <div className="pick-mobiel-label">Pak</div>
        <div className="pick-mobiel-aantal">
          {aantal(pick.aantal)}
          {pick.eenheid ? <span>{pick.eenheid}</span> : null}
        </div>
        {blijft != null && (
          <div className="pick-mobiel-blijft">
            <div className="pick-mobiel-label">Blijft liggen</div>
            <strong>
              {aantal(blijft)} {pick.eenheid || 'stuks'}
            </strong>
          </div>
        )}
      </div>
      <div>
        <div className="pick-mobiel-label">Artikel</div>
        <div className="pick-mobiel-artikel">{pick.artikelnummer}</div>
        {pick.artikelnaam ? <div className="pick-mobiel-naam">{pick.artikelnaam}</div> : null}
      </div>
      {pick.vervangt && <div className="banner banner-warning">Pak dit artikel. Wordt omgeboekt naar {pick.vervangt}.</div>}
      {orders.length > 0 && (
        <div className="pick-mobiel-extra">
          {orders.length === 1 ? 'Order' : 'Orders'} {orders.join(', ')}
        </div>
      )}
    </div>
  )
}

function Leeg({ tekorten }) {
  return (
    <div className="pick-mobiel-klaar">
      <h1>Niets te picken</h1>
      <p>Alles is geleverd, of het staat niet op voorraad.</p>
      <Tekorten tekorten={tekorten} />
      <Link className="btn btn-primary pick-mobiel-terug" to="/picklijsten">
        Terug naar picklijsten
      </Link>
    </div>
  )
}

function Klaar({ klant, klantId, aantalRegels, minder = 0, tekorten, rapportFout, onRapport, onVorige, onOpnieuw }) {
  return (
    <div className="pick-mobiel-klaar">
      <h1>Klaar</h1>
      <p>
        {`${aantalRegels} ${aantalRegels === 1 ? 'regel' : 'regels'} bevestigd voor ${klant.klantcode}${klant.naam ? ` — ${klant.naam}` : ''}.`}
      </p>
      {minder > 0 && (
        <p>
          {`${minder} ${minder === 1 ? 'regel is' : 'regels zijn'} met minder gepickt dan gevraagd. Alleen dat aantal kan ingepakt worden.`}
        </p>
      )}
      <p className="pick-mobiel-extra">De voorraad wordt afgeboekt bij de pakbon.</p>
      {rapportFout && <div className="banner banner-danger">{rapportFout}</div>}
      <div className="pick-mobiel-klaar-acties">
        <button type="button" className="btn btn-primary" onClick={onRapport}>
          PDF rapport
        </button>
        <button type="button" className="btn btn-secondary" onClick={onVorige}>
          Laatste regel
        </button>
        <button type="button" className="btn btn-secondary" onClick={onOpnieuw}>
          Opnieuw
        </button>
        <Link className="btn btn-secondary" to={`/picklijsten/${klantId}`}>
          PDF picklijst
        </Link>
        <Link className="btn btn-secondary" to="/picklijsten">
          Terug naar picklijsten
        </Link>
      </div>
      <Tekorten tekorten={tekorten} />
    </div>
  )
}

function Tekorten({ tekorten }) {
  if (!tekorten?.length) return null
  return (
    <div className="pick-mobiel-tekorten">
      <h2>Niet op voorraad</h2>
      {tekorten.map((t) => (
        <div key={`${t.ordernummer}-${t.regelId || t.regelnummer}`} className="pick-mobiel-tekort">
          <strong>{t.artikelnummer}</strong>
          <span>
            {aantal(t.tekort)} {t.eenheid} tekort
          </span>
          {t.artikelnaam ? <span>{t.artikelnaam}</span> : null}
        </div>
      ))}
    </div>
  )
}

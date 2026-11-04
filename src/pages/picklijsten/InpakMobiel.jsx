import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { formatNumber } from '../../lib/format'
import {
  bouwInpakrapport,
  leesAantal,
  leesInpakvoortgang,
  restAantal,
  schrijfInpakrapportLokaal,
  schrijfInpakvoortgang,
  slaInpakrapportOp,
  toegewezenAantal,
} from '../../lib/inpakrapport'
import { maakInpaklijst } from '../../lib/picklijst'

function aantal(v) {
  return formatNumber(v, Number.isInteger(Number(v)) ? 0 : 2)
}

function invoerVan(n) {
  const afgerond = Math.round((Number(n) || 0) * 1000) / 1000
  if (Number.isInteger(afgerond)) return String(afgerond)
  return String(afgerond).replace('.', ',')
}

function isNummer(waarde) {
  const tekst = String(waarde ?? '').trim()
  const n = parseInt(tekst, 10)
  return tekst !== '' && Number.isFinite(n) && String(n) === tekst
}

function stapDoosWaarde(huidig, delta) {
  const tekst = String(huidig ?? '').trim()
  if (!isNummer(tekst)) return delta > 0 ? '2' : '1'
  return String(Math.max(1, parseInt(tekst, 10) + delta))
}

function volgendeDoosNummer(huidig, verdeling) {
  const tekst = String(huidig ?? '').trim()
  if (isNummer(tekst)) return String(parseInt(tekst, 10) + 1)
  const nummers = (verdeling || [])
    .map((v) => (isNummer(v.doos) ? parseInt(v.doos, 10) : NaN))
    .filter((n) => Number.isFinite(n))
  if (isNummer(tekst)) nummers.push(parseInt(tekst, 10))
  const hoogste = nummers.length ? Math.max(...nummers) : 0
  return String(hoogste + 1)
}

function inDoosAantal(verdeling, sleutel, doos) {
  return (verdeling || [])
    .filter((v) => v.sleutel === sleutel && String(v.doos) === String(doos))
    .reduce((som, v) => som + (Number(v.aantal) || 0), 0)
}

function maxVoorDoos(lijn, verdeling, doos) {
  return inDoosAantal(verdeling, lijn.sleutel, doos) + restAantal(lijn, verdeling)
}

function pasInhoud(verdeling, { sleutel, doos, aantal }) {
  const doel = String(doos)
  const rest = (verdeling || []).filter((v) => !(v.sleutel === sleutel && String(v.doos) === doel))
  if (aantal <= 1e-6) return rest
  return [...rest, { sleutel, doos: doel, aantal }]
}

function dozenLijst(lijnen, verdeling, huidigeDoos) {
  const perSleutel = Object.fromEntries((lijnen || []).map((l) => [l.sleutel, l]))
  const labels = [huidigeDoos, ...(verdeling || []).map((v) => v.doos)]
    .map((d) => String(d ?? '').trim())
    .filter(Boolean)
  let hoogste = 0
  const extra = []
  for (const label of labels) {
    if (isNummer(label)) hoogste = Math.max(hoogste, parseInt(label, 10))
    else if (!extra.includes(label)) extra.push(label)
  }
  if (hoogste < 1) hoogste = 1
  const dozen = []
  for (let i = 1; i <= hoogste; i += 1) dozen.push(String(i))
  dozen.push(...extra)
  return dozen.map((doos) => {
    const gezien = new Set()
    const regels = []
    for (const v of verdeling || []) {
      if (String(v.doos) !== doos || gezien.has(v.sleutel)) continue
      gezien.add(v.sleutel)
      const lijn = perSleutel[v.sleutel]
      if (!lijn) continue
      regels.push({ sleutel: v.sleutel, doos, aantal: inDoosAantal(verdeling, v.sleutel, doos), lijn })
    }
    return { doos, regels }
  })
}

// Eén orderregel tegelijk. Het aantal mag over dozen, en een doos over orders.
export default function InpakMobiel() {
  const { klantId } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [lijst, setLijst] = useState(null)
  const [error, setError] = useState(null)
  const [index, setIndex] = useState(0)
  const [verdeling, setVerdeling] = useState([])
  const [doos, setDoos] = useState('1')
  const [invoer, setInvoer] = useState('')
  const [fout, setFout] = useState(null)
  const [melding, setMelding] = useState(null)
  const [bewerking, setBewerking] = useState(null)
  const [rapportFout, setRapportFout] = useState(null)
  const inhoudRef = useRef(null)
  const laatstGeklikt = useRef(0)

  useEffect(() => {
    let actief = true
    setError(null)
    setLijst(null)
    maakInpaklijst(klantId)
      .then((l) => {
        if (!actief) return
        const voortgang = leesInpakvoortgang(klantId)
        const bekend = new Set(l.lijnen.map((lijn) => lijn.sleutel))
        setVerdeling(voortgang.verdeling.filter((v) => bekend.has(v.sleutel)))
        setDoos(voortgang.doos || '1')
        setIndex(Math.min(voortgang.index, l.lijnen.length))
        setLijst(l)
      })
      .catch((err) => actief && setError(err.message))
    return () => {
      actief = false
    }
  }, [klantId])

  useEffect(() => {
    if (!lijst) return
    schrijfInpakvoortgang(klantId, { index, verdeling, doos })
  }, [klantId, lijst, index, verdeling, doos])

  useEffect(() => {
    if (lijst?.klant) document.title = `Inpakken ${lijst.klant.klantcode}`
  }, [lijst])

  useEffect(() => {
    inhoudRef.current?.scrollTo(0, 0)
  }, [index])

  const lijn = lijst?.lijnen?.[index] || null
  const rest = lijn ? restAantal(lijn, verdeling) : 0
  const toegewezen = lijn ? toegewezenAantal(verdeling, lijn.sleutel) : 0
  const klaar = Boolean(lijst && lijst.lijnen.length > 0 && index >= lijst.lijnen.length)
  const leeg = Boolean(lijst && lijst.lijnen.length === 0)

  useEffect(() => {
    if (!lijn) return
    setInvoer(invoerVan(restAantal(lijn, verdeling)))
    setFout(null)
    // Alleen bij een andere regel of een nieuwe verdeling van deze regel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lijn?.sleutel, toegewezen])

  function bewaarRapport() {
    if (!lijst?.lijnen?.length) return null
    const gemaakt = bouwInpakrapport({
      klant: lijst.klant,
      lijnen: lijst.lijnen,
      verdeling,
      gebruiker: profile?.naam || profile?.email || '',
    })
    schrijfInpakrapportLokaal(gemaakt)
    setRapportFout(null)
    slaInpakrapportOp(gemaakt).catch((err) => setRapportFout(err.message))
    return gemaakt
  }

  useEffect(() => {
    if (klaar) bewaarRapport()
    // Opnieuw opslaan als de dozen daarna nog veranderen, zodat de pc hetzelfde ziet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [klaar, verdeling])

  function inDoos() {
    const nu = Date.now()
    if (nu - laatstGeklikt.current < 400) return
    laatstGeklikt.current = nu
    if (!lijn) return
    const doosNr = String(doos).trim()
    const stuks = leesAantal(invoer)
    const nog = restAantal(lijn, verdeling)
    if (!doosNr) {
      setFout('Vul een doos in.')
      return
    }
    if (stuks <= 0) {
      setFout('Vul een aantal in.')
      return
    }
    if (stuks > nog + 1e-6) {
      setFout(`Er zijn nog ${aantal(nog)} ${lijn.eenheid || 'stuks'} in te pakken.`)
      return
    }
    const over = nog - stuks
    setVerdeling((huidig) => [...huidig, { sleutel: lijn.sleutel, doos: doosNr, aantal: stuks }])
    setFout(null)
    setMelding(null)
    setBewerking(null)
    if (over <= 1e-6) setIndex((i) => i + 1)
  }

  function zetDoos(waarde) {
    setDoos(waarde)
    setFout(null)
  }

  function kiesDoos(nr) {
    const doel = String(nr || '').trim()
    if (!doel) return
    setDoos(doel)
    setFout(null)
    window.requestAnimationFrame(() => {
      document.getElementById(`inpak-blok-${doel}`)?.scrollIntoView({ block: 'nearest' })
    })
  }

  function naarVolgendeDoos() {
    kiesDoos(volgendeDoosNummer(doos, verdeling))
  }

  function startWijzig(regel) {
    setBewerking({
      sleutel: regel.sleutel,
      vanDoos: String(regel.doos),
      doos: String(regel.doos),
      invoer: invoerVan(regel.aantal),
    })
    setFout(null)
    setMelding(null)
  }

  function bewaarWijziging() {
    if (!bewerking || !lijst) return
    const lijnVanDoos = lijst.lijnen.find((l) => l.sleutel === bewerking.sleutel)
    if (!lijnVanDoos) return
    const doel = String(bewerking.doos || '').trim()
    const stuks = leesAantal(bewerking.invoer)
    const max = maxVoorDoos(lijnVanDoos, verdeling, bewerking.vanDoos)
    if (!doel) {
      setFout('Vul een doos in.')
      return
    }
    if (stuks < 0) {
      setFout('Vul een aantal in.')
      return
    }
    if (stuks > max + 1e-6) {
      setFout(`Van deze regel passen er nog ${aantal(max)} in een doos.`)
      return
    }
    const zonder = pasInhoud(verdeling, { sleutel: bewerking.sleutel, doos: bewerking.vanDoos, aantal: 0 })
    const nieuw =
      stuks <= 1e-6
        ? zonder
        : pasInhoud(zonder, {
            sleutel: bewerking.sleutel,
            doos: doel,
            aantal: inDoosAantal(zonder, bewerking.sleutel, doel) + stuks,
          })
    pasVerdelingToe(nieuw, lijnVanDoos, stuks <= 1e-6)
  }

  function uitDeDoos(regel) {
    if (!lijst) return
    const lijnVanDoos = lijst.lijnen.find((l) => l.sleutel === regel.sleutel) || regel.lijn
    const nieuw = pasInhoud(verdeling, { sleutel: regel.sleutel, doos: regel.doos, aantal: 0 })
    pasVerdelingToe(nieuw, lijnVanDoos, true)
  }

  function pasVerdelingToe(nieuw, lijnVanDoos, teruggezet) {
    setVerdeling(nieuw)
    setBewerking(null)
    setFout(null)
    if (!lijnVanDoos) return
    const nog = restAantal(lijnVanDoos, nieuw)
    if (nog > 1e-6) {
      const i = lijst.lijnen.findIndex((l) => l.sleutel === lijnVanDoos.sleutel)
      if (i >= 0) setIndex(i)
      setMelding(
        teruggezet
          ? `${lijnVanDoos.artikelnummer} uit de doos gehaald. Nog ${aantal(nog)} ${lijnVanDoos.eenheid || 'stuks'} in te pakken.`
          : `${lijnVanDoos.artikelnummer}: nog ${aantal(nog)} ${lijnVanDoos.eenheid || 'stuks'} in te pakken.`
      )
      return
    }
    setMelding(null)
  }

  function vorige() {
    setIndex((i) => Math.max(0, i - 1))
    setFout(null)
    setMelding(null)
    setBewerking(null)
  }

  function opnieuw() {
    setVerdeling([])
    setIndex(0)
    setDoos('1')
    setFout(null)
    setMelding(null)
    setBewerking(null)
    setRapportFout(null)
  }

  function openRapport() {
    bewaarRapport()
    navigate(`/picklijsten/${klantId}/inpakrapport`)
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
        <Kop />
        <div className="pick-mobiel-inhoud">
          <div className="spinner" />
        </div>
      </div>
    )
  }

  const dozen = dozenLijst(lijst.lijnen, verdeling, doos)

  return (
    <div className="pick-mobiel">
      <Kop klant={lijst.klant} index={index} totaal={lijst.lijnen.length} />
      {lijn && (
        <Regel
          lijn={lijn}
          rest={rest}
          toegewezen={toegewezen}
          fout={fout}
          melding={melding}
        />
      )}
      <div className="pick-mobiel-inhoud" ref={inhoudRef}>
        {leeg ? (
          <Leeg zonderPick={lijst.zonderPick} klantId={klantId} />
        ) : klaar ? (
          <Klaar
            klant={lijst.klant}
            klantId={klantId}
            dozen={dozen}
            rapportFout={rapportFout}
            bewerking={bewerking}
            onRapport={openRapport}
            onVorige={vorige}
            onOpnieuw={opnieuw}
            onWijzig={startWijzig}
            onBewerk={(deel) => setBewerking((h) => (h ? { ...h, ...deel } : h))}
            onBewaar={bewaarWijziging}
            onUitDoos={uitDeDoos}
            onAnnuleer={() => setBewerking(null)}
            fout={fout}
          />
        ) : (
          <Dozen
            dozen={dozen}
            huidige={String(doos).trim()}
            bewerking={bewerking}
            kiesbaar
            onKies={kiesDoos}
            onWijzig={startWijzig}
            onBewerk={(deel) => setBewerking((h) => (h ? { ...h, ...deel } : h))}
            onBewaar={bewaarWijziging}
            onUitDoos={uitDeDoos}
            onAnnuleer={() => setBewerking(null)}
          />
        )}
      </div>

      {lijn && (
        <footer className="pick-mobiel-voet">
          {rest > 1e-6 && (
            <div className="inpak-voet-velden">
              <div className="field">
                <label htmlFor="inpak-doos">Doos</label>
                <DoosKiezer
                  id="inpak-doos"
                  value={doos}
                  onChange={zetDoos}
                  onStap={(delta) => kiesDoos(stapDoosWaarde(doos, delta))}
                />
              </div>
              <div className="field">
                <label htmlFor="inpak-aantal">Aantal</label>
                <input
                  id="inpak-aantal"
                  value={invoer}
                  onChange={(e) => setInvoer(e.target.value)}
                  inputMode="decimal"
                  autoComplete="off"
                />
              </div>
            </div>
          )}
          <div className={index > 0 ? 'inpak-voet-rij' : undefined}>
            {index > 0 && (
              <button type="button" className="btn btn-ghost pick-mobiel-vorige" onClick={vorige}>
                Vorige regel
              </button>
            )}
            <button type="button" className="btn btn-secondary inpak-volgende" onClick={naarVolgendeDoos}>
              Volgende doos
            </button>
          </div>
          {rest <= 1e-6 ? (
            <button
              type="button"
              className="btn btn-primary pick-mobiel-gepikt"
              onClick={() => {
                setMelding(null)
                setIndex((i) => i + 1)
              }}
            >
              {index + 1 >= lijst.lijnen.length ? 'Afronden' : 'Volgende regel'}
            </button>
          ) : (
            <button type="button" className="btn btn-primary pick-mobiel-gepikt" onClick={inDoos}>
              In doos {String(doos).trim() || '…'}
            </button>
          )}
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
          <strong>Inpakken</strong>
        )}
      </div>
      <div className="pick-mobiel-teller">
        {totaal > 0 ? (index >= totaal ? 'Klaar' : `${index + 1} van ${totaal}`) : ''}
      </div>
    </header>
  )
}

function Regel({ lijn, rest, toegewezen, fout, melding }) {
  const vol = rest <= 1e-6
  return (
    <div className="inpak-nu">
      <div className="inpak-nu-kop">
        <div>
          <div className="pick-mobiel-label">Order</div>
          <div className="inpak-nu-order">{lijn.ordernummer || '—'}</div>
        </div>
        <div className="inpak-nu-rest">
          <div className="pick-mobiel-label">{vol ? 'Ingepakt' : 'Nog'}</div>
          <strong>
            {aantal(vol ? lijn.aantal : rest)}
            {lijn.eenheid ? <span> {lijn.eenheid}</span> : null}
          </strong>
        </div>
      </div>
      <div className="inpak-nu-artikel">{lijn.artikelnummer}</div>
      {lijn.artikelnaam ? <div className="pick-mobiel-naam">{lijn.artikelnaam}</div> : null}
      {toegewezen > 0 && !vol ? (
        <div className="pick-mobiel-extra">
          {aantal(toegewezen)} van {aantal(lijn.aantal)} zit al in een doos
        </div>
      ) : null}
      {melding && <div className="banner banner-info">{melding}</div>}
      {fout && <div className="banner banner-danger">{fout}</div>}
    </div>
  )
}

function DoosKiezer({ id, value, onChange, onStap }) {
  const lager = isNummer(value) && parseInt(value, 10) <= 1
  const stap = onStap || ((delta) => onChange(stapDoosWaarde(value, delta)))
  return (
    <div className="inpak-doos">
      <button type="button" className="btn btn-secondary" aria-label="Lagere doos" onClick={() => stap(-1)} disabled={lager}>
        −
      </button>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="numeric"
        autoComplete="off"
      />
      <button type="button" className="btn btn-secondary" aria-label="Hogere doos" onClick={() => stap(1)}>
        +
      </button>
    </div>
  )
}

function Dozen({ dozen, huidige, bewerking, kiesbaar = false, onKies, onWijzig, onBewerk, onBewaar, onUitDoos, onAnnuleer }) {
  return (
    <div className="inpak-dozen">
      {dozen.map((blok) => {
        const huidig = blok.doos === huidige
        return (
          <section
            key={blok.doos}
            id={`inpak-blok-${blok.doos}`}
            className={huidig ? 'inpak-doos-blok inpak-doos-blok-huidig' : 'inpak-doos-blok'}
          >
            <div className="inpak-doos-kopregel">
              <strong>Doos {blok.doos}</strong>
              {kiesbaar && huidig ? <span className="inpak-doos-huidig">huidige</span> : null}
              {kiesbaar && !huidig ? (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => onKies(blok.doos)}>
                  Naar deze doos
                </button>
              ) : null}
            </div>
            {blok.regels.length === 0 ? (
              <p className="inpak-doos-leeg">Nog leeg</p>
            ) : (
              blok.regels.map((regel) => {
                const open =
                  bewerking && bewerking.sleutel === regel.sleutel && bewerking.vanDoos === String(regel.doos)
                return (
                  <div key={`${regel.sleutel}-${regel.doos}`} className="inpak-doos-regel">
                    <div className="inpak-doos-regel-kop">
                      <div>
                        <strong>{regel.lijn.artikelnummer}</strong>
                        <div className="inpak-doos-meta">
                          {aantal(regel.aantal)} {regel.lijn.eenheid} · Order {regel.lijn.ordernummer}
                        </div>
                        {regel.lijn.artikelnaam ? <div className="inpak-doos-meta">{regel.lijn.artikelnaam}</div> : null}
                      </div>
                      {!open && (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onWijzig(regel)}>
                          Wijzig
                        </button>
                      )}
                    </div>
                    {open && (
                      <div className="inpak-wijzig">
                        <div className="field">
                          <label htmlFor={`wijzig-doos-${regel.sleutel}`}>Doos</label>
                          <DoosKiezer
                            id={`wijzig-doos-${regel.sleutel}`}
                            value={bewerking.doos}
                            onChange={(waarde) => onBewerk({ doos: waarde })}
                          />
                        </div>
                        <div className="field">
                          <label htmlFor={`wijzig-aantal-${regel.sleutel}`}>Aantal</label>
                          <input
                            id={`wijzig-aantal-${regel.sleutel}`}
                            value={bewerking.invoer}
                            onChange={(e) => onBewerk({ invoer: e.target.value })}
                            inputMode="decimal"
                          />
                        </div>
                        <div className="inpak-wijzig-acties">
                          <button type="button" className="btn btn-secondary" onClick={onBewaar}>
                            Bewaar
                          </button>
                          <button type="button" className="btn btn-ghost" onClick={() => onUitDoos(regel)}>
                            Uit de doos
                          </button>
                        </div>
                        <button type="button" className="btn btn-ghost" onClick={onAnnuleer}>
                          Annuleren
                        </button>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </section>
        )
      })}
    </div>
  )
}

function Leeg({ zonderPick, klantId }) {
  return (
    <div className="pick-mobiel-klaar">
      <h1>{zonderPick ? 'Eerst picken' : 'Niets in te pakken'}</h1>
      <p>
        {zonderPick
          ? 'Inpakken kan alleen met wat op de picklijst is afgevinkt. Loop de picklijst eerst af.'
          : 'Er is niets gepickt dat nog ingepakt moet worden.'}
      </p>
      {zonderPick ? (
        <Link className="btn btn-primary pick-mobiel-terug" to={`/picklijsten/${klantId}/mobiel`}>
          Naar de picklijst
        </Link>
      ) : (
        <Link className="btn btn-primary pick-mobiel-terug" to="/picklijsten">
          Terug naar picklijsten
        </Link>
      )}
    </div>
  )
}

function Klaar({
  klant,
  klantId,
  dozen,
  rapportFout,
  bewerking,
  fout,
  onRapport,
  onVorige,
  onOpnieuw,
  onWijzig,
  onBewerk,
  onBewaar,
  onUitDoos,
  onAnnuleer,
}) {
  const gevulde = dozen.filter((d) => d.regels.length > 0)
  return (
    <div className="pick-mobiel-klaar">
      <h1>Ingepakt</h1>
      <p>
        {`${gevulde.length} ${gevulde.length === 1 ? 'doos' : 'dozen'} voor ${klant.klantcode}${klant.naam ? ` — ${klant.naam}` : ''}.`}
      </p>
      {rapportFout && (
        <div className="banner banner-danger">
          Het rapport staat op deze telefoon. De pc kon het niet opslaan: {rapportFout}
        </div>
      )}
      {fout && <div className="banner banner-danger">{fout}</div>}
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
        <Link className="btn btn-secondary" to={`/picklijsten/${klantId}/inpaklijst`}>
          PDF inpaklijst
        </Link>
        <Link className="btn btn-secondary" to="/picklijsten">
          Terug naar picklijsten
        </Link>
      </div>
      <Dozen
        dozen={gevulde}
        huidige=""
        bewerking={bewerking}
        onKies={() => {}}
        onWijzig={onWijzig}
        onBewerk={onBewerk}
        onBewaar={onBewaar}
        onUitDoos={onUitDoos}
        onAnnuleer={onAnnuleer}
      />
    </div>
  )
}

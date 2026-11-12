import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import AantalInput from '../../components/AantalInput'
import BarcodeCamera, { CameraIcoon, cameraBeschikbaar } from '../../components/BarcodeCamera'
import { useAuth } from '../../contexts/AuthContext'
import { haalArtikelOpBarcode } from '../../lib/artikelZoeken'
import { formatNumber } from '../../lib/format'
import { maakPicklijstPerKlant } from '../../lib/picklijst'
import {
  bouwPickrapport,
  leesPickrapportLokaal,
  nieuwPickrapportId,
  schrijfPickrapportLokaal,
  slaPickrapportOp,
} from '../../lib/pickrapport'
import {
  anboLocaties,
  bonfixLocaties,
  bonfixTePakken,
  controlePickInvoer,
  leesAantal,
  pasLocatieInvoer,
  pasTotaalInvoer,
  picksUitStappen,
  rond3,
  somInvoer,
  standaardPickInvoer,
  verpakkingTekst,
  verpakkingVanAantal,
  vulLocatieInvoer,
} from '../../lib/pickVerpakking'
import { boekVoorraadMutatie } from '../../lib/voorraad'

function aantal(v) {
  return formatNumber(v, Number.isInteger(Number(v)) ? 0 : 2)
}

function leesVoortgang(sleutel) {
  try {
    const raw = sessionStorage.getItem(sleutel)
    if (!raw) return { index: 0, gepickt: {}, rapportId: '' }
    const data = JSON.parse(raw)
    return {
      index: Number.isInteger(data.index) && data.index >= 0 ? data.index : 0,
      gepickt: data.gepickt && typeof data.gepickt === 'object' ? data.gepickt : {},
      rapportId: typeof data.rapportId === 'string' ? data.rapportId : '',
    }
  } catch {
    return { index: 0, gepickt: {}, rapportId: '' }
  }
}

function schrijfVoortgang(sleutel, voortgang) {
  try {
    sessionStorage.setItem(sleutel, JSON.stringify(voortgang))
  } catch {
    // Opslag kan geblokkeerd zijn; de loop gaat gewoon door.
  }
}

// Eén artikel tegelijk, voor op de telefoon in het magazijn. Boekt geen pick
// af: de voorraad gaat pas af bij de pakbon. Een locatie die fysiek leeg is
// kan hier wel op 0 gezet worden.
export default function PicklijstMobiel() {
  const { klantId } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [lijst, setLijst] = useState(null)
  const [error, setError] = useState(null)
  const [index, setIndex] = useState(0)
  const [gepickt, setGepickt] = useState({})
  const [fout, setFout] = useState(null)
  const [melding, setMelding] = useState(null)
  const [rapportFout, setRapportFout] = useState(null)
  const [rapportKlaar, setRapportKlaar] = useState(false)
  const [camera, setCamera] = useState(false)
  const [scan, setScan] = useState(null)
  const [nulBezig, setNulBezig] = useState(null)
  const scanVraag = useRef(0)
  const inhoudRef = useRef(null)
  const laatstGeklikt = useRef(0)
  const rapportIdRef = useRef('')
  const voortgangSleutel = `picklijst-mobiel-v2-${klantId}`

  useEffect(() => {
    let actief = true
    setError(null)
    setLijst(null)
    maakPicklijstPerKlant(klantId)
      .then((l) => {
        if (!actief) return
        const voortgang = leesVoortgang(voortgangSleutel)
        const stappen = l.stappen || []
        rapportIdRef.current = voortgang.rapportId
        setLijst(l)
        setGepickt(voortgang.gepickt)
        setIndex(Math.min(voortgang.index, stappen.length))
      })
      .catch((err) => actief && setError(err.message))
    return () => {
      actief = false
    }
  }, [klantId, voortgangSleutel])

  useEffect(() => {
    if (lijst) schrijfVoortgang(voortgangSleutel, { index, gepickt, rapportId: rapportIdRef.current })
  }, [index, gepickt, lijst, voortgangSleutel])

  useEffect(() => {
    if (lijst?.klant) document.title = `Picken ${lijst.klant.klantcode}`
  }, [lijst])

  useEffect(() => {
    setRapportKlaar(Boolean(leesPickrapportLokaal(klantId)))
  }, [klantId])

  useEffect(() => {
    inhoudRef.current?.scrollTo(0, 0)
  }, [index])

  const stappen = lijst?.stappen || []
  const stap = stappen[index]

  const stapSleutel = stap?.sleutel
  useEffect(() => {
    if (!stap) return
    setGepickt((h) => (h[stap.sleutel] ? h : { ...h, [stap.sleutel]: standaardPickInvoer(stap) }))
    scanVraag.current += 1
    setScan(null)
    // Alleen bij een ander artikel. Voorraad op 0 houdt de ingevulde aantallen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stapSleutel])

  function invoerVanStap(huidige, bron = gepickt) {
    return bron[huidige.sleutel] || standaardPickInvoer(huidige)
  }

  function bewaarRapport(bevestigd = gepickt) {
    if (!stappen.length) return
    const id = rapportIdRef.current || nieuwPickrapportId()
    rapportIdRef.current = id
    const { picks, tekorten } = picksUitStappen(stappen, bevestigd)
    const rapport = {
      ...bouwPickrapport({
        klant: lijst.klant,
        orders: lijst.orders,
        picks,
        tekorten,
        gebruiker: profile?.naam || profile?.email || '',
      }),
      id,
    }
    schrijfVoortgang(voortgangSleutel, { index, gepickt: bevestigd, rapportId: id })
    schrijfPickrapportLokaal(rapport)
    setRapportKlaar(true)
    setRapportFout(null)
    slaPickrapportOp(rapport).catch((err) => setRapportFout(err.message))
  }

  function gaNaar(volgendeIndex, controleer) {
    const nu = Date.now()
    if (nu - laatstGeklikt.current < 400) return
    laatstGeklikt.current = nu
    if (controleer && stap) {
      const meldingFout = controlePickInvoer(stap, invoerVanStap(stap))
      if (meldingFout) {
        setFout(meldingFout)
        return
      }
    }
    if (volgendeIndex >= stappen.length) {
      const probleemIndex = stappen.findIndex((s) => controlePickInvoer(s, invoerVanStap(s)))
      if (probleemIndex >= 0) {
        setIndex(probleemIndex)
        setFout(controlePickInvoer(stappen[probleemIndex], invoerVanStap(stappen[probleemIndex])))
        return
      }
      bewaarRapport()
    }
    setFout(null)
    setMelding(null)
    setIndex(Math.max(0, Math.min(volgendeIndex, stappen.length)))
  }

  async function controleerScan(code) {
    const regel = stap
    if (!regel) return
    const vraag = ++scanVraag.current
    setScan({ status: 'bezig', code })
    try {
      const artikel = await haalArtikelOpBarcode(code)
      if (vraag !== scanVraag.current) return
      if (!artikel) {
        setScan({ status: 'onbekend', code })
        return
      }
      const ids = new Set([regel.artikelId, ...regel.locaties.map((l) => l.artikelId)])
      const nummers = new Set([regel.artikelnummer, ...regel.locaties.map((l) => l.artikelnummer)])
      if (ids.has(artikel.id) || nummers.has(artikel.artikelnummer)) setScan({ status: 'goed', code })
      else setScan({ status: 'fout', code, artikelnummer: artikel.artikelnummer })
    } catch (err) {
      if (vraag === scanVraag.current) setScan({ status: 'onbekend', code, melding: err.message })
    }
  }

  function openRapport() {
    if (!rapportKlaar) bewaarRapport()
    navigate(`/picklijsten/${klantId}/rapport`)
  }

  async function zetOpNul(loc) {
    if (!stap || nulBezig) return
    const tekst = `Voorraad van ${loc.artikelnummer} op locatie ${loc.locatieCode} op 0 zetten? Volgens het systeem ligt er ${aantal(loc.voorraad)}.`
    if (!window.confirm(tekst)) return
    setNulBezig(loc.sleutel)
    setFout(null)
    try {
      await boekVoorraadMutatie({
        artikelId: loc.artikelId,
        locatieId: loc.locatieId,
        type: 'correctie',
        aantal: 0,
        reden: 'Op 0 gezet tijdens picken',
        bron: 'picklijst',
        gebruiker: profile?.naam || profile?.email || '',
      })
      setLijst((h) => ({
        ...h,
        stappen: h.stappen.map((s) =>
          s.sleutel !== stap.sleutel
            ? s
            : {
                ...s,
                locaties: s.locaties.map((x) =>
                  x.sleutel === loc.sleutel ? { ...x, voorraad: 0, voorgesteld: 0 } : x
                ),
              }
        ),
      }))
      setGepickt((h) => ({
        ...h,
        [stap.sleutel]: pasLocatieInvoer(stap, h[stap.sleutel], loc.sleutel, '0'),
      }))
      setMelding(`Locatie ${loc.locatieCode} staat op 0.`)
    } catch (err) {
      setFout(err.message)
    } finally {
      setNulBezig(null)
    }
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

  const { klant, tekorten } = lijst
  const klaar = index >= stappen.length
  const invoer = stap ? invoerVanStap(stap) : null
  const gepaktNu = stap ? somInvoer(stap.locaties, invoer?.locaties) : 0
  const minder = stappen.filter((s) => {
    const ingevuld = somInvoer(s.locaties, invoerVanStap(s).locaties)
    return s.locaties.length > 0 && ingevuld + 1e-9 < (Number(s.totaalOpen) || 0)
  }).length

  return (
    <div className="pick-mobiel">
      <Kop klant={klant} index={klaar ? stappen.length : index} totaal={stappen.length} />
      {stappen.length > 0 && (
        <div className="pick-mobiel-balk">
          <div style={{ width: `${(Math.min(index, stappen.length) / stappen.length) * 100}%` }} />
        </div>
      )}
      {stappen.length > 0 && (
        <div className="pick-mobiel-nav">
          <button type="button" className="btn btn-secondary" onClick={() => gaNaar(index - 1, false)} disabled={index <= 0}>
            Vorige
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => gaNaar(index + 1, false)} disabled={klaar}>
            Volgende
          </button>
        </div>
      )}

      <div className="pick-mobiel-inhoud" ref={inhoudRef}>
        {stappen.length === 0 ? (
          <Leeg tekorten={tekorten} />
        ) : klaar ? (
          <Klaar
            klant={klant}
            klantId={klantId}
            aantalRegels={stappen.length}
            minder={minder}
            tekorten={tekorten}
            rapportFout={rapportFout}
            onRapport={openRapport}
            onVorige={() => gaNaar(stappen.length - 1, false)}
            onOpnieuw={() => {
              rapportIdRef.current = ''
              setIndex(0)
              setGepickt({})
              setFout(null)
            }}
          />
        ) : (
          <StapKaart
            key={stap.sleutel}
            stap={stap}
            invoer={invoer}
            scan={scan}
            melding={melding}
            nulBezig={nulBezig}
            onScan={cameraBeschikbaar() ? () => setCamera(true) : null}
            onInvoer={(volgende) => {
              setGepickt((h) => ({ ...h, [stap.sleutel]: volgende }))
              setFout(null)
            }}
            onNul={zetOpNul}
          />
        )}
      </div>

      {stap && (
        <footer className="pick-mobiel-voet">
          {fout && <div className="banner banner-danger">{fout}</div>}
          <button type="button" className="btn btn-primary pick-mobiel-gepikt" onClick={() => gaNaar(index + 1, true)}>
            {stap.locaties.length === 0
              ? 'Verder'
              : gepaktNu === 0
                ? 'Niets gepickt'
                : `Bevestig ${aantal(gepaktNu)}`}
          </button>
        </footer>
      )}

      {camera && (
        <BarcodeCamera
          onCode={(code) => {
            setCamera(false)
            controleerScan(code)
          }}
          onSluiten={() => setCamera(false)}
        />
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

function ScanUitslag({ scan, stap }) {
  if (!scan) return null
  if (scan.status === 'bezig') return <div className="banner banner-info">Barcode {scan.code} opzoeken…</div>
  if (scan.status === 'goed') {
    return (
      <div>
        <span className="badge badge-success">Juist artikel gescand</span>
      </div>
    )
  }
  if (scan.status === 'fout') {
    return (
      <div className="banner banner-danger">
        Verkeerd artikel: dit is {scan.artikelnummer}. Pak {stap.artikelnummer}.
      </div>
    )
  }
  return (
    <div className="banner banner-warning">
      {scan.melding || `Geen artikel met barcode ${scan.code} gevonden. Controleer het artikelnummer.`}
    </div>
  )
}

function VerpakkingWeergave({ hoeveelheid, doos, zak }) {
  const v = verpakkingVanAantal(hoeveelheid, doos, zak)
  if (!v) return null
  const delen = []
  if (v.dozen) delen.push({ sleutel: 'doos', tekst: `${aantal(v.dozen)} ${v.dozen === 1 ? 'doos' : 'dozen'}` })
  if (v.zakjes) delen.push({ sleutel: 'zak', tekst: `${aantal(v.zakjes)} ${v.zakjes === 1 ? 'zakje' : 'zakjes'}` })
  if (v.los) delen.push({ sleutel: 'los', tekst: `${aantal(v.los)} los` })
  if (!delen.length) return null
  return (
    <div className="pick-verpakking">
      {delen.map((d) => (
        <span key={d.sleutel} className="pick-verpakking-deel">
          {d.tekst}
        </span>
      ))}
    </div>
  )
}

function VerpakkingVelden({ doos, zak, onTotaal }) {
  const [dozen, setDozen] = useState('')
  const [zakjes, setZakjes] = useState('')
  const [los, setLos] = useState('')
  const perDoos = Number(doos) > 1 ? Number(doos) : 0
  const perZak = Number(zak) > 1 ? Number(zak) : 0
  if (!perDoos && !perZak) return null

  function werk(volgende) {
    const d = leesAantal(volgende.dozen)
    const z = leesAantal(volgende.zakjes)
    const l = leesAantal(volgende.los)
    if (d == null || z == null || l == null) return
    if (!String(volgende.dozen).trim() && !String(volgende.zakjes).trim() && !String(volgende.los).trim()) return
    onTotaal(rond3((d || 0) * perDoos + (z || 0) * perZak + (l || 0)))
  }

  return (
    <div className="pick-verpakking-invoer">
      {perDoos > 0 && (
        <div className="field">
          <label>Volle dozen</label>
          <AantalInput
            value={dozen}
            onValue={(waarde) => {
              setDozen(waarde)
              werk({ dozen: waarde, zakjes, los })
            }}
            placeholder="0"
          />
          <span className="hint">1 doos = {aantal(perDoos)}</span>
        </div>
      )}
      {perZak > 0 && (
        <div className="field">
          <label>Zakjes</label>
          <AantalInput
            value={zakjes}
            onValue={(waarde) => {
              setZakjes(waarde)
              werk({ dozen, zakjes: waarde, los })
            }}
            placeholder="0"
          />
          <span className="hint">1 zakje = {aantal(perZak)}</span>
        </div>
      )}
      <div className="field">
        <label>Losse stuks</label>
        <AantalInput
          value={los}
          onValue={(waarde) => {
            setLos(waarde)
            werk({ dozen, zakjes, los: waarde })
          }}
          placeholder="0"
        />
      </div>
    </div>
  )
}

function LocatieTegels({ locs, invoer, onLocatie, onVul, onNul, nulBezig }) {
  return (
    <div className="locatie-tegels">
      {locs.map((loc) => {
        const gepakt = leesAantal(invoer.locaties?.[loc.sleutel]) || 0
        const blijft = Math.max(0, rond3((Number(loc.voorraad) || 0) - Math.max(0, gepakt)))
        const meer = gepakt > (Number(loc.voorraad) || 0) + 1e-9 && (Number(loc.voorraad) || 0) >= 0
        return (
          <div
            key={loc.sleutel}
            className={'locatie-tegel' + (String(invoer.locaties?.[loc.sleutel] || '').trim() ? ' actief' : '')}
            onClick={(e) => {
              if (e.target.closest('input, button')) return
              onVul(loc.sleutel)
            }}
          >
            <strong>{loc.locatieCode}</strong>
            {loc.isBonfix ? <div className="pick-tegel-meta">Bonfix {loc.artikelnummer}</div> : null}
            <div className="pick-tegel-meta">ligt er {aantal(loc.voorraad)}</div>
            <div className="pick-tegel-meta">blijft {aantal(blijft)}</div>
            <AantalInput
              value={invoer.locaties?.[loc.sleutel] ?? ''}
              onValue={(waarde) => onLocatie(loc.sleutel, waarde)}
              aria-label={`Aantal op ${loc.locatieCode}`}
              placeholder="Aantal"
            />
            {meer ? <div className="pick-tegel-meta">Meer dan er op deze locatie ligt.</div> : null}
            {Number(loc.voorraad) > 0 && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={nulBezig === loc.sleutel}
                onClick={() => onNul(loc)}
              >
                {nulBezig === loc.sleutel ? 'Bezig…' : 'Voorraad op 0'}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

function StapKaart({ stap, invoer, scan, melding, nulBezig, onScan, onInvoer, onNul }) {
  const eenheid = stap.eenheid || 'stuks'
  const anbo = anboLocaties(stap)
  const bon = bonfixLocaties(stap)
  const anboSom = somInvoer(anbo, invoer.locaties)
  const bonSom = somInvoer(bon, invoer.locaties)
  const bonInfo = bon.length ? bonfixTePakken(stap.totaalOpen, anboSom, bon[0].stuksPerZak || 0) : null
  const anboPak = anbo[0] || {}
  const bonPak = bon[0] || {}
  const bonTekst = bonInfo
    ? verpakkingTekst(verpakkingVanAantal(bonInfo.voorgesteld, bonPak.stuksPerDoos, bonPak.stuksPerZak))
    : ''

  return (
    <div className="pick-mobiel-kaart">
      <div className="artikel-met-scan">
        <div className="pick-mobiel-artikel-blok">
          <div className="pick-mobiel-label">Artikel</div>
          <div className="pick-mobiel-artikel">{stap.artikelnummer}</div>
          {stap.artikelnaam ? <div className="pick-mobiel-naam">{stap.artikelnaam}</div> : null}
        </div>
        {onScan && (
          <button
            type="button"
            className="artikel-scan-knop"
            onClick={onScan}
            disabled={scan?.status === 'bezig'}
            aria-label="Artikel controleren met de camera"
            title="Artikel controleren met de camera"
          >
            <CameraIcoon />
          </button>
        )}
      </div>
      <ScanUitslag scan={scan} stap={stap} />

      <div>
        <div className="pick-mobiel-label">Totaal open</div>
        <div className="pick-mobiel-aantal">
          {aantal(stap.totaalOpen)}
          <span>{eenheid}</span>
        </div>
        <VerpakkingWeergave hoeveelheid={stap.totaalOpen} doos={stap.stuksPerDoos} zak={stap.stuksPerZak} />
        {stap.vraag?.length > 0 && (
          <div className="pick-mobiel-extra">
            {stap.vraag.map((v) => `${v.ordernummer || 'Order'} (${aantal(v.aantal)})`).join(' · ')}
          </div>
        )}
      </div>

      {stap.tekort > 0 && (
        <div className="banner banner-warning">
          Niet genoeg op voorraad: {aantal(stap.tekort)} {eenheid} van de {aantal(stap.totaalOpen)} die openstaan.
        </div>
      )}
      {melding && <div className="banner banner-info">{melding}</div>}

      {stap.locaties.length === 0 ? (
        <p>Dit artikel ligt nergens op voorraad. Er staan er {aantal(stap.totaalOpen)} {eenheid} open.</p>
      ) : (
        <>
          {anbo.length > 0 && (
            <div className="pick-sectie">
              <div className="pick-mobiel-label">{bon.length ? 'ANBO gepakt' : 'Picken'}</div>
              <div className="pick-sectie-aantal">
                {aantal(anboSom)} <span>{eenheid}</span>
              </div>
              <VerpakkingWeergave hoeveelheid={anboSom} doos={anboPak.stuksPerDoos} zak={anboPak.stuksPerZak} />
              <VerpakkingVelden
                doos={anboPak.stuksPerDoos}
                zak={anboPak.stuksPerZak}
                onTotaal={(waarde) => onInvoer(pasTotaalInvoer(stap, invoer, 'anbo', waarde))}
              />
              <div className="field">
                <label htmlFor="anbo-totaal">{bon.length ? 'Totaal ANBO' : 'Totaal'}</label>
                <AantalInput
                  id="anbo-totaal"
                  value={invoer.anboTotaal ?? ''}
                  onValue={(waarde) => onInvoer(pasTotaalInvoer(stap, invoer, 'anbo', waarde))}
                />
                <span className="hint">
                  Tik een locatie om het hele totaal daar te zetten. Een aantal op een andere locatie gaat van de eerste af.
                </span>
              </div>
              <LocatieTegels
                locs={anbo}
                invoer={invoer}
                onLocatie={(sleutel, waarde) => onInvoer(pasLocatieInvoer(stap, invoer, sleutel, waarde))}
                onVul={(sleutel) => onInvoer(vulLocatieInvoer(stap, invoer, sleutel))}
                onNul={onNul}
                nulBezig={nulBezig}
              />
            </div>
          )}

          {bon.length > 0 && bonInfo && (
            <div className="banner banner-info">
              Bonfix nog pakken: {aantal(bonInfo.voorgesteld)} {eenheid}
              {bonTekst ? ` (${bonTekst})` : ''}
              .
              {Math.abs(bonInfo.exact - bonInfo.voorgesteld) > 0.001
                ? ` Na ANBO blijven er ${aantal(bonInfo.exact)} open; dat is afgerond naar hele zakjes.`
                : ''}
              {Math.abs(bonSom - bonInfo.voorgesteld) > 0.001 ? ` Ingevuld: ${aantal(bonSom)}.` : ''}
            </div>
          )}

          {bon.length > 0 && (
            <div className="pick-sectie">
              <div className="pick-mobiel-label">Bonfix</div>
              <div className="pick-sectie-aantal">
                {aantal(bonSom)} <span>{eenheid}</span>
              </div>
              <VerpakkingWeergave hoeveelheid={bonSom} doos={bonPak.stuksPerDoos} zak={bonPak.stuksPerZak} />
              <p className="pick-mobiel-extra">Wordt omgeboekt naar {stap.artikelnummer}.</p>
              <VerpakkingVelden
                doos={bonPak.stuksPerDoos}
                zak={bonPak.stuksPerZak}
                onTotaal={(waarde) => onInvoer(pasTotaalInvoer(stap, invoer, 'bonfix', waarde))}
              />
              <div className="field">
                <label htmlFor="bonfix-totaal">Totaal Bonfix</label>
                <AantalInput
                  id="bonfix-totaal"
                  value={invoer.bonfixTotaal ?? ''}
                  onValue={(waarde) => onInvoer(pasTotaalInvoer(stap, invoer, 'bonfix', waarde))}
                />
                <span className="hint">
                  Dit mag afwijken van wat er op de locatie ligt, bijvoorbeeld een heel zakje. Tik een locatie om het hele totaal daar te zetten.
                </span>
              </div>
              <LocatieTegels
                locs={bon}
                invoer={invoer}
                onLocatie={(sleutel, waarde) => onInvoer(pasLocatieInvoer(stap, invoer, sleutel, waarde))}
                onVul={(sleutel) => onInvoer(vulLocatieInvoer(stap, invoer, sleutel))}
                onNul={onNul}
                nulBezig={nulBezig}
              />
            </div>
          )}
        </>
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
          {`${minder} ${minder === 1 ? 'regel is' : 'regels zijn'} met minder gepickt dan er openstaat. Alleen dat aantal kan ingepakt worden.`}
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
            open {aantal(t.nodig ?? t.tekort)} · tekort {aantal(t.tekort)} {t.eenheid}
          </span>
          {t.artikelnaam ? <span>{t.artikelnaam}</span> : null}
        </div>
      ))}
    </div>
  )
}

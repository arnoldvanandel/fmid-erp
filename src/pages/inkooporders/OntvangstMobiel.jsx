import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import LocatieKiezer from '../../components/LocatieKiezer'
import { useAuth } from '../../contexts/AuthContext'
import { useCollection } from '../../hooks/useCollection'
import { haalArtikelOpNummer, zoekArtikelen } from '../../lib/artikelZoeken'
import { formatNumber } from '../../lib/format'
import { boekOntvangst, standaardLocaties } from '../../lib/inkooporders'
import { leesOpenSessieId, sluitOntvangstsessie, voegOntvangstregelToe } from '../../lib/ontvangstrapport'
import { boekVoorraadMutatie } from '../../lib/voorraad'

function artikelLabel(artikel) {
  return artikel.artikelnaam ? `${artikel.artikelnummer} — ${artikel.artikelnaam}` : artikel.artikelnummer
}

function toon(n) {
  const x = Number(n)
  if (!Number.isFinite(x)) return '-'
  return formatNumber(x, Number.isInteger(x) ? 0 : 2)
}

function aantalTekst(n) {
  const x = Math.round(Number(n) * 1000) / 1000
  return Number.isFinite(x) ? String(x) : ''
}

function sleutelVan(artikel) {
  return artikel.artikelId || artikel.artikelnummer || artikel.sleutel
}

// Telefoon: kies een artikel, eventueel meerdere open inkooporders, zie de
// locatie en boek het aantal. Zonder open order alleen na een bevestiging.
export default function OntvangstMobiel() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { data: orders, loading: ladenOrders, error: foutOrders } = useCollection('inkooporders')
  const { data: regels, loading: ladenRegels, error: foutRegels } = useCollection('inkooporderregels')
  const [tekst, setTekst] = useState('')
  const [lijstOpen, setLijstOpen] = useState(false)
  const [gekozenArtikel, setGekozenArtikel] = useState(null)
  const [gekozenRegels, setGekozenRegels] = useState([])
  const [aantal, setAantal] = useState('')
  const [locatie, setLocatie] = useState(null)
  const [locatieCode, setLocatieCode] = useState('')
  const [ladenLocatie, setLadenLocatie] = useState(false)
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState(null)
  const [melding, setMelding] = useState(null)
  const [bevestiging, setBevestiging] = useState(null)
  const [gezocht, setGezocht] = useState([])
  const [zoeken, setZoeken] = useState(false)
  const [sessieId, setSessieId] = useState(leesOpenSessieId)
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

  const openArtikelen = useMemo(() => {
    const perArtikel = new Map()
    for (const regel of openRegels) {
      const sleutel = regel.artikelId || regel.artikelnummer
      if (!perArtikel.has(sleutel)) {
        perArtikel.set(sleutel, {
          sleutel,
          artikelId: regel.artikelId || '',
          artikelnummer: regel.artikelnummer,
          artikelnaam: regel.artikelnaam,
          eenheid: regel.eenheid,
          regels: [],
        })
      }
      perArtikel.get(sleutel).regels.push(regel)
    }
    return [...perArtikel.values()]
  }, [openRegels])

  function metOpenRegels(artikel) {
    const id = artikel.id || artikel.artikelId || ''
    const nummer = artikel.artikelnummer || ''
    const regelsVanArtikel = openRegels.filter(
      (r) => (id && r.artikelId === id) || (nummer && r.artikelnummer === nummer)
    )
    return {
      sleutel: id || nummer,
      artikelId: id || regelsVanArtikel[0]?.artikelId || '',
      artikelnummer: nummer,
      artikelnaam: artikel.naam || artikel.artikelnaam || regelsVanArtikel[0]?.artikelnaam || '',
      eenheid: artikel.eenheid || regelsVanArtikel[0]?.eenheid || '',
      regels: regelsVanArtikel,
    }
  }

  const gekozenLabel = gekozenArtikel ? artikelLabel(gekozenArtikel) : ''
  const zoekterm =
    lijstOpen && tekst.trim() && tekst.trim().toLowerCase() !== gekozenLabel.toLowerCase() ? tekst.trim() : ''

  useEffect(() => {
    if (!zoekterm) {
      setGezocht([])
      setZoeken(false)
      return undefined
    }
    let actief = true
    setZoeken(true)
    const timer = setTimeout(() => {
      zoekArtikelen(zoekterm, { max: 30 })
        .then((lijst) => {
          if (actief) setGezocht(lijst)
        })
        .catch((err) => {
          if (actief) setFout(err.message)
        })
        .finally(() => {
          if (actief) setZoeken(false)
        })
    }, 250)
    return () => {
      actief = false
      clearTimeout(timer)
    }
  }, [zoekterm])

  const gevondenArtikelen = useMemo(() => {
    const q = tekst.trim().toLowerCase()
    const label = gekozenLabel.toLowerCase()
    const openLijst =
      !q || q === label
        ? openArtikelen
        : openArtikelen.filter(
            (a) => a.artikelnummer.toLowerCase().includes(q) || a.artikelnaam.toLowerCase().includes(q)
          )
    const extra = q
      ? gezocht
          .map(metOpenRegels)
          .filter(
            (a) =>
              !openLijst.some(
                (b) => (a.artikelId && b.artikelId === a.artikelId) || b.artikelnummer === a.artikelnummer
              )
          )
      : []
    return [...openLijst, ...extra].slice(0, 40)
    // metOpenRegels hangt af van openRegels, dat al in openArtikelen zit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openArtikelen, gezocht, tekst, gekozenLabel])

  const gekozenLijst = (gekozenArtikel?.regels || []).filter((r) => gekozenRegels.includes(r.id))
  const somOpen = gekozenLijst.reduce((s, r) => s + r.open, 0)
  const eenheid = gekozenArtikel?.eenheid || gekozenLijst[0]?.eenheid || 'stuks'
  const klaarVoorAantal = Boolean(gekozenArtikel) && (gekozenArtikel.regels.length === 0 || gekozenLijst.length > 0)

  const laden = ladenOrders || ladenRegels
  const laadFout = foutOrders || foutRegels

  function wisKeuze() {
    locatieVraag.current += 1
    setGekozenArtikel(null)
    setGekozenRegels([])
    setAantal('')
    setLocatie(null)
    setLocatieCode('')
    setLadenLocatie(false)
    setBevestiging(null)
  }

  function laadLocatie(artikelId) {
    setLocatie(null)
    setLocatieCode('')
    if (!artikelId) {
      setLadenLocatie(false)
      return
    }
    setLadenLocatie(true)
    const vraag = ++locatieVraag.current
    standaardLocaties([artikelId])
      .then((voorstel) => {
        if (vraag !== locatieVraag.current) return
        const plek = voorstel[artikelId]
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

  function uniekeTreffer(waarde) {
    const q = waarde.trim().toLowerCase()
    if (!q) return null
    const bron = new Map()
    for (const artikel of [...openArtikelen, ...gezocht.map(metOpenRegels)]) {
      const sleutel = sleutelVan(artikel)
      if (!bron.has(sleutel)) bron.set(sleutel, artikel.regels ? artikel : metOpenRegels(artikel))
    }
    const lijst = [...bron.values()]
    const exact = lijst.filter((a) => a.artikelnummer.trim().toLowerCase() === q)
    if (exact.length === 1) return exact[0]
    if (exact.length > 1) return null
    const treffers = lijst.filter(
      (a) => a.artikelnummer.toLowerCase().includes(q) || a.artikelnaam.toLowerCase().includes(q)
    )
    return treffers.length === 1 ? treffers[0] : null
  }

  function kiesArtikel(artikel) {
    const keuze = artikel.regels ? artikel : metOpenRegels(artikel)
    setGekozenArtikel(keuze)
    setTekst(artikelLabel(keuze))
    setLijstOpen(false)
    setFout(null)
    setMelding(null)
    setBevestiging(null)
    laadLocatie(keuze.artikelId)
    if (keuze.regels.length === 1) {
      setGekozenRegels([keuze.regels[0].id])
      setAantal(aantalTekst(keuze.regels[0].open))
      window.setTimeout(() => document.getElementById('ontvangst-aantal')?.focus(), 0)
    } else if (keuze.regels.length === 0) {
      setGekozenRegels([])
      setAantal('')
      window.setTimeout(() => document.getElementById('ontvangst-aantal')?.focus(), 0)
    } else {
      setGekozenRegels([])
      setAantal('')
    }
  }

  function toggleRegel(id) {
    if (!gekozenArtikel) return
    const ids = gekozenRegels.includes(id) ? gekozenRegels.filter((x) => x !== id) : [...gekozenRegels, id]
    setGekozenRegels(ids)
    setBevestiging(null)
    const gekozen = gekozenArtikel.regels.filter((r) => ids.includes(r.id))
    const som = gekozen.reduce((s, r) => s + r.open, 0)
    setAantal(gekozen.length ? aantalTekst(som) : '')
  }

  function wijzigTekst(waarde) {
    setTekst(waarde)
    setLijstOpen(true)
    if (gekozenArtikel || gekozenRegels.length) wisKeuze()
  }

  async function bevestigTekst() {
    const lokaal = uniekeTreffer(tekst)
    if (lokaal) {
      kiesArtikel(lokaal)
      return true
    }
    const nr = tekst.trim()
    if (!nr) {
      setFout('Kies een artikel.')
      setLijstOpen(true)
      return false
    }
    try {
      const exact = await haalArtikelOpNummer(nr)
      if (exact) {
        kiesArtikel(metOpenRegels(exact))
        return true
      }
    } catch (err) {
      setFout(err.message)
      return false
    }
    const q = nr.toLowerCase()
    const treffers = gevondenArtikelen.filter(
      (a) => a.artikelnummer.toLowerCase().includes(q) || a.artikelnaam.toLowerCase().includes(q)
    )
    setFout(treffers.length > 1 ? 'Meerdere artikelen gevonden. Kies er een uit de lijst.' : 'Geen artikel gevonden.')
    setLijstOpen(true)
    return false
  }

  function verdeel(regels, totaal) {
    let rest = totaal
    const uit = []
    regels.forEach((r, i) => {
      const laatste = i === regels.length - 1
      const n = laatste ? rest : Math.min(Math.max(rest, 0), r.open)
      if (n > 1e-9) uit.push({ ...r, aantal: n })
      rest -= Math.max(0, n)
    })
    return uit
  }

  async function plaats(e) {
    e.preventDefault()
    setFout(null)
    setMelding(null)
    if (!gekozenArtikel) {
      await bevestigTekst()
      return
    }
    if (gekozenArtikel.regels.length > 0 && gekozenLijst.length === 0) {
      setFout('Kies één of meer inkooporders.')
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
    const zonderOrder = gekozenArtikel.regels.length === 0
    if (zonderOrder && bevestiging !== 'geen') {
      setBevestiging('geen')
      return
    }
    if (!zonderOrder && n > somOpen + 1e-9 && bevestiging !== 'meer') {
      setBevestiging('meer')
      return
    }
    setBevestiging(null)
    setBezig(true)
    const gebruiker = profile?.naam || profile?.email || ''
    const geboekteIds = []
    try {
      const delen = zonderOrder ? [] : verdeel(gekozenLijst, n)
      if (zonderOrder) {
        if (!gekozenArtikel.artikelId) throw new Error('Dit artikel ontbreekt in het artikelbestand.')
        await boekVoorraadMutatie({
          artikelId: gekozenArtikel.artikelId,
          locatieId: locatie.id,
          type: 'in',
          aantal: n,
          reden: 'Op voorraad gezet',
          gebruiker,
          bron: 'opvoorraad',
        })
      } else {
        const perOrder = new Map()
        for (const deel of delen) {
          if (!perOrder.has(deel.inkooporderId)) perOrder.set(deel.inkooporderId, {})
          perOrder.get(deel.inkooporderId)[deel.id] = { aantal: deel.aantal, locatieId: locatie.id }
        }
        for (const [inkooporderId, ontvangst] of perOrder) {
          await boekOntvangst({ inkooporderId, ontvangst, gebruiker })
          geboekteIds.push(...Object.keys(ontvangst))
        }
      }

      const rapportRegels = zonderOrder
        ? [
            {
              artikelnummer: gekozenArtikel.artikelnummer,
              artikelnaam: gekozenArtikel.artikelnaam,
              aantal: n,
              eenheid,
              locatieCode: locatie.code,
              ordernummer: '',
              leverancier: '',
            },
          ]
        : delen.map((deel) => ({
            artikelnummer: deel.artikelnummer,
            artikelnaam: deel.artikelnaam,
            aantal: deel.aantal,
            eenheid: deel.eenheid || eenheid,
            locatieCode: locatie.code,
            ordernummer: deel.ordernummer,
            leverancier: deel.leverancier,
          }))
      let rapportMelding = ''
      try {
        let rapport
        for (const regel of rapportRegels) {
          rapport = await voegOntvangstregelToe(regel, gebruiker)
        }
        if (rapport) setSessieId(rapport.id)
      } catch (err) {
        const id = leesOpenSessieId()
        if (id) setSessieId(id)
        rapportMelding = ` Het rapport staat op dit apparaat, maar kon niet worden opgeslagen voor de pc: ${err.message}`
      }
      const ordersTekst = zonderOrder
        ? ' Zonder open inkooporder.'
        : ` Orders: ${[...new Set(delen.map((d) => d.ordernummer))].join(', ')}.`
      setMelding(`${toon(n)} ${eenheid} ${gekozenArtikel.artikelnummer} op ${locatie.code} gezet.${ordersTekst}${rapportMelding}`)
      setTekst('')
      wisKeuze()
    } catch (err) {
      if (geboekteIds.length) {
        const over = gekozenLijst.filter((r) => !geboekteIds.includes(r.id))
        setGekozenRegels(over.map((r) => r.id))
        setAantal(over.length ? aantalTekst(over.reduce((s, r) => s + r.open, 0)) : '')
        setFout(`${err.message} Wat al geboekt is, is uit de selectie gehaald.`)
      } else {
        setFout(err.message)
      }
    } finally {
      setBezig(false)
    }
  }

  async function stoppen() {
    setFout(null)
    setBezig(true)
    try {
      await sluitOntvangstsessie()
      setSessieId('')
      navigate('/inkooporders')
    } catch (err) {
      setFout(err.message)
      setBezig(false)
    }
  }

  return (
    <div className="pick-mobiel opv">
      <header className="pick-mobiel-kop">
        <button type="button" onClick={stoppen} disabled={bezig}>
          Stoppen
        </button>
        <div className="pick-mobiel-kop-midden">
          <strong>Ontvangen</strong>
          <span>{gekozenArtikel ? gekozenArtikel.artikelnummer : 'Kies een artikel'}</span>
        </div>
        <Link to={sessieId ? `/inkooporders/ontvangst/rapport/${sessieId}` : '/inkooporders/ontvangst/rapporten'}>
          Rapport
        </Link>
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
            {sessieId && (
              <p className="hint">
                Deze regels staan op één rapport. Na Stoppen of na het rapport openen begint de volgende keer een nieuw
                rapport.
              </p>
            )}

            <div className="field">
              <label htmlFor="ontvangst-artikel">Artikel</label>
              <input
                id="ontvangst-artikel"
                type="text"
                value={tekst}
                onChange={(e) => wijzigTekst(e.target.value)}
                onFocus={() => setLijstOpen(true)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return
                  e.preventDefault()
                  if (gekozenArtikel && tekst.trim().toLowerCase() === gekozenLabel.toLowerCase()) {
                    document.getElementById('ontvangst-aantal')?.focus()
                    return
                  }
                  bevestigTekst()
                }}
                placeholder="Typ artikelnummer of naam"
                autoComplete="off"
              />
              <span className="hint">Ook een artikel zonder open inkooporder kan gekozen worden.</span>
              {lijstOpen && (
                <div className="opv-locaties ontvangst-artikelen">
                  {zoeken && gevondenArtikelen.length === 0 ? (
                    <span className="hint">Zoeken…</span>
                  ) : gevondenArtikelen.length === 0 ? (
                    <span className="hint">{tekst.trim() ? 'Geen artikel gevonden.' : 'Typ een artikelnummer of naam.'}</span>
                  ) : (
                    gevondenArtikelen.map((a) => (
                      <button key={a.sleutel} type="button" className="opv-locatie kolom" onClick={() => kiesArtikel(a)}>
                        <strong>{a.artikelnummer}</strong>
                        {a.artikelnaam ? <span>{a.artikelnaam}</span> : null}
                        <span>
                          {a.regels.length === 0
                            ? 'geen open inkooporder'
                            : a.regels.length === 1
                              ? '1 open order'
                              : `${a.regels.length} open orders`}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {gekozenArtikel && gekozenArtikel.regels.length > 0 && (
              <div>
                <div className="pick-mobiel-label">
                  {gekozenArtikel.regels.length > 1 ? 'Kies één of meer inkooporders' : 'Inkooporder'}
                </div>
                <div className="opv-locaties">
                  {gekozenArtikel.regels.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      aria-pressed={gekozenRegels.includes(r.id)}
                      className={'opv-locatie kolom' + (gekozenRegels.includes(r.id) ? ' actief' : '')}
                      onClick={() => toggleRegel(r.id)}
                    >
                      <strong>
                        {toon(r.open)} {r.eenheid} open
                      </strong>
                      <span>
                        {r.ordernummer}
                        {r.leverancier ? ` · ${r.leverancier}` : ''}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {klaarVoorAantal && (
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
                {gekozenLijst.length > 0 && (
                  <div className="pick-mobiel-extra">
                    {gekozenLijst.map((r) => r.ordernummer).join(', ')}
                  </div>
                )}
                <div className="field">
                  <label htmlFor="ontvangst-aantal">Aantal op voorraad gezet</label>
                  <input
                    id="ontvangst-aantal"
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    value={aantal}
                    onChange={(e) => {
                      setAantal(e.target.value)
                      setBevestiging(null)
                    }}
                  />
                  <span className="hint">
                    {gekozenArtikel.regels.length === 0
                      ? 'Voor dit artikel staat geen inkooporder open.'
                      : `Op de gekozen orders staat samen ${toon(somOpen)} ${eenheid} open. Het aantal wordt vanaf de bovenste order verdeeld.`}
                  </span>
                </div>
              </>
            )}
          </div>
        )}
      </form>
      {klaarVoorAantal && (
        <footer className="pick-mobiel-voet">
          {bevestiging === 'meer' && (
            <div className="banner banner-warning">
              {gekozenLijst.length === 1
                ? `Let op, er staan er nog ${toon(somOpen)} ${eenheid} open op inkooporder ${gekozenLijst[0].ordernummer}. Weet u zeker dat u dit aantal wil inboeken?`
                : `Let op, op de gekozen inkooporders staan er nog ${toon(somOpen)} ${eenheid} open. Weet u zeker dat u dit aantal wil inboeken?`}
            </div>
          )}
          {bevestiging === 'geen' && (
            <div className="banner banner-warning">
              Let op, voor dit artikel staat geen inkooporder open. Weet u zeker dat u het toch op voorraad wil zetten?
            </div>
          )}
          <button type="submit" form="ontvangst-boek" className="btn btn-primary pick-mobiel-gepikt" disabled={bezig || ladenLocatie}>
            {bezig ? 'Boeken…' : bevestiging === 'geen' ? 'Ja, op voorraad zetten' : bevestiging === 'meer' ? 'Ja, inboeken' : 'Ontvangst boeken'}
          </button>
        </footer>
      )}
    </div>
  )
}

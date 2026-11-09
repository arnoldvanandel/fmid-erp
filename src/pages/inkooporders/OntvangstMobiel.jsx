import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AantalInput from '../../components/AantalInput'
import LocatieKiezer from '../../components/LocatieKiezer'
import { useAuth } from '../../contexts/AuthContext'
import { useCollection } from '../../hooks/useCollection'
import { haalArtikelOpNummer, haalArtikelenOp, zoekArtikelen } from '../../lib/artikelZoeken'
import { formatNumber } from '../../lib/format'
import { boekOntvangst } from '../../lib/inkooporders'
import { evalueerAantal, isVerzamellocatie, leesRecenteArtikelen, onthoudArtikel } from '../../lib/magazijnInvoer'
import { leesOpenSessieId, sluitOntvangstsessie, voegOntvangstregelToe } from '../../lib/ontvangstrapport'
import { boekVoorraadMutatie, haalStandenVanArtikel } from '../../lib/voorraad'

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
  const [dozen, setDozen] = useState('')
  const [restDoos, setRestDoos] = useState('')
  const [stuksPerDoos, setStuksPerDoos] = useState(0)
  const [standen, setStanden] = useState([])
  const [extraLocaties, setExtraLocaties] = useState([])
  const [perLocatie, setPerLocatie] = useState({})
  const [andereOpen, setAndereOpen] = useState(false)
  const [andereCode, setAndereCode] = useState('')
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
    const recente = leesRecenteArtikelen()
    const rang = (a) => {
      const idx = recente.findIndex((r) => r.artikelnummer === a.artikelnummer)
      if (idx !== -1) return idx
      if (a.regels?.length) return 20
      return 60
    }
    const basis =
      !q || q === label
        ? [
            ...recente.map((r) => metOpenRegels(r)),
            ...openLijst.filter((a) => !recente.some((r) => r.artikelnummer === a.artikelnummer)),
          ]
        : [...openLijst, ...extra]
    return basis
      .filter((a, i, lijst) => lijst.findIndex((b) => b.artikelnummer === a.artikelnummer) === i)
      .sort(
        (a, b) =>
          rang(a) - rang(b) ||
          String(a.artikelnummer).localeCompare(String(b.artikelnummer), 'nl', { numeric: true })
      )
      .slice(0, 40)
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
    setDozen('')
    setRestDoos('')
    setStuksPerDoos(0)
    setStanden([])
    setExtraLocaties([])
    setPerLocatie({})
    setAndereOpen(false)
    setAndereCode('')
    setLadenLocatie(false)
    setBevestiging(null)
  }

  function laadPlekken(artikelId, bekendPerDoos) {
    setStanden([])
    setExtraLocaties([])
    setPerLocatie({})
    setAndereOpen(false)
    setStuksPerDoos(Number(bekendPerDoos) > 0 ? Number(bekendPerDoos) : 0)
    if (!artikelId) {
      setLadenLocatie(false)
      return
    }
    setLadenLocatie(true)
    const vraag = ++locatieVraag.current
    Promise.all([haalStandenVanArtikel(artikelId), haalArtikelenOp([artikelId])])
      .then(([lijst, artikelen]) => {
        if (vraag !== locatieVraag.current) return
        setStanden(lijst.filter((s) => !isVerzamellocatie(s.locatieCode)))
        const perDoos = Number(artikelen[artikelId]?.stuksPerDoos)
        if (perDoos > 0) setStuksPerDoos(perDoos)
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
    setDozen('')
    setRestDoos('')
    onthoudArtikel(keuze)
    laadPlekken(keuze.artikelId, keuze.stuksPerDoos)
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

  function zetLocatieAantal(id, waarde) {
    setPerLocatie((huidig) => ({ ...huidig, [id]: waarde }))
    setBevestiging(null)
  }

  function neemTotaalOver(id) {
    const n = evalueerAantal(aantal)
    if (!Number.isFinite(n) || n <= 0) {
      setFout('Vul eerst het totaal aantal in.')
      return
    }
    setPerLocatie((huidig) => ({ ...huidig, [id]: aantalTekst(n) }))
    setBevestiging(null)
    setFout(null)
  }

  function klikLocatie(e, id) {
    if (e.target.closest('input')?.value.trim()) return
    neemTotaalOver(id)
  }

  function zetDozen(waarde) {
    setDozen(waarde)
    setBevestiging(null)
    const d = evalueerAantal(waarde)
    const r = evalueerAantal(restDoos)
    const totaal = (Number.isFinite(d) ? d : 0) * stuksPerDoos + (Number.isFinite(r) ? r : 0)
    setAantal(String(waarde).trim() || restDoos.trim() ? aantalTekst(totaal) : '')
  }

  function zetRest(waarde) {
    setRestDoos(waarde)
    setBevestiging(null)
    const d = evalueerAantal(dozen)
    const r = evalueerAantal(waarde)
    const totaal = (Number.isFinite(d) ? d : 0) * stuksPerDoos + (Number.isFinite(r) ? r : 0)
    setAantal(dozen.trim() || String(waarde).trim() ? aantalTekst(totaal) : '')
  }

  function kiesAndereLocatie(l) {
    if (!l) return
    if (isVerzamellocatie(l.code)) {
      setFout('Locatie 1111-1 is de verzamellocatie en kan hier niet gekozen worden.')
      return
    }
    setExtraLocaties((huidig) => (huidig.some((e) => e.id === l.id) ? huidig : [...huidig, { id: l.id, code: l.code }]))
    setAndereCode('')
    setAndereOpen(false)
    neemTotaalOver(l.id)
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
    const ingetypt = evalueerAantal(aantal)
    const tegels = [
      ...standen.map((s) => ({ id: s.locatieId, code: s.locatieCode })),
      ...extraLocaties
        .filter((e) => !standen.some((s) => s.locatieId === e.id) && !isVerzamellocatie(e.code))
        .map((e) => ({ id: e.id, code: e.code })),
    ]
    const ingevuld = tegels
      .map((t) => ({ ...t, aantal: evalueerAantal(perLocatie[t.id] || '') }))
      .filter((t) => Number.isFinite(t.aantal) && t.aantal > 0)
    const somLocatiesVooraf = ingevuld.reduce((s, p) => s + p.aantal, 0)
    const n = Number.isFinite(ingetypt) && ingetypt > 0 ? ingetypt : somLocatiesVooraf
    const plaatsingen =
      ingevuld.length > 0
        ? ingevuld
        : Number.isFinite(n) && n > 0 && tegels.length === 1
          ? [{ ...tegels[0], aantal: n }]
          : []
    if (!Number.isFinite(n) || n <= 0) {
      setFout('Vul een totaal aantal in. Een berekening zoals 80*2+20 mag ook.')
      return
    }
    if (plaatsingen.length === 0) {
      setFout('Kies per locatie hoeveel stuks daar zijn geplaatst. Een volle locatie vult u niet verder; de rest komt op een andere locatie.')
      return
    }
    const somLocaties = plaatsingen.reduce((s, p) => s + p.aantal, 0)
    if (Math.abs(somLocaties - n) > 0.001) {
      setFout(`Per locatie staat ${toon(somLocaties)} ${eenheid}, het totaal is ${toon(n)}. Maak die gelijk voor u boekt.`)
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
      const gekoppeld = []
      if (zonderOrder) {
        if (!gekozenArtikel.artikelId) throw new Error('Dit artikel ontbreekt in het artikelbestand.')
        for (const plek of plaatsingen) {
          await boekVoorraadMutatie({
            artikelId: gekozenArtikel.artikelId,
            locatieId: plek.id,
            type: 'in',
            aantal: plek.aantal,
            reden: 'Op voorraad gezet',
            gebruiker,
            bron: 'opvoorraad',
          })
          gekoppeld.push({ aantal: plek.aantal, locatieCode: plek.code, ordernummer: '', leverancier: '', eenheid })
        }
      } else {
        const locRest = plaatsingen.map((p) => ({ ...p, rest: p.aantal }))
        let li = 0
        for (const deel of delen) {
          let nog = deel.aantal
          while (nog > 1e-9 && li < locRest.length) {
            const nemen = Math.min(nog, locRest[li].rest)
            if (nemen > 1e-9) {
              gekoppeld.push({ ...deel, aantal: nemen, locatieId: locRest[li].id, locatieCode: locRest[li].code })
            }
            locRest[li].rest -= nemen
            nog -= nemen
            if (locRest[li].rest <= 1e-9) li += 1
          }
        }
        const groepen = new Map()
        for (const deel of gekoppeld) {
          const key = `${deel.inkooporderId}|${deel.locatieId}`
          if (!groepen.has(key)) groepen.set(key, { inkooporderId: deel.inkooporderId, ontvangst: {} })
          groepen.get(key).ontvangst[deel.id] = { aantal: deel.aantal, locatieId: deel.locatieId }
        }
        for (const groep of groepen.values()) {
          await boekOntvangst({ inkooporderId: groep.inkooporderId, ontvangst: groep.ontvangst, gebruiker })
          geboekteIds.push(...Object.keys(groep.ontvangst))
        }
      }

      const rapportRegels = gekoppeld.map((deel) => ({
        artikelnummer: deel.artikelnummer || gekozenArtikel.artikelnummer,
        artikelnaam: deel.artikelnaam || gekozenArtikel.artikelnaam,
        aantal: deel.aantal,
        eenheid: deel.eenheid || eenheid,
        locatieCode: deel.locatieCode,
        ordernummer: deel.ordernummer || '',
        leverancier: deel.leverancier || '',
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
      const locatieTekst = [...new Set(plaatsingen.map((p) => p.code))].join(', ')
      const ordersTekst = zonderOrder ? ' Zonder open inkooporder.' : ` Orders: ${[...new Set(delen.map((d) => d.ordernummer))].join(', ')}.`
      setMelding(`${toon(n)} ${eenheid} ${gekozenArtikel.artikelnummer} op ${locatieTekst} gezet.${ordersTekst}${rapportMelding}`)
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

      <form id="ontvangst-boek" className="pick-mobiel-inhoud" onSubmit={(e) => e.preventDefault()}>
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
                {stuksPerDoos > 0 && (
                  <div className="aantal-rij">
                    <div className="field">
                      <label htmlFor="ontvangst-dozen">Volle dozen</label>
                      <AantalInput id="ontvangst-dozen" value={dozen} onValue={zetDozen} placeholder="bijv. 4 of 2x2" />
                      <span className="hint">1 doos = {toon(stuksPerDoos)} {eenheid}</span>
                    </div>
                    <div className="field">
                      <label htmlFor="ontvangst-rest">Rest in doos</label>
                      <AantalInput id="ontvangst-rest" value={restDoos} onValue={zetRest} placeholder="bijv. 12" />
                    </div>
                  </div>
                )}
                <div className="field">
                  <label htmlFor="ontvangst-aantal">Totaal aantal</label>
                  <AantalInput
                    id="ontvangst-aantal"
                    value={aantal}
                    onValue={(waarde) => {
                      setAantal(waarde)
                      setDozen('')
                      setRestDoos('')
                      setBevestiging(null)
                    }}
                    placeholder="bijv. 80x2 of 80*2+20"
                  />
                  <span className="hint">
                    {gekozenArtikel.regels.length === 0
                      ? 'Voor dit artikel staat geen inkooporder open. Klik daarna een locatie: het totaal komt in die tegel.'
                      : `Op de gekozen orders staat samen ${toon(somOpen)} ${eenheid} open. Klik een locatie om het totaal daar te plaatsen.`}
                  </span>
                </div>
                <div>
                  <div className="pick-mobiel-label">Locaties</div>
                  {ladenLocatie ? (
                    <div className="spinner" />
                  ) : (
                    <>
                      {standen.length === 0 && extraLocaties.length === 0 && (
                        <p className="hint">Dit artikel ligt nog nergens, of alleen op de verzamellocatie. Kies een andere locatie.</p>
                      )}
                      <div className="locatie-tegels">
                        {standen.map((s) => (
                          <div
                            key={s.locatieId}
                            className={'locatie-tegel' + (perLocatie[s.locatieId] ? ' actief' : '')}
                            onClick={(e) => klikLocatie(e, s.locatieId)}
                          >
                            <strong>{s.locatieCode}</strong>
                            <span>ligt er {toon(s.aantal)}</span>
                            <AantalInput
                              value={perLocatie[s.locatieId] || ''}
                              onValue={(waarde) => zetLocatieAantal(s.locatieId, waarde)}
                              placeholder="Aantal"
                              aria-label={`Aantal op ${s.locatieCode}`}
                            />
                          </div>
                        ))}
                        {extraLocaties
                          .filter((e) => !standen.some((s) => s.locatieId === e.id))
                          .map((e) => (
                            <div
                              key={e.id}
                              className={'locatie-tegel' + (perLocatie[e.id] ? ' actief' : '')}
                              onClick={(ev) => klikLocatie(ev, e.id)}
                            >
                              <strong>{e.code}</strong>
                              <span>nieuwe locatie</span>
                              <AantalInput
                                value={perLocatie[e.id] || ''}
                                onValue={(waarde) => zetLocatieAantal(e.id, waarde)}
                                placeholder="Aantal"
                                aria-label={`Aantal op ${e.code}`}
                              />
                            </div>
                          ))}
                        {andereOpen ? (
                          <div className="locatie-tegel actief">
                            <strong>Locatie</strong>
                            <LocatieKiezer
                              className="locatie-code"
                              value={andereCode}
                              onChange={setAndereCode}
                              onKies={kiesAndereLocatie}
                              placeholder="Locatiecode"
                              autoFocus
                              aria-label="Andere locatie"
                            />
                          </div>
                        ) : (
                          <button type="button" className="locatie-tegel" onClick={() => setAndereOpen(true)}>
                            <strong>Andere locatie</strong>
                            <span>typ de code</span>
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
                {gekozenLijst.length > 0 && (
                  <div className="pick-mobiel-extra">{gekozenLijst.map((r) => r.ordernummer).join(', ')}</div>
                )}
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
          <button type="button" className="btn btn-primary pick-mobiel-gepikt" onClick={plaats} disabled={bezig || ladenLocatie}>
            {bezig ? 'Boeken…' : bevestiging === 'geen' ? 'Ja, op voorraad zetten' : bevestiging === 'meer' ? 'Ja, inboeken' : 'Ontvangst boeken'}
          </button>
        </footer>
      )}
    </div>
  )
}

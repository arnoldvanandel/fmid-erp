import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import { haalArtikelOpNummer } from '../../lib/artikelZoeken'
import Modal from '../../components/Modal'
import { drukElementAf, haalPrintersOp, printerNaam } from '../../lib/labels'
import { useWeegschaal, weegschaalOndersteund } from '../../lib/weegschaal'
import {
  aantalInDoos,
  fotoSleutel,
  gewichtKlopt,
  leesKilo,
  registreerDoos,
  totaalGewicht,
  uploadVerpakkingFoto,
  zoekVerpakkingen,
} from '../../lib/verpakken'
import { DoosEtiket } from './DoosEtiket'
import VoorschriftForm from './VoorschriftForm'
import './verpakken.css'

const JA_NEE = [
  ['storten', 'Storten?'],
  ['karton', 'Karton?'],
  ['kartonPerLaag', 'Karton per laag?'],
  ['etiketOpZak', 'Etiket op zak?'],
  ['etiketOpDoos', 'Etiket op doos?'],
  ['noppenfolie', 'Noppenfolie?'],
]

function getal(waarde) {
  if (waarde === null || waarde === undefined || waarde === '') return ''
  return Number(waarde).toLocaleString('nl-NL', { maximumFractionDigits: 6, useGrouping: false })
}

function Veld({ label, waarde, eenheid }) {
  return (
    <div className="field">
      <label>{label}</label>
      <div className="verpak-waarde">
        {waarde === '' || waarde === null || waarde === undefined ? '—' : waarde}
        {eenheid && <span className="hint"> {eenheid}</span>}
      </div>
    </div>
  )
}

export default function VerpakkenDoos() {
  const { profile } = useAuth()
  const gebruiker = profile?.naam || profile?.email || ''
  const weegschaal = useWeegschaal()

  const [term, setTerm] = useState('')
  const [lijst, setLijst] = useState([])
  const [gezocht, setGezocht] = useState('')
  const [verpakking, setVerpakking] = useState(null)
  const [artikelnaam, setArtikelnaam] = useState('')
  const [handGewicht, setHandGewicht] = useState('')
  const [fotoDoc, setFotoDoc] = useState(null)
  const [tarraVraag, setTarraVraag] = useState(null)
  const [laatste, setLaatste] = useState(null)
  const [bewerken, setBewerken] = useState(null)
  const [ververs, setVervers] = useState(0)
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState(null)
  const [melding, setMelding] = useState(null)
  const etiket = useRef(null)
  const teDrukken = useRef(null)

  const artikelnummer = verpakking?.artikelnummer || ''
  const perStuk = Number(verpakking?.gewichtPerProduct) || 0
  const volledig = Boolean(
    verpakking && perStuk > 0 && verpakking.aantalPerDoos != null && verpakking.tarraDoos != null
  )

  const gewicht = weegschaal.verbonden ? weegschaal.gewicht : leesKilo(handGewicht)
  const klopt = volledig && gewichtKlopt(gewicht, verpakking)

  useEffect(() => {
    let weg = false
    const t = setTimeout(async () => {
      try {
        const gevonden = await zoekVerpakkingen(term)
        if (weg) return
        const nummer = term.trim().toLowerCase()
        const exact = (nummer && gevonden.find((v) => v.artikelnummer.toLowerCase() === nummer)) || null
        setLijst(gevonden)
        setGezocht(term)
        setVerpakking(exact)
        // Naam uit de artikelen (Axapta); aan te passen voor het etiket.
        const artikel = exact ? await haalArtikelOpNummer(exact.artikelnummer).catch(() => null) : null
        if (!weg) setArtikelnaam(artikel?.naam || '')
      } catch (e) {
        if (!weg) setFout(e.message)
      }
    }, 250)
    return () => {
      weg = true
      clearTimeout(t)
    }
  }, [term, ververs])

  useEffect(() => {
    setFotoDoc(null)
    if (!artikelnummer) return undefined
    return onSnapshot(
      doc(db, 'verpakkingFotos', fotoSleutel(artikelnummer)),
      (snap) => setFotoDoc(snap.exists() ? snap.data() : null),
      () => setFotoDoc(null)
    )
  }, [artikelnummer])

  function wijzigArtikel(waarde) {
    setTerm(waarde)
    // Direct leeg, zodat er nooit een etiket van het vorige artikel uitkomt.
    setVerpakking(null)
    setArtikelnaam('')
    setHandGewicht('')
    setFout(null)
    setMelding(null)
  }

  // Eerst kijken of de printer er is: anders staat er wel een doos in de
  // administratie maar zit er geen etiket op.
  async function zoekPrinter() {
    const { printer } = await haalPrintersOp()
    const doel = printer || printerNaam()
    if (!doel) throw new Error('Zet eerst de labelprinter vast op deze pc (menu Labels).')
    return doel
  }

  // Drukt af zodra het etiket van deze doos in de pagina staat.
  useEffect(() => {
    const printer = teDrukken.current
    if (!laatste || !printer) return
    teDrukken.current = null
    druk(printer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [laatste])

  async function druk(printer) {
    try {
      await drukElementAf(etiket.current, { printer, copies: 1 })
      setMelding(`Etiket ${laatste.doosnummer} (${laatste.aantal} stuks) naar ${printer} gestuurd.`)
    } catch (e) {
      setFout(
        `Doos ${laatste.doosnummer} is vastgelegd, maar het etiket is niet afgedrukt: ${e.message}. Gebruik Nogmaals printen.`
      )
    } finally {
      setBezig(false)
    }
  }

  function etiketPrinten() {
    setFout(null)
    setMelding(null)
    if (!verpakking || !volledig) {
      setFout(verpakking ? 'De verpakkingsgegevens van dit artikel zijn niet compleet.' : 'Kies eerst een artikel.')
      return
    }
    if (gewicht === null) {
      setFout(weegschaal.verbonden ? 'Nog geen gewicht van de weegschaal ontvangen.' : 'Vul het gewicht van de doos in.')
      return
    }
    // Gewicht vastzetten: de weegschaal loopt door terwijl het venster openstaat.
    if (klopt) maakDoos(gewicht, Number(verpakking.tarraDoos))
    else setTarraVraag({ gewicht, tarra: getal(verpakking.tarraDoos) })
  }

  async function maakDoos(kg, tarra) {
    setTarraVraag(null)
    setBezig(true)
    try {
      const printer = await zoekPrinter()
      const doos = await registreerDoos({ verpakking, artikelnaam, gewicht: kg, tarra, gebruiker })
      teDrukken.current = printer
      setLaatste(doos)
      setHandGewicht('')
    } catch (e) {
      setFout(e.message)
      setBezig(false)
    }
  }

  async function nogmaals() {
    setFout(null)
    setMelding(null)
    setBezig(true)
    try {
      await druk(await zoekPrinter())
    } catch (e) {
      setFout(e.message)
      setBezig(false)
    }
  }

  async function kiesFoto(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setFout(null)
    try {
      await uploadVerpakkingFoto({ artikelnummer, file, gebruiker })
    } catch (err) {
      setFout(err.message)
    }
  }

  const vraagTarra = tarraVraag ? leesKilo(tarraVraag.tarra) : null
  const vraagAantal =
    vraagTarra === null || !perStuk
      ? null
      : aantalInDoos({ gewicht: tarraVraag.gewicht, tarra: vraagTarra, gewichtPerProduct: perStuk })

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1>Verpakken doos</h1>
          <div className="page-header-sub">Doos wegen, vastleggen en etiket printen</div>
        </div>
      </div>

      {fout && <div className="banner banner-danger">{fout}</div>}
      {melding && <div className="banner banner-info">{melding}</div>}

      <div className="card card-pad verpak-blok">
        <h3>Selecteren</h3>
        <div className="field-row">
          <div className="field">
            <label htmlFor="vp-artikel">Artikelnummer</label>
            <input
              id="vp-artikel"
              type="text"
              list="vp-artikelen"
              autoComplete="off"
              autoFocus
              value={term}
              disabled={bezig}
              onChange={(e) => wijzigArtikel(e.target.value)}
              placeholder="Typ of scan het artikelnummer"
            />
            <datalist id="vp-artikelen">
              {lijst.map((v) => (
                <option key={v.id} value={v.artikelnummer}>
                  {v.artikelnummerKlant}
                </option>
              ))}
            </datalist>
          </div>
          <Veld label="Artikelnr. klant" waarde={verpakking?.artikelnummerKlant} />
          <div className="field">
            <label htmlFor="vp-naam">Artikelnaam</label>
            <input
              id="vp-naam"
              type="text"
              value={artikelnaam}
              disabled={!verpakking || bezig}
              onChange={(e) => setArtikelnaam(e.target.value)}
            />
          </div>
        </div>
        {term.trim() && gezocht === term && lijst.length === 0 && (
          <div className="banner banner-warning">
            Geen verpakkingsvoorschrift voor een artikel dat met {term.trim()} begint.{' '}
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setBewerken({ artikelnummer: term.trim().toUpperCase() })}
            >
              Voorschrift toevoegen
            </button>
          </div>
        )}
        {verpakking && !volledig && (
          <div className="banner banner-warning">
            Gewicht per product, aantal per doos of tarragewicht ontbreekt. Vul dat aan in het voorschrift.
          </div>
        )}
      </div>

      <div className="verpak-kolommen">
        <div className="card card-pad">
          <h3>Verpakking</h3>
          <div className="verpak-instructie">
            <div>
              <Veld label="Soort doos" waarde={verpakking?.soortDoos} />
              <Veld label="Soort zak" waarde={verpakking?.soortZak} />
              <div className="field-row verpak-twee">
                <Veld label="Aantal per zak" waarde={getal(verpakking?.aantalPerZak)} />
                <Veld label="Zakken per doos" waarde={getal(verpakking?.zakkenPerDoos)} />
              </div>
              <Veld label="Soort tape" waarde={verpakking?.soortTape} />
            </div>
            <div className="verpak-foto">
              {fotoDoc ? (
                <a href={fotoDoc.url} target="_blank" rel="noreferrer">
                  <img src={fotoDoc.url} alt={`Verpakking van ${artikelnummer}`} />
                </a>
              ) : (
                <div className="empty-state">Geen foto</div>
              )}
              {verpakking && (
                <label className="btn btn-secondary btn-sm">
                  {fotoDoc ? 'Foto vervangen' : 'Foto toevoegen'}
                  <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={kiesFoto} />
                </label>
              )}
            </div>
          </div>
          <div className="verpak-janee">
            {JA_NEE.map(([veld, label]) => (
              <div key={veld}>
                <span>{label}</span>
                {verpakking ? (
                  <span className={'badge ' + (verpakking[veld] ? 'badge-success' : 'badge-neutral')}>
                    {verpakking[veld] ? 'Ja' : 'Nee'}
                  </span>
                ) : (
                  <span>—</span>
                )}
              </div>
            ))}
          </div>
          <Veld label="Opmerkingen" waarde={verpakking?.opmerkingen} />
          {verpakking && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setBewerken(verpakking)}>
              Voorschrift bewerken
            </button>
          )}
        </div>

        <div className="card card-pad verpak-weeg">
          <h3>Weegschaal</h3>
          <div className="verpak-gewicht">
            <span className="hint">Huidig gewicht doos</span>
            {weegschaal.verbonden ? (
              <strong>{weegschaal.gewicht === null ? '—' : getal(weegschaal.gewicht)}</strong>
            ) : (
              <input
                type="text"
                inputMode="decimal"
                aria-label="Gewicht van de doos in kg"
                value={handGewicht}
                disabled={bezig}
                onChange={(e) => setHandGewicht(e.target.value)}
                placeholder="0,000"
              />
            )}
            <span>Kg</span>
          </div>
          <div className={'verpak-licht' + (volledig ? (klopt ? ' goed' : ' fout') : '')} role="status">
            {!volledig ? 'Kies een artikel' : klopt ? 'Gewicht klopt' : 'Gewicht klopt niet'}
          </div>
          {weegschaal.fout && <div className="banner banner-warning">{weegschaal.fout}</div>}
          {!weegschaalOndersteund ? (
            <p className="hint">Deze browser kan geen weegschaal lezen. Gebruik Chrome of Edge, of typ het gewicht.</p>
          ) : weegschaal.verbonden ? (
            <div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={weegschaal.verbreek}>
                Weegschaal loskoppelen
              </button>
            </div>
          ) : (
            <div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={weegschaal.verbind}>
                Weegschaal verbinden
              </button>{' '}
              <span className="hint">Of typ het gewicht.</span>
            </div>
          )}
        </div>

        <div className="card card-pad verpak-uit">
          <h3>Etiket zak</h3>
          <div className="field-row">
            <Veld label="Aantal per zak" waarde={getal(verpakking?.aantalPerZak)} eenheid="stuks" />
            <Veld label="Gewicht per product" waarde={getal(verpakking?.gewichtPerProduct)} eenheid="kg" />
            <Veld label="Tarragewicht" waarde="" eenheid="kg" />
            <Veld label="Totaal gewicht zak" waarde="" eenheid="kg" />
          </div>
          <button type="button" className="btn btn-secondary" disabled>
            Etiket zak printen
          </button>
        </div>

        <div className="card card-pad">
          <h3>Etiket doos</h3>
          <div className="field-row">
            <Veld label="Aantal per doos" waarde={getal(verpakking?.aantalPerDoos)} eenheid="stuks" />
            <Veld label="Gewicht per product" waarde={getal(verpakking?.gewichtPerProduct)} eenheid="kg" />
            <Veld label="Tarragewicht" waarde={getal(verpakking?.tarraDoos)} eenheid="kg" />
            <Veld label="Totaal gewicht doos" waarde={volledig ? getal(totaalGewicht(verpakking)) : ''} eenheid="kg" />
          </div>
          <div className="verpak-knoppen">
            <button type="button" className="btn btn-primary" onClick={etiketPrinten} disabled={bezig}>
              {bezig ? 'Bezig…' : 'Etiket doos printen'}
            </button>
            {laatste && (
              <button type="button" className="btn btn-secondary" onClick={nogmaals} disabled={bezig}>
                Nogmaals printen ({laatste.doosnummer})
              </button>
            )}
            <Link to="/labels" className="btn btn-ghost btn-sm">
              Labelprinter instellen
            </Link>
          </div>
        </div>
      </div>

      {laatste && (
        <div className="verpak-laatste">
          <div className="hint">Laatste etiket</div>
          <DoosEtiket doos={laatste} ref={etiket} />
        </div>
      )}

      {bewerken && (
        <Modal
          title={bewerken.id ? `Voorschrift ${bewerken.artikelnummer}` : 'Nieuw verpakkingsvoorschrift'}
          onClose={() => setBewerken(null)}
          width={720}
        >
          <VoorschriftForm
            voorschrift={bewerken}
            onDone={() => {
              setBewerken(null)
              setVervers((n) => n + 1)
            }}
          />
        </Modal>
      )}

      {tarraVraag && (
        <Modal title="Tarragewicht aanpassen" onClose={() => setTarraVraag(null)} width={440}>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (vraagAantal >= 1) maakDoos(tarraVraag.gewicht, vraagTarra)
            }}
          >
            <p>
              Het gewicht ({getal(tarraVraag.gewicht)} kg) wijkt af van {getal(totaalGewicht(verpakking))} kg. Controleer
              het tarragewicht.
            </p>
            <div className="field">
              <label htmlFor="vp-tarra">Tarragewicht (kg)</label>
              <input
                id="vp-tarra"
                type="text"
                inputMode="decimal"
                autoFocus
                value={tarraVraag.tarra}
                onChange={(e) => setTarraVraag({ ...tarraVraag, tarra: e.target.value })}
              />
              <span className={vraagAantal >= 1 ? 'hint' : 'error'}>
                {vraagAantal === null
                  ? 'Vul een getal in.'
                  : vraagAantal >= 1
                    ? `Aantal op het etiket: ${vraagAantal} stuks`
                    : 'Het gewicht is te laag voor een gevulde doos.'}
              </span>
            </div>
            <div className="verpak-knoppen">
              <button type="submit" className="btn btn-primary" disabled={!(vraagAantal >= 1)}>
                OK
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setTarraVraag(null)}>
                Annuleren
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

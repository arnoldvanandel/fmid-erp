import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { haalArtikelOpBarcode, zoekArtikelen } from '../../lib/artikelZoeken'
import {
  LABEL_KLANTEN,
  LABEL_MAAT,
  artikelSleutel,
  artikelenVoorKlant,
  bewaarPrinterNaam,
  drukAfOpPrinter,
  haalPrintersOp,
  klantVanSoort,
  labelDatum,
  laadLabelcatalogus,
  locatieUrl,
  printerNaam,
  verpakkingVan,
  zetPrinterVast,
  zoekLabelgegevens,
} from '../../lib/labels'
import { LabelVel } from './LabelVel'
import './label.css'

export default function Labels() {
  const [params] = useSearchParams()
  const voorbeeld = useRef(null)
  const [term, setTerm] = useState('')
  const [klant, setKlant] = useState('')
  const [catalogus, setCatalogus] = useState([])
  const [treffers, setTreffers] = useState([])
  const [artikel, setArtikel] = useState(null)
  const [labelIndex, setLabelIndex] = useState(0)
  const [aantal, setAantal] = useState(1)
  const [printer, setPrinter] = useState(printerNaam)
  const [vast, setVast] = useState('')
  const [wijzigen, setWijzigen] = useState(false)
  const [printers, setPrinters] = useState([])
  const [service, setService] = useState('bezig')
  const [bezigVast, setBezigVast] = useState(false)
  const [bezig, setBezig] = useState(false)
  const [bezigPrint, setBezigPrint] = useState(false)
  const [fout, setFout] = useState(null)
  const [melding, setMelding] = useState(null)

  const artikelen = useMemo(() => artikelenVoorKlant(catalogus, klant), [catalogus, klant])
  const gekozenSleutel = artikelSleutel(artikel)
  const dropdownWaarde = artikelen.some((a) => a.sleutel === gekozenSleutel) ? gekozenSleutel : ''

  const labels = artikel?.labels || []
  const label = labels[labelIndex] || null
  const datum = label ? labelDatum(label.soort) : ''
  const kopieen = Math.min(500, Math.max(1, Number(aantal) || 1))

  useEffect(() => {
    let weg = false
    laadLabelcatalogus()
      .then((lijst) => {
        if (!weg) setCatalogus(lijst)
      })
      .catch((e) => {
        if (!weg) setFout(e.message)
      })
    return () => {
      weg = true
    }
  }, [])

  useEffect(() => {
    let weg = false
    haalPrintersOp()
      .then(({ printers: lijst, printer: opgeslagen }) => {
        if (weg) return
        setPrinters(lijst)
        setService('klaar')
        if (opgeslagen) {
          setPrinter(opgeslagen)
          setVast(opgeslagen)
          setWijzigen(false)
          bewaarPrinterNaam(opgeslagen)
        } else if (printerNaam()) {
          setPrinter(printerNaam())
          setWijzigen(true)
        }
      })
      .catch(() => {
        if (!weg) setService('uit')
      })
    return () => {
      weg = true
    }
  }, [])

  useEffect(() => {
    const id = params.get('artikel')
    if (!id) return
    let weg = false
    getDoc(doc(db, 'artikelen', id))
      .then((snap) => {
        if (weg || !snap.exists()) return
        kiesArtikel({ id: snap.id, ...snap.data() })
      })
      .catch((e) => setFout(e.message))
    return () => {
      weg = true
    }
  }, [params])

  function kiesPrinter(naam) {
    setPrinter(naam)
  }

  async function vastzetten() {
    const naam = printer.trim()
    if (!naam) return
    setBezigVast(true)
    setFout(null)
    setMelding(null)
    try {
      const opgeslagen = await zetPrinterVast(naam)
      setVast(opgeslagen)
      setPrinter(opgeslagen)
      setWijzigen(false)
      setMelding(`Op deze pc gaan labels naar ${opgeslagen}.`)
    } catch (err) {
      setFout(err.message)
    } finally {
      setBezigVast(false)
    }
  }

  function kiesArtikel(volgende) {
    setArtikel(volgende)
    setLabelIndex(0)
    setTreffers([])
    setMelding(null)
    const bijKlant = klantVanSoort(volgende.labels?.[0]?.soort)
    if (bijKlant) setKlant(bijKlant)
    setFout(volgende.labels?.length ? null : 'Dit artikel heeft geen labelgegevens.')
  }

  function kiesKlant(id) {
    setKlant(id)
    setTreffers([])
    setFout(null)
    setMelding(null)
    const lijst = artikelenVoorKlant(catalogus, id)
    if (lijst.length === 1) {
      kiesArtikel(lijst[0])
      return
    }
    setArtikel(null)
    setLabelIndex(0)
  }

  function kiesUitLijst(sleutel) {
    const gekozen = artikelen.find((a) => a.sleutel === sleutel)
    if (gekozen) kiesArtikel(gekozen)
  }

  async function zoek(e) {
    e?.preventDefault()
    const waarde = term.trim()
    if (!waarde) return
    setBezig(true)
    setFout(null)
    setMelding(null)
    try {
      const direct = await haalArtikelOpBarcode(waarde)
      if (direct?.labels?.length) {
        kiesArtikel(direct)
        return
      }
      const lijst = (await zoekArtikelen(waarde, { max: 12 })).filter((a) => a.labels?.length)
      if (lijst.length === 1) {
        kiesArtikel(lijst[0])
        return
      }
      if (lijst.length > 1) {
        setTreffers(lijst)
        return
      }
      const { default: gegevens } = await import('../../../scripts/labelgegevens.json')
      const groepen = zoekLabelgegevens(waarde, gegevens)
      if (groepen.length === 1) {
        const groep = groepen[0]
        kiesArtikel({
          artikelnummer: groep[0].artNr || groep[0].id,
          naam: groep[0].nl1 || '',
          labels: groep,
        })
        return
      }
      if (groepen.length > 1) {
        setTreffers(
          groepen.map((groep) => ({
            id: groep[0].id || groep[0].barcode,
            artikelnummer: groep[0].artNr || groep[0].id,
            naam: groep[0].nl1 || '',
            labels: groep,
          }))
        )
        return
      }
      setFout(direct ? 'Dit artikel heeft geen labelgegevens.' : `Geen label voor "${waarde}".`)
    } catch (err) {
      setFout(err.message)
    } finally {
      setBezig(false)
    }
  }

  async function afdrukken() {
    if (!label) return
    const doel = vast || printer
    setFout(null)
    setMelding(null)
    if (!doel) {
      setFout('Zet eerst de labelprinter vast op deze pc.')
      return
    }
    if (service !== 'klaar') {
      setFout('De labelprinter op deze pc is niet bereikbaar. Start npm run labelprinter en probeer opnieuw.')
      return
    }
    if (service === 'klaar' && doel) {
      setBezigPrint(true)
      try {
        const { default: html2canvas } = await import('html2canvas')
        const canvas = await html2canvas(voorbeeld.current, {
          scale: 3,
          backgroundColor: '#ffffff',
          useCORS: true,
        })
        const pngBase64 = canvas.toDataURL('image/png').split(',')[1]
        await drukAfOpPrinter({
          printer: doel,
          copies: kopieen,
          pngBase64,
          widthMm: LABEL_MAAT.breedteMm,
          heightMm: LABEL_MAAT.hoogteMm,
        })
        setMelding(`${kopieen} label${kopieen === 1 ? '' : 's'} naar ${doel} gestuurd.`)
      } catch (err) {
        setFout(err.message)
      } finally {
        setBezigPrint(false)
      }
    }
  }

  const locatie = label ? locatieUrl(label.locatie) : ''

  return (
    <div className="content label-pagina">
      <div className="label-werk">
        <div>
          <div className="page-header">
            <div>
              <h1>Labels</h1>
              <div className="page-header-sub">Verpakkingslabels afdrukken</div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-pad">
              {vast && !wijzigen ? (
                <div className="label-balk">
                  <div>
                    <div className="hint">Labelprinter op deze pc</div>
                    <strong>{vast}</strong>
                  </div>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setWijzigen(true)}>
                    Wijzigen
                  </button>
                </div>
              ) : (
                <div className="label-balk">
                  <div className="field">
                    <label htmlFor="label-printer">Labelprinter op deze pc</label>
                    <select
                      id="label-printer"
                      value={printer}
                      onChange={(e) => kiesPrinter(e.target.value)}
                      disabled={service !== 'klaar'}
                    >
                      <option value="">{service === 'klaar' ? 'Kies een printer' : 'Printers laden…'}</option>
                      {printer && !printers.includes(printer) && <option value={printer}>{printer}</option>}
                      {printers.map((naam) => (
                        <option key={naam} value={naam}>
                          {naam}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={vastzetten}
                    disabled={service !== 'klaar' || !printer.trim() || bezigVast}
                  >
                    {bezigVast ? 'Bezig…' : 'Vastzetten'}
                  </button>
                  {vast && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setWijzigen(false)}>
                      Annuleren
                    </button>
                  )}
                </div>
              )}
              {service === 'uit' && (
                <div className="banner banner-warning" style={{ marginTop: 12 }}>
                  Start op deze pc <code>npm run labelprinter</code>. Daarna kun je de labelprinter vastzetten. Labels
                  gaan dan daarheen, niet naar de standaardprinter van Windows.
                </div>
              )}
              {service === 'klaar' && !vast && (
                <p className="hint">Kies de labelprinter en zet die vast. De keuze geldt alleen voor deze computer.</p>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-pad">
              <div className="field">
                <label id="label-klant-label">Klant</label>
                <div className="label-snelkeuze" role="group" aria-labelledby="label-klant-label">
                  {LABEL_KLANTEN.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={'btn btn-secondary btn-sm' + (klant === item.id ? ' is-actief' : '')}
                      aria-pressed={klant === item.id}
                      onClick={() => kiesKlant(item.id)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="field">
                <label htmlFor="label-artikel">Artikel</label>
                <select
                  id="label-artikel"
                  value={dropdownWaarde}
                  onChange={(e) => kiesUitLijst(e.target.value)}
                  disabled={!klant || catalogus.length === 0}
                >
                  <option value="">
                    {!klant ? 'Kies eerst een klant' : catalogus.length === 0 ? 'Artikelen laden…' : 'Kies een artikel'}
                  </option>
                  {artikelen.map((a) => (
                    <option key={a.sleutel} value={a.sleutel}>
                      {a.artikelnummer}
                      {a.naam ? ` · ${a.naam}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="label-zoek">Of scan een barcode</label>
                <input
                  id="label-zoek"
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') zoek()
                  }}
                  placeholder="Scan of typ barcode, artikelnummer of naam"
                  autoFocus
                />
              </div>
              <button className="btn btn-secondary" type="button" onClick={() => zoek()} disabled={bezig}>
                {bezig ? 'Zoeken…' : 'Zoek'}
              </button>
              {treffers.length > 1 && (
                <div className="label-keuze" role="listbox" aria-label="Artikelen">
                  {treffers.map((a) => (
                    <button key={a.id} type="button" className="btn btn-ghost btn-sm" onClick={() => kiesArtikel(a)}>
                      {a.artikelnummer} · {a.naam}
                    </button>
                  ))}
                </div>
              )}
              {fout && <div className="banner banner-danger" style={{ marginTop: 12 }}>{fout}</div>}
              {melding && <div className="banner banner-info" style={{ marginTop: 12 }}>{melding}</div>}

              {artikel && (
                <>
                  <h2 style={{ margin: '16px 0 4px' }}>
                    {artikel.artikelnummer} <span className="hint">{artikel.naam}</span>
                  </h2>
                  {labels.length > 1 && (
                    <div className="label-keuze">
                      {labels.map((item, i) => (
                        <button
                          key={`${item.id}-${item.barcode}`}
                          type="button"
                          className={'btn btn-sm ' + (i === labelIndex ? 'btn-primary' : 'btn-secondary')}
                          onClick={() => setLabelIndex(i)}
                        >
                          {verpakkingVan(item)} · {item.aantal} stuks
                        </button>
                      ))}
                    </div>
                  )}
                  {label && (
                    <div className="label-balk" style={{ marginTop: 8 }}>
                      <div className="field">
                        <label htmlFor="label-aantal">Aantal stickers</label>
                        <input
                          id="label-aantal"
                          type="number"
                          min="1"
                          max="500"
                          value={aantal}
                          onChange={(e) => setAantal(e.target.value)}
                          style={{ maxWidth: 120 }}
                        />
                      </div>
                      <button className="btn btn-primary" type="button" onClick={afdrukken} disabled={bezigPrint}>
                        {bezigPrint ? 'Bezig…' : 'Afdrukken'}
                      </button>
                    </div>
                  )}
                  {label && (
                    <p className="hint">
                      {label.soort} · barcode {label.barcode || '—'}
                      {label.sticker ? ` · sticker ${label.sticker}` : ''}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="label-voorbeeld">
          {label ? (
            <>
              <div className="etiket-kaart">
                <LabelVel ref={voorbeeld} label={label} datum={datum} />
              </div>
              {locatie && (
                <figure className="etiket-locatie">
                  <img src={locatie} alt="" />
                  <figcaption>Plakken: {label.locatie}</figcaption>
                </figure>
              )}
            </>
          ) : (
            <div className="empty-state">Zoek een artikel om het label te zien.</div>
          )}
        </div>
      </div>

      <div className="label-afdruk" aria-hidden="true">
        {label &&
          Array.from({ length: kopieen }, (_, i) => <LabelVel key={i} label={label} datum={datum} />)}
      </div>
    </div>
  )
}

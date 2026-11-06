import { useEffect, useMemo, useState } from 'react'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import { useCollection } from '../../hooks/useCollection'
import Modal from '../../components/Modal'
import { ADRES_TYPES } from '../../lib/stamgegevens'
import {
  adresRegel,
  drukPdfAf,
  foutVanPostnl,
  isNederland,
  openPdf,
  pdfUitBase64,
  postcodeWeergave,
  splitsStraatHuisnummer,
  vraagPostnlLabel,
  zaaiStandaardAdressen,
} from '../../lib/postnl'
import './postnl.css'

function adressenVanKlant(klant) {
  const lijst = []
  if (klant.straat || klant.postcode || klant.plaats) {
    lijst.push({
      soort: 'Hoofdadres',
      naam: klant.naam || '',
      straat: klant.straat || '',
      postcode: klant.postcode || '',
      plaats: klant.plaats || '',
      land: klant.land || '',
    })
  }
  for (const adres of klant.adressen || []) {
    if (!adres.straat && !adres.postcode && !adres.plaats) continue
    lijst.push({
      soort: ADRES_TYPES[adres.type] || 'Adres',
      naam: adres.naam || klant.naam || '',
      straat: adres.straat || '',
      postcode: adres.postcode || '',
      plaats: adres.plaats || '',
      land: adres.land || klant.land || '',
    })
  }
  return lijst
}

function formulierVanAdres(klant, adres) {
  const gesplitst = splitsStraatHuisnummer(adres.straat)
  return {
    titel: klant.zoeknaam || klant.naam || '',
    naam: adres.naam || klant.naam || '',
    straat: gesplitst.straat,
    huisnummer: gesplitst.huisnummer,
    huisnummerToevoeging: '',
    postcode: adres.postcode || '',
    plaats: adres.plaats || '',
    land: adres.land || '',
  }
}

function AdresVelden({ form, onChange }) {
  function set(veld, waarde) {
    onChange({ ...form, [veld]: waarde })
  }
  return (
    <>
      <div className="field">
        <label>Naam op de tegel</label>
        <input value={form.titel} onChange={(e) => set('titel', e.target.value)} />
      </div>
      <div className="field">
        <label>Naam op het label</label>
        <input value={form.naam} onChange={(e) => set('naam', e.target.value)} />
      </div>
      <div className="field-row">
        <div className="field" style={{ flex: 2 }}>
          <label>Straat</label>
          <input value={form.straat} onChange={(e) => set('straat', e.target.value)} />
        </div>
        <div className="field">
          <label>Huisnummer</label>
          <input value={form.huisnummer} onChange={(e) => set('huisnummer', e.target.value)} />
        </div>
        <div className="field">
          <label>Toevoeging</label>
          <input
            value={form.huisnummerToevoeging}
            onChange={(e) => set('huisnummerToevoeging', e.target.value)}
          />
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label>Postcode</label>
          <input value={form.postcode} onChange={(e) => set('postcode', e.target.value)} />
        </div>
        <div className="field">
          <label>Plaats</label>
          <input value={form.plaats} onChange={(e) => set('plaats', e.target.value)} />
        </div>
      </div>
    </>
  )
}

function controleerAdres(form) {
  if (!form.titel.trim() || !form.naam.trim()) return 'Naam op de tegel en op het label zijn verplicht.'
  if (!form.straat.trim() || !form.huisnummer.trim()) return 'Straat en huisnummer zijn verplicht.'
  if (!form.postcode.trim() || !form.plaats.trim()) return 'Postcode en plaats zijn verplicht.'
  if (form.land && !isNederland(form.land)) return 'Alleen Nederlandse adressen kunnen als PostNL-tegel.'
  const postcode = form.postcode.replace(/\s+/g, '').toUpperCase()
  if (!/^[1-9][0-9]{3}[A-Z]{2}$/.test(postcode)) return 'Vul een Nederlandse postcode in, bijvoorbeeld 4271 BA.'
  return null
}

function payloadVanForm(form, extra = {}) {
  return {
    titel: form.titel.trim(),
    naam: form.naam.trim(),
    voornaam: '',
    straat: form.straat.trim(),
    huisnummer: form.huisnummer.trim(),
    huisnummerToevoeging: form.huisnummerToevoeging.trim(),
    postcode: form.postcode.replace(/\s+/g, '').toUpperCase(),
    plaats: form.plaats.trim(),
    land: 'NL',
    ...extra,
  }
}

export default function PostnlLabels() {
  const { isAdmin } = useAuth()
  const { data, loading, error } = useCollection('postnlSnelkoppelingen')
  const { data: klanten } = useCollection('klanten')
  const [zaaiFout, setZaaiFout] = useState(null)
  const [tegel, setTegel] = useState(null)
  const [nieuw, setNieuw] = useState(false)

  useEffect(() => {
    let weg = false
    zaaiStandaardAdressen().catch((err) => {
      if (!weg) setZaaiFout(err.message)
    })
    return () => {
      weg = true
    }
  }, [])

  const tegels = useMemo(
    () =>
      data
        .filter((item) => item.id !== '_meta' && item.titel)
        .sort((a, b) => (a.volgorde ?? 0) - (b.volgorde ?? 0) || a.titel.localeCompare(b.titel, 'nl')),
    [data]
  )

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1>PostNL-labels</h1>
          <div className="page-header-sub">
            Kies een tegel om een verzendlabel af te drukken. Een klant uit het bestand kun je als nieuwe tegel vastzetten.
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setNieuw(true)}>
          Klant als snelkoppeling
        </button>
      </div>

      {(error || zaaiFout) && (
        <div className="banner banner-danger" style={{ marginBottom: 16 }}>
          {error || zaaiFout}
        </div>
      )}

      {loading ? (
        <div className="empty-state">
          <div className="spinner" style={{ margin: '0 auto' }} />
        </div>
      ) : tegels.length === 0 ? (
        <div className="card card-pad">
          <p>Nog geen snelkoppelingen. Zet een klant vast als tegel.</p>
        </div>
      ) : (
        <div className="postnl-tegels">
          {tegels.map((item) => (
            <button key={item.id} type="button" className="postnl-tegel" onClick={() => setTegel(item)}>
              <span className="postnl-tegel-titel">{item.titel}</span>
              <span className="postnl-tegel-naam">{item.naam}</span>
              <span className="postnl-tegel-adres">{adresRegel(item)}</span>
              <span className="postnl-tegel-adres">
                {postcodeWeergave(item.postcode)} {item.plaats}
              </span>
            </button>
          ))}
        </div>
      )}

      {tegel && <LabelVenster tegel={tegel} isAdmin={isAdmin} onClose={() => setTegel(null)} />}
      {nieuw && <NieuweTegel klanten={klanten} onClose={() => setNieuw(false)} />}
    </div>
  )
}

function LabelVenster({ tegel, isAdmin, onClose }) {
  const [aantal, setAantal] = useState(1)
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState(null)
  const [pdfUrl, setPdfUrl] = useState(null)
  const [barcodes, setBarcodes] = useState([])
  const [wijzigen, setWijzigen] = useState(false)
  const [form, setForm] = useState(() => ({
    titel: tegel.titel || '',
    naam: tegel.naam || '',
    straat: tegel.straat || '',
    huisnummer: tegel.huisnummer || '',
    huisnummerToevoeging: tegel.huisnummerToevoeging || '',
    postcode: tegel.postcode || '',
    plaats: tegel.plaats || '',
    land: 'NL',
  }))

  useEffect(() => () => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl)
  }, [pdfUrl])

  async function afdrukken() {
    const melding = controleerAdres({ ...form, titel: form.titel || tegel.titel })
    if (melding) {
      setFout(melding)
      return
    }
    setBezig(true)
    setFout(null)
    const venster = window.open('', 'postnl-label')
    if (venster) {
      venster.document.write('<p style="font-family:sans-serif;padding:24px">PostNL-label wordt opgehaald…</p>')
      venster.document.close()
    }
    try {
      const data = await vraagPostnlLabel({
        adres: payloadVanForm(form),
        aantal: Math.min(20, Math.max(1, Number(aantal) || 1)),
      })
      if (pdfUrl) URL.revokeObjectURL(pdfUrl)
      const url = pdfUitBase64(data.pdfBase64)
      setPdfUrl(url)
      setBarcodes(data.barcodes || [])
      openPdf(url, {
        bestaand: venster,
        naLaden: (event) => {
          event.currentTarget.focus()
          event.currentTarget.print()
        },
      })
    } catch (err) {
      venster?.close()
      setFout(foutVanPostnl(err))
    } finally {
      setBezig(false)
    }
  }

  async function opslaan(e) {
    e.preventDefault()
    const melding = controleerAdres(form)
    if (melding) {
      setFout(melding)
      return
    }
    setBezig(true)
    setFout(null)
    try {
      await updateDoc(doc(db, 'postnlSnelkoppelingen', tegel.id), payloadVanForm(form))
      setWijzigen(false)
    } catch (err) {
      setFout(err.message)
    } finally {
      setBezig(false)
    }
  }

  async function verwijderen() {
    if (!window.confirm(`Snelkoppeling "${tegel.titel}" verwijderen?`)) return
    setBezig(true)
    try {
      await deleteDoc(doc(db, 'postnlSnelkoppelingen', tegel.id))
      onClose()
    } catch (err) {
      setFout(err.message)
      setBezig(false)
    }
  }

  return (
    <Modal title={form.titel || tegel.titel} onClose={onClose} width={720}>
      <p className="page-header-sub" style={{ marginBottom: 12 }}>
        {form.naam}
        <br />
        {adresRegel(form)}, {postcodeWeergave(form.postcode)} {form.plaats}
      </p>

      {fout && (
        <div className="banner banner-danger" style={{ marginBottom: 12 }}>
          {fout}
        </div>
      )}

      {!pdfUrl && (
        <div className="field" style={{ maxWidth: 160 }}>
          <label>Aantal labels</label>
            <input
            type="number"
            min={1}
            max={20}
            value={aantal}
            onChange={(e) => setAantal(e.target.value)}
          />
          <div className="hint">Elk label is een pakket van 2 kg.</div>
        </div>
      )}

      {pdfUrl && (
        <>
          <iframe className="postnl-labelvoorbeeld" title="PostNL-label" src={pdfUrl} />
          {barcodes.length > 0 && (
            <p className="page-header-sub" style={{ marginTop: 8 }}>
              Barcode{barcodes.length === 1 ? '' : 's'}: {barcodes.join(', ')}
            </p>
          )}
        </>
      )}

      {wijzigen && (
        <form onSubmit={opslaan} style={{ marginTop: 12 }}>
          <AdresVelden form={form} onChange={setForm} />
          <div className="postnl-acties">
            <button className="btn btn-primary" type="submit" disabled={bezig}>
              Adres opslaan
            </button>
            <button className="btn btn-secondary" type="button" onClick={() => setWijzigen(false)}>
              Annuleren
            </button>
          </div>
        </form>
      )}

      <div className="postnl-acties">
        {!wijzigen && !pdfUrl && (
          <button className="btn btn-primary" type="button" onClick={afdrukken} disabled={bezig}>
            {bezig ? 'Label ophalen…' : 'Label maken en afdrukken'}
          </button>
        )}
        {pdfUrl && (
          <button className="btn btn-primary" type="button" onClick={() => drukPdfAf(pdfUrl)}>
            Afdrukken
          </button>
        )}
        {!wijzigen && !pdfUrl && (
          <button className="btn btn-secondary" type="button" onClick={() => setWijzigen(true)} disabled={bezig}>
            Adres wijzigen
          </button>
        )}
        {isAdmin && !pdfUrl && (
          <button className="btn btn-danger" type="button" onClick={verwijderen} disabled={bezig}>
            Verwijderen
          </button>
        )}
        <button className="btn btn-ghost" type="button" onClick={onClose}>
          Sluiten
        </button>
      </div>
    </Modal>
  )
}

function NieuweTegel({ klanten, onClose }) {
  const [zoek, setZoek] = useState('')
  const [klant, setKlant] = useState(null)
  const [adressen, setAdressen] = useState([])
  const [adresIndex, setAdresIndex] = useState(0)
  const [form, setForm] = useState(null)
  const [fout, setFout] = useState(null)
  const [bezig, setBezig] = useState(false)

  const treffers = useMemo(() => {
    const q = zoek.trim().toLowerCase()
    if (!q) return []
    return klanten
      .filter(
        (k) =>
          k.naam?.toLowerCase().includes(q) ||
          k.zoeknaam?.toLowerCase().includes(q) ||
          k.klantcode?.toLowerCase().includes(q) ||
          k.plaats?.toLowerCase().includes(q)
      )
      .sort((a, b) => String(a.naam || '').localeCompare(String(b.naam || ''), 'nl'))
      .slice(0, 20)
  }, [klanten, zoek])

  function kiesKlant(volgende) {
    const lijst = adressenVanKlant(volgende)
    setKlant(volgende)
    setAdressen(lijst)
    setFout(lijst.length ? null : 'Deze klant heeft geen adres.')
    if (!lijst.length) {
      setForm(null)
      return
    }
    const levering = lijst.findIndex((a) => a.soort === 'Leveradres')
    const index = levering >= 0 ? levering : 0
    setAdresIndex(index)
    setForm(formulierVanAdres(volgende, lijst[index]))
  }

  function kiesAdres(index) {
    setAdresIndex(index)
    setForm(formulierVanAdres(klant, adressen[index]))
  }

  async function opslaan(e) {
    e.preventDefault()
    const melding = controleerAdres(form)
    if (melding) {
      setFout(melding)
      return
    }
    setBezig(true)
    setFout(null)
    try {
      await addDoc(collection(db, 'postnlSnelkoppelingen'), {
        ...payloadVanForm(form),
        klantId: klant.id,
        klantcode: klant.klantcode || '',
        volgorde: Date.now(),
        standaard: false,
        aangemaaktOp: serverTimestamp(),
      })
      onClose()
    } catch (err) {
      setFout(err.message)
      setBezig(false)
    }
  }

  return (
    <Modal title="Klant als snelkoppeling" onClose={onClose} width={720}>
      {fout && (
        <div className="banner banner-danger" style={{ marginBottom: 12 }}>
          {fout}
        </div>
      )}

      {!klant ? (
        <>
          <div className="field">
            <label>Zoek een klant</label>
            <input
              autoFocus
              placeholder="Naam, klantnummer of plaats…"
              value={zoek}
              onChange={(e) => setZoek(e.target.value)}
            />
          </div>
          <div className="postnl-keuze">
            {treffers.length === 0 ? (
              <p className="page-header-sub">{zoek.trim() ? 'Geen klanten gevonden.' : 'Typ een naam of klantnummer.'}</p>
            ) : (
              treffers.map((k) => (
                <button key={k.id} type="button" onClick={() => kiesKlant(k)}>
                  <strong>
                    {k.naam}
                    {k.klantcode ? ` · ${k.klantcode}` : ''}
                  </strong>
                  <div className="page-header-sub">
                    {[k.straat, postcodeWeergave(k.postcode), k.plaats].filter(Boolean).join(', ') || 'Geen hoofdadres'}
                  </div>
                </button>
              ))
            )}
          </div>
        </>
      ) : (
        <form onSubmit={opslaan}>
          <p className="page-header-sub" style={{ marginBottom: 8 }}>
            {klant.naam}
            {klant.klantcode ? ` · ${klant.klantcode}` : ''}
          </p>
          {adressen.length > 1 && (
            <div className="postnl-keuze">
              {adressen.map((adres, index) => (
                  <button
                    key={`${adres.soort}-${adres.straat}-${adres.postcode}`}
                    type="button"
                    className={index === adresIndex ? 'actief' : ''}
                    onClick={() => kiesAdres(index)}
                  >
                    <strong>{adres.soort}</strong>
                    <div className="page-header-sub">
                      {adres.naam} · {adres.straat}, {postcodeWeergave(adres.postcode)} {adres.plaats}
                    </div>
                  </button>
              ))}
            </div>
          )}
          {form && <AdresVelden form={form} onChange={setForm} />}
          <div className="postnl-acties">
            <button className="btn btn-primary" type="submit" disabled={bezig || !form}>
              {bezig ? 'Opslaan…' : 'Tegel aanmaken'}
            </button>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => {
                setKlant(null)
                setForm(null)
                setFout(null)
              }}
            >
              Andere klant
            </button>
            <button className="btn btn-ghost" type="button" onClick={onClose}>
              Annuleren
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase'
import { useCollection } from '../../hooks/useCollection'
import { useAuth } from '../../contexts/AuthContext'
import { formatDateTime, formatNumber } from '../../lib/format'
import { houderFamilie, ontcijferHouder, ontcijferPlaat, plaatFamilie, plaatSleutel, VORMEN } from '../../lib/wisselplaat'
import { uploadGereedschapFoto } from '../../lib/gereedschapFotos'
import Modal from '../../components/Modal'
import PlaatTekening from './PlaatTekening'

const SOORTEN = [
  { id: 'combinatie', label: 'Combinaties' },
  { id: 'houder', label: 'Houders' },
  { id: 'plaat', label: 'Plaatjes' },
]

const MAX_KAARTEN = 60
const MAX_OP_KAART = 4

function mm(waarde, decimalen = 1) {
  if (waarde === null || waarde === undefined || waarde === '') return '—'
  return `${formatNumber(waarde, decimalen)} mm`
}

function woorden(term) {
  return term.toLowerCase().split(/\s+/).filter(Boolean)
}

function vergelijkLocatie(a, b) {
  if (!a || !b) return (a ? 0 : 1) - (b ? 0 : 1)
  return a.localeCompare(b, 'nl', { numeric: true })
}

// Houders en plaatjes uit de combinaties en de losse documenten van de sync.
function bouwItems(data) {
  const houders = new Map()
  const plaatjes = new Map()
  const combinaties = []

  for (const g of data) {
    if (g.soort === 'combinatie') combinaties.push(g)
    if (g.houderId != null && (g.soort === 'combinatie' || g.soort === 'houder') && !houders.has(g.houderId)) {
      houders.set(g.houderId, {
        id: `h-${g.houderId}`,
        type: 'houder',
        houderId: g.houderId,
        houder: g.houder,
        omschrijving: g.omschrijving,
        houderLocatie: g.houderLocatie,
        houderArtikel: g.houderArtikel,
        typeBewerking: g.typeBewerking,
        soortPlaat: g.soortPlaat,
        houderOpmerking: g.houderOpmerking,
        combinaties: [],
      })
    }
    if (g.plaatId != null && (g.soort === 'combinatie' || g.soort === 'plaat') && !plaatjes.has(g.plaatId)) {
      plaatjes.set(g.plaatId, {
        id: `p-${g.plaatId}`,
        type: 'plaat',
        plaatId: g.plaatId,
        plaat: g.plaat,
        fabrikant: g.fabrikant,
        plaatLocatie: g.plaatLocatie,
        plaatArtikel: g.plaatArtikel,
        plaatOpmerking: g.plaatOpmerking,
        vorm: g.vorm,
        hoekradius: g.hoekradius,
        dikte: g.dikte,
        combinaties: [],
      })
    }
  }

  const combiItems = combinaties.map((g) => {
    const item = { ...g, id: g.id, type: 'combinatie' }
    houders.get(g.houderId)?.combinaties.push(item)
    plaatjes.get(g.plaatId)?.combinaties.push(item)
    return item
  })
  for (const item of combiItems) {
    item.anderePlaatjes = Math.max(0, (houders.get(item.houderId)?.combinaties.length ?? 1) - 1)
  }

  const alle = [...combiItems, ...houders.values(), ...plaatjes.values()]
  for (const item of alle) {
    const plaatIso = item.plaat ? ontcijferPlaat(item.plaat) : null
    const houderIso = item.houder ? ontcijferHouder(item.houder) : null
    item.plaatIso = plaatIso
    item.houderIso = houderIso
    const soortPlaat = (item.soortPlaat || '').replace(/\s+/g, '').toUpperCase()
    item.tekenVorm =
      plaatIso?.vorm ||
      (houderIso?.iso ? houderIso.vorm : '') ||
      houderFamilie(item.houder) ||
      plaatFamilie(soortPlaat) ||
      (/^[A-Z]{4}$/.test(soortPlaat) && VORMEN[soortPlaat[0]] ? soortPlaat[0] : '')
    item.metGat = plaatIso?.iso ? plaatIso.metGat : item.tekenVorm !== 'ST'
    item.zoek = [
      item.plaat, item.fabrikant, item.plaatLocatie, item.plaatArtikel,
      item.houder, item.omschrijving, item.houderLocatie, item.houderArtikel,
      item.typeBewerking, item.soortPlaat,
    ].filter(Boolean).join(' ').toLowerCase()
  }
  // Een houder is ook vindbaar op de plaatjes die erop passen.
  for (const houder of houders.values()) {
    houder.zoek += ' ' + houder.combinaties.map((c) => c.plaat || '').join(' ').toLowerCase()
  }

  return {
    combinaties: combiItems,
    houders: [...houders.values()],
    plaatjes: [...plaatjes.values()],
    perId: new Map(alle.map((item) => [item.id, item])),
  }
}

function Markeer({ tekst, termen }) {
  const waarde = String(tekst || '')
  if (!waarde || termen.length === 0) return waarde || null
  const patroon = new RegExp(`(${termen.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
  return waarde.split(patroon).map((deel, i) =>
    i % 2 === 1 ? <mark key={i} className="gs-mark">{deel}</mark> : deel
  )
}

function Locatie({ label, code, groot = false }) {
  return (
    <div className={`gs-locatie${groot ? ' gs-locatie-groot' : ''}${code ? '' : ' gs-locatie-leeg'}`}>
      <span className="gs-locatie-label">{label}</span>
      <span className="gs-locatie-code">{code || 'onbekend'}</span>
    </div>
  )
}

function Visual({ item, foto, grootte, stil }) {
  const iso = item.plaatIso
  if (foto) {
    return <img className="gs-foto" src={foto.url} alt={item.plaat || item.houder} loading="lazy" />
  }
  return (
    <PlaatTekening
      vorm={item.tekenVorm}
      radius={item.hoekradius ?? iso?.radius}
      metGat={item.metGat}
      grootte={grootte}
      stil={stil}
    />
  )
}

function Kaart({ item, foto, termen, onOpen }) {
  const iso = item.plaatIso
  const vormNaam = VORMEN[item.tekenVorm]?.naam
  const titel = item.type === 'houder' ? item.houder : item.plaat
  const extra =
    item.type === 'houder'
      ? item.combinaties.length
      : item.type === 'plaat'
        ? item.combinaties.length
        : null

  return (
    <button type="button" className="gs-kaart" onClick={() => onOpen(item.id)}>
      <div className="gs-kaart-visual">
        <Visual item={item} foto={foto} grootte={112} />
        {item.tekenVorm && (
          <span className="gs-vorm-badge">
            <strong>{item.tekenVorm}</strong>
            {vormNaam && <span>{vormNaam}</span>}
          </span>
        )}
        {item.type !== 'combinatie' && (
          <span className="gs-soort-badge">{item.type === 'houder' ? 'Houder' : 'Plaatje'}</span>
        )}
      </div>

      <div className="gs-kaart-body">
        <div className="gs-kaart-titel">
          <Markeer tekst={titel || 'Onbekend'} termen={termen} />
        </div>
        <div className="gs-kaart-sub">
          {item.type === 'houder' ? (
            <Markeer tekst={item.omschrijving || item.typeBewerking || '—'} termen={termen} />
          ) : (
            <>
              <Markeer tekst={item.fabrikant || 'Fabrikant onbekend'} termen={termen} />
              {item.type === 'combinatie' && (
                <>
                  <span className="gs-punt">·</span>
                  <Markeer tekst={item.houder} termen={termen} />
                </>
              )}
            </>
          )}
        </div>

        <div className="gs-locaties">
          {item.type !== 'houder' && <Locatie label="Plaatje" code={item.plaatLocatie} />}
          {item.type !== 'plaat' && <Locatie label="Houder" code={item.houderLocatie} />}
        </div>

        {item.type !== 'houder' && (iso?.iso || item.hoekradius || item.dikte) ? (
          <div className="gs-maten">
            {iso?.snijkant ? <span>l {iso.snijkant} mm</span> : null}
            <span>r {mm(item.hoekradius ?? iso?.radius)}</span>
            <span>s {mm(item.dikte ?? iso?.dikte, 2)}</span>
          </div>
        ) : item.type === 'houder' && item.soortPlaat ? (
          <div className="gs-maten">
            <span>Plaat {item.soortPlaat}</span>
            {item.typeBewerking && <span>{item.typeBewerking}</span>}
          </div>
        ) : null}

        {item.type === 'houder' && extra > 0 && (
          <div className="gs-kaart-plaatjes">
            <div className="gs-kaart-plaatjes-kop">
              Past op deze houder <span className="gs-teller">{extra}</span>
            </div>
            {item.combinaties.slice(0, MAX_OP_KAART).map((c) => (
              <span key={c.id} className="gs-kaart-plaatje">
                <PlaatTekening
                  vorm={c.tekenVorm}
                  radius={c.hoekradius ?? c.plaatIso?.radius}
                  metGat={c.metGat}
                  grootte={22}
                  stil
                />
                <span className="gs-kaart-plaatje-naam">
                  <Markeer tekst={c.plaat || 'Onbekend'} termen={termen} />
                </span>
                <span className="gs-kaart-plaatje-locatie">{c.plaatLocatie || '—'}</span>
              </span>
            ))}
            {extra > MAX_OP_KAART && (
              <span className="gs-kaart-plaatjes-meer">+ {extra - MAX_OP_KAART} meer, open de houder</span>
            )}
          </div>
        )}

        {item.type === 'combinatie' && item.anderePlaatjes > 0 && (
          <div className="gs-kaart-voet gs-kaart-voet-accent">
            + {item.anderePlaatjes} {item.anderePlaatjes === 1 ? 'ander plaatje past' : 'andere plaatjes passen'} op deze houder
          </div>
        )}

        {extra !== null && (extra === 0 || item.type === 'plaat') && (
          <div className="gs-kaart-voet">
            {extra === 0
              ? item.type === 'houder' ? 'Geen plaatje gekoppeld' : 'Geen houder gekoppeld'
              : `Past in ${extra} ${extra === 1 ? 'houder' : 'houders'}`}
          </div>
        )}
      </div>
    </button>
  )
}

function CodeLint({ titel, iso }) {
  if (!iso?.iso) return null
  return (
    <div className="gs-codelint-blok">
      <div className="gs-sectie-titel">{titel}</div>
      <div className="gs-codelint">
        {iso.delen.map((deel, i) => (
          <div
            key={`${deel.label}-${i}`}
            className="gs-codedeel"
            style={{ flexGrow: Math.max(1, deel.code.length / 2.5) }}
          >
            <span className={`gs-codedeel-code${deel.code.length > 4 ? ' gs-codedeel-lang' : ''}`}>{deel.code}</span>
            <span className="gs-codedeel-label">{deel.label}</span>
            <span className="gs-codedeel-waarde">{deel.waarde}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function MiniLijst({ titel, hint, items, onOpen, toon }) {
  if (items.length === 0) return null
  return (
    <div className="gs-sectie">
      <div className="gs-sectie-titel">
        {titel} <span className="gs-teller">{items.length}</span>
      </div>
      {hint && <p className="hint">{hint}</p>}
      <div className="gs-mini-raster">
        {items.map((item) => (
          <button key={item.id} type="button" className="gs-mini" onClick={() => onOpen(item.id)}>
            <PlaatTekening
              vorm={item.tekenVorm}
              radius={item.hoekradius ?? item.plaatIso?.radius}
              metGat={item.metGat}
              grootte={36}
              stil
            />
            <span className="gs-mini-tekst">
              <strong>{toon === 'houder' ? item.houder : item.plaat}</strong>
              <span>{toon === 'houder' ? item.houderLocatie || 'locatie onbekend' : item.plaatLocatie || 'locatie onbekend'}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function FotoKnoppen({ naam, foto }) {
  const { profile } = useAuth()
  const invoer = useRef(null)
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState(null)

  async function kies(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setFout(null)
    setBezig(true)
    try {
      await uploadGereedschapFoto({ naam, file, gebruiker: profile?.naam || profile?.email })
    } catch (err) {
      setFout(err.message)
    } finally {
      setBezig(false)
    }
  }

  const zoekUrl = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(`${naam} wisselplaat`)}`
  return (
    <div className="gs-foto-knoppen">
      <input ref={invoer} type="file" accept="image/*" hidden onChange={kies} />
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => invoer.current?.click()} disabled={bezig}>
        {bezig ? 'Uploaden…' : foto ? 'Foto vervangen' : 'Foto toevoegen'}
      </button>
      <a className="btn btn-ghost btn-sm" href={zoekUrl} target="_blank" rel="noreferrer">
        Zoek online
      </a>
      {fout && <div className="banner banner-danger" style={{ marginTop: 8, width: '100%' }}>{fout}</div>}
    </div>
  )
}

function Detail({ item, items, fotos, onOpen, onClose }) {
  const fotoNaam = item.type === 'houder' ? item.houder : item.plaat
  const foto = fotos.get(plaatSleutel(fotoNaam))
  const titel = item.type === 'houder' ? item.houder : item.plaat

  const houder = item.type === 'plaat' ? null : items.perId.get(`h-${item.houderId}`)
  const plaat = item.type === 'houder' ? null : items.perId.get(`p-${item.plaatId}`)

  const anderePlaatjes = houder
    ? houder.combinaties.filter((c) => c.id !== item.id)
    : []
  const andereHouders = plaat
    ? plaat.combinaties.filter((c) => c.id !== item.id)
    : []

  // Niet gekoppeld in Controlsys, maar wel hetzelfde ISO-type (WNMG ↔ WNMG…).
  const opType = useMemo(() => {
    if (item.type === 'houder') {
      const type = (item.soortPlaat || '').replace(/\s+/g, '').toUpperCase()
      if (type.length < 3) return []
      const gekoppeld = new Set(item.combinaties.map((c) => c.plaatId))
      return items.plaatjes.filter(
        (p) => !gekoppeld.has(p.plaatId) && (p.plaat || '').replace(/\s+/g, '').toUpperCase().startsWith(type)
      )
    }
    if (item.type === 'plaat') {
      const type = (item.plaat || '').replace(/\s+/g, '').toUpperCase().slice(0, 4)
      if (!/^[A-Z]{4}$/.test(type)) return []
      const gekoppeld = new Set(item.combinaties.map((c) => c.houderId))
      return items.houders.filter(
        (h) => !gekoppeld.has(h.houderId) && (h.soortPlaat || '').replace(/\s+/g, '').toUpperCase() === type
      )
    }
    return []
  }, [item, items])

  return (
    <Modal title={titel || 'Gereedschap'} onClose={onClose} width={1040}>
      <div className="gs-detail">
        <div className="gs-detail-visual">
          <div className="gs-detail-podium">
            <Visual item={item} foto={foto} grootte={220} />
          </div>
          {item.tekenVorm && (
            <div className="gs-detail-vorm">
              <strong>{item.tekenVorm}</strong> {VORMEN[item.tekenVorm]?.naam || 'Vorm onbekend'}
            </div>
          )}
          {fotoNaam && <FotoKnoppen naam={fotoNaam} foto={foto} />}
        </div>

        <div className="gs-detail-info">
          <div className="gs-detail-kop">
            <span className="gs-soort-label">
              {item.type === 'combinatie' ? 'Combinatie' : item.type === 'houder' ? 'Houder' : 'Plaatje'}
            </span>
            {item.type !== 'houder' && item.fabrikant && <span className="badge badge-neutral">{item.fabrikant}</span>}
            {item.typeBewerking && <span className="badge badge-neutral">{item.typeBewerking}</span>}
          </div>

          <div className="gs-locaties gs-locaties-detail">
            {item.type !== 'houder' && <Locatie label="Plaatje ligt in" code={item.plaatLocatie} groot />}
            {item.type !== 'plaat' && <Locatie label="Houder ligt in" code={item.houderLocatie} groot />}
          </div>

          {item.type !== 'houder' && <CodeLint titel={`Plaatje ${item.plaat}`} iso={item.plaatIso} />}
          {item.type !== 'plaat' && <CodeLint titel={`Houder ${item.houder}`} iso={item.houderIso} />}

          <dl className="gs-gegevens">
            {item.type !== 'plaat' && (
              <>
                <dt>Houder</dt><dd>{item.houder || '—'}</dd>
                <dt>Omschrijving</dt><dd>{item.omschrijving || '—'}</dd>
                <dt>Plaattype</dt><dd>{item.soortPlaat || '—'}</dd>
                {item.houderArtikel && (<><dt>Artikel houder</dt><dd>{item.houderArtikel}</dd></>)}
              </>
            )}
            {item.type !== 'houder' && (
              <>
                <dt>Plaatje</dt><dd>{item.plaat || '—'}</dd>
                <dt>Hoekradius</dt><dd>{mm(item.hoekradius ?? item.plaatIso?.radius)}</dd>
                <dt>Dikte</dt><dd>{mm(item.dikte ?? item.plaatIso?.dikte, 2)}</dd>
                {item.plaatArtikel && (<><dt>Artikel Axapta</dt><dd>{item.plaatArtikel}</dd></>)}
              </>
            )}
          </dl>

          {(item.houderOpmerking || item.plaatOpmerking) && (
            <div className="banner banner-info">{[item.houderOpmerking, item.plaatOpmerking].filter(Boolean).join(' · ')}</div>
          )}

          {item.type === 'combinatie' && (
            <>
              <MiniLijst titel="Andere plaatjes op deze houder" items={anderePlaatjes} onOpen={onOpen} toon="plaat" />
              <MiniLijst titel="Andere houders voor dit plaatje" items={andereHouders} onOpen={onOpen} toon="houder" />
            </>
          )}
          {item.type === 'houder' && (
            <>
              <MiniLijst titel="Past op deze houder" items={item.combinaties} onOpen={onOpen} toon="plaat" />
              <MiniLijst
                titel={`Plaatjes van type ${item.soortPlaat}`}
                hint="Zelfde ISO-type, maar niet gekoppeld in Controlsys. Controleer de maat."
                items={opType}
                onOpen={onOpen}
                toon="plaat"
              />
            </>
          )}
          {item.type === 'plaat' && (
            <>
              <MiniLijst titel="Past in" items={item.combinaties} onOpen={onOpen} toon="houder" />
              <MiniLijst
                titel={`Houders voor type ${(item.plaat || '').slice(0, 4).toUpperCase()}`}
                hint="Zelfde ISO-type, maar niet gekoppeld in Controlsys. Controleer de maat."
                items={opType}
                onOpen={onOpen}
                toon="houder"
              />
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}

export default function GereedschappenOverzicht() {
  const { data, loading, error } = useCollection('gereedschappen')
  const { data: fotoDocs } = useCollection('gereedschapFotos')
  const [sync, setSync] = useState(null)
  const [params, setParams] = useSearchParams()
  const [max, setMax] = useState(MAX_KAARTEN)
  const zoekVeld = useRef(null)

  const zoek = params.get('q') || ''
  const soort = params.get('soort') || 'combinatie'
  const vorm = params.get('vorm') || ''
  const fabrikant = params.get('fabrikant') || ''
  const radius = params.get('radius') || ''
  const sorteer = params.get('sorteer') || 'naam'
  const weergave = params.get('weergave') || 'kaarten'
  const openId = params.get('id') || ''

  function zet(wijziging, { geschiedenis = false } = {}) {
    const volgende = new URLSearchParams(params)
    for (const [sleutel, waarde] of Object.entries(wijziging)) {
      if (waarde) volgende.set(sleutel, waarde)
      else volgende.delete(sleutel)
    }
    setParams(volgende, { replace: !geschiedenis })
  }

  useEffect(() => {
    return onSnapshot(
      doc(db, 'gereedschapSync', 'controlsys'),
      (snap) => setSync(snap.exists() ? snap.data() : null),
      () => setSync(null)
    )
  }, [])

  useEffect(() => {
    function toets(e) {
      const tag = document.activeElement?.tagName
      if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
        e.preventDefault()
        zoekVeld.current?.focus()
      }
    }
    window.addEventListener('keydown', toets)
    return () => window.removeEventListener('keydown', toets)
  }, [])

  useEffect(() => setMax(MAX_KAARTEN), [zoek, soort, vorm, fabrikant, radius, sorteer])

  const items = useMemo(() => bouwItems(data), [data])
  const fotos = useMemo(() => new Map(fotoDocs.map((f) => [f.id, f])), [fotoDocs])
  const termen = useMemo(() => woorden(zoek), [zoek])

  const bron = soort === 'houder' ? items.houders : soort === 'plaat' ? items.plaatjes : items.combinaties

  const zonderVorm = useMemo(
    () =>
      bron.filter((item) => {
        if (fabrikant && item.fabrikant !== fabrikant) return false
        if (radius && String(item.hoekradius ?? item.plaatIso?.radius) !== radius) return false
        return termen.every((t) => item.zoek.includes(t))
      }),
    [bron, fabrikant, radius, termen]
  )

  const vormTellers = useMemo(() => {
    const tellers = new Map()
    for (const item of bron) {
      if (item.tekenVorm && VORMEN[item.tekenVorm]) tellers.set(item.tekenVorm, 0)
    }
    for (const item of zonderVorm) {
      if (tellers.has(item.tekenVorm)) tellers.set(item.tekenVorm, tellers.get(item.tekenVorm) + 1)
    }
    return [...tellers.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [bron, zonderVorm])

  const fabrikanten = useMemo(
    () => [...new Set(bron.map((g) => g.fabrikant).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'nl')),
    [bron]
  )
  const radii = useMemo(
    () => [...new Set(bron.map((g) => g.hoekradius ?? g.plaatIso?.radius).filter((r) => r || r === 0))].sort((a, b) => a - b),
    [bron]
  )

  const locaties = useMemo(() => {
    const set = new Set()
    for (const g of data) {
      if (g.plaatLocatie) set.add(g.plaatLocatie)
      if (g.houderLocatie) set.add(g.houderLocatie)
    }
    return set.size
  }, [data])

  const lijst = useMemo(() => {
    const gefilterd = zonderVorm.filter((item) => !vorm || item.tekenVorm === vorm)
    const naam = (item) => (soort === 'houder' ? item.houder : item.plaat) || ''
    const locatie = (item) => (soort === 'houder' ? item.houderLocatie : item.plaatLocatie)
    const opNaam = (a, b) =>
      (naam(a) ? 0 : 1) - (naam(b) ? 0 : 1) || naam(a).localeCompare(naam(b), 'nl', { numeric: true })
    return gefilterd.sort((a, b) =>
      sorteer === 'locatie' ? vergelijkLocatie(locatie(a), locatie(b)) || opNaam(a, b) : opNaam(a, b)
    )
  }, [zonderVorm, vorm, sorteer, soort])

  const filtersActief = Boolean(zoek || vorm || fabrikant || radius)
  const geopend = openId ? items.perId.get(openId) : null
  const fotoVan = (item) => fotos.get(plaatSleutel(item.type === 'houder' ? item.houder : item.plaat))

  return (
    <div className="content gs-pagina">
      <div className="gs-hero">
        <div className="gs-hero-tekst">
          <div className="gs-hero-label">Controlsys · draaigereedschap</div>
          <h1>Gereedschappen</h1>
          <p>Vind een houder of wisselplaat, zie waar hij ligt en wat erbij past.</p>
          <div className="gs-sync">
            <span className={`gs-sync-stip${sync?.laatsteSync ? '' : ' gs-sync-stip-uit'}`} />
            {sync?.laatsteSync
              ? `Bijgewerkt ${formatDateTime(sync.laatsteSync)}`
              : 'Nog niet gesynchroniseerd'}
          </div>
        </div>
        <div className="gs-hero-tekening" aria-hidden="true">
          <PlaatTekening vorm="W" radius={0.8} grootte={150} />
          <PlaatTekening vorm="C" radius={0.4} grootte={104} />
          <PlaatTekening vorm="D" radius={0.8} grootte={84} />
        </div>
      </div>

      <div className="gs-tegels">
        {SOORTEN.map((s) => {
          const aantal = s.id === 'houder' ? items.houders.length : s.id === 'plaat' ? items.plaatjes.length : items.combinaties.length
          return (
            <button
              key={s.id}
              type="button"
              className={`gs-tegel${soort === s.id ? ' actief' : ''}`}
              onClick={() => zet({ soort: s.id === 'combinatie' ? '' : s.id, vorm: '', fabrikant: '', radius: '' })}
            >
              <span className="gs-tegel-waarde">{loading ? '…' : formatNumber(aantal)}</span>
              <span className="gs-tegel-label">{s.label}</span>
            </button>
          )
        })}
        <div className="gs-tegel gs-tegel-stil">
          <span className="gs-tegel-waarde">{loading ? '…' : formatNumber(locaties)}</span>
          <span className="gs-tegel-label">Locaties</span>
        </div>
      </div>

      <div className="card gs-filters">
        <div className="gs-zoekbalk">
          <svg className="gs-zoek-icoon" viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="8.5" cy="8.5" r="5.5" />
            <path d="M13 13l4.5 4.5" />
          </svg>
          <input
            ref={zoekVeld}
            type="text"
            className="gs-zoek"
            placeholder="Zoek op plaatje, houder, locatie of fabrikant…"
            value={zoek}
            onChange={(e) => zet({ q: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Escape') zet({ q: '' })
            }}
          />
          {zoek ? (
            <button type="button" className="gs-zoek-wis" onClick={() => zet({ q: '' })} aria-label="Zoekterm wissen">
              ✕
            </button>
          ) : (
            <kbd className="gs-kbd">/</kbd>
          )}
        </div>

        {vormTellers.length > 0 && (
          <div className="gs-vormen">
            <button type="button" className={`gs-vorm-chip${vorm ? '' : ' actief'}`} onClick={() => zet({ vorm: '' })}>
              Alle vormen
            </button>
            {vormTellers.map(([code, aantal]) => (
              <button
                key={code}
                type="button"
                className={`gs-vorm-chip${vorm === code ? ' actief' : ''}${aantal === 0 && vorm !== code ? ' gs-vorm-chip-leeg' : ''}`}
                onClick={() => zet({ vorm: vorm === code ? '' : code })}
                title={VORMEN[code]?.naam}
              >
                <PlaatTekening vorm={code} radius={0.4} grootte={22} stil />
                <strong>{code}</strong>
                <span className="gs-vorm-naam">{VORMEN[code]?.naam}</span>
                <span className="gs-teller">{aantal}</span>
              </button>
            ))}
          </div>
        )}

        <div className="gs-filterrij">
          {soort !== 'houder' && (
            <select value={fabrikant} onChange={(e) => zet({ fabrikant: e.target.value })} aria-label="Fabrikant">
              <option value="">Alle fabrikanten</option>
              {fabrikanten.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          )}
          {soort !== 'houder' && (
            <select value={radius} onChange={(e) => zet({ radius: e.target.value })} aria-label="Hoekradius">
              <option value="">Alle hoekradii</option>
              {radii.map((r) => <option key={r} value={String(r)}>r {formatNumber(r, 1)} mm</option>)}
            </select>
          )}
          <select value={sorteer} onChange={(e) => zet({ sorteer: e.target.value === 'naam' ? '' : e.target.value })} aria-label="Sorteren">
            <option value="naam">Sorteer op naam</option>
            <option value="locatie">Sorteer op locatie</option>
          </select>
          <div className="gs-filterrij-rechts">
            {filtersActief && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => zet({ q: '', vorm: '', fabrikant: '', radius: '' })}>
                Filters wissen
              </button>
            )}
            <div className="gs-weergave" role="group" aria-label="Weergave">
              <button type="button" className={weergave === 'kaarten' ? 'actief' : ''} onClick={() => zet({ weergave: '' })}>
                Kaarten
              </button>
              <button type="button" className={weergave === 'lijst' ? 'actief' : ''} onClick={() => zet({ weergave: 'lijst' })}>
                Lijst
              </button>
            </div>
          </div>
        </div>
      </div>

      {error && <div className="banner banner-danger">{error}</div>}

      <div className="gs-resultaat-kop">
        <strong>{formatNumber(lijst.length)}</strong>{' '}
        {lijst.length === 1 ? 'resultaat' : 'resultaten'}
        {filtersActief && <span className="hint"> van {formatNumber(bron.length)}</span>}
      </div>

      {loading ? (
        <div className="gs-raster">
          {Array.from({ length: 8 }, (_, i) => <div key={i} className="gs-kaart gs-skelet" />)}
        </div>
      ) : data.length === 0 ? (
        <div className="card empty-state">
          Nog geen gereedschap in Firebase. De nachtelijke sync op de Pi vult deze pagina.
        </div>
      ) : lijst.length === 0 ? (
        <div className="card empty-state gs-leeg">
          <PlaatTekening vorm="V" radius={0.2} grootte={64} stil />
          <div>Niets gevonden voor deze zoekopdracht.</div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => zet({ q: '', vorm: '', fabrikant: '', radius: '' })}>
            Filters wissen
          </button>
        </div>
      ) : weergave === 'lijst' ? (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table className="data-table gs-tabel">
            <thead>
              <tr>
                <th style={{ width: 44 }} />
                <th>{soort === 'houder' ? 'Houder' : 'Plaatje'}</th>
                <th>{soort === 'houder' ? 'Omschrijving' : 'Fabrikant'}</th>
                {soort !== 'houder' && <th>Locatie plaatje</th>}
                {soort !== 'plaat' && <th>{soort === 'houder' ? 'Locatie' : 'Houder'}</th>}
                {soort === 'combinatie' && <th>Locatie houder</th>}
                {soort !== 'houder' && <th className="num">Radius</th>}
                {soort !== 'houder' && <th className="num">Dikte</th>}
                {soort === 'houder' && <th>Plaattype</th>}
                {soort === 'houder' && <th>Past op deze houder</th>}
              </tr>
            </thead>
            <tbody>
              {lijst.map((item) => (
                <tr key={item.id} onClick={() => zet({ id: item.id }, { geschiedenis: true })}>
                  <td>
                    <PlaatTekening
                      vorm={item.tekenVorm}
                      radius={item.hoekradius ?? item.plaatIso?.radius}
                      metGat={item.metGat}
                      grootte={28}
                      stil
                    />
                  </td>
                  <td className="gs-tabel-naam">
                    <Markeer tekst={soort === 'houder' ? item.houder : item.plaat} termen={termen} />
                  </td>
                  <td><Markeer tekst={(soort === 'houder' ? item.omschrijving : item.fabrikant) || '—'} termen={termen} /></td>
                  {soort !== 'houder' && <td><span className="gs-pil">{item.plaatLocatie || '—'}</span></td>}
                  {soort === 'houder' && <td><span className="gs-pil">{item.houderLocatie || '—'}</span></td>}
                  {soort === 'combinatie' && <td><Markeer tekst={item.houder} termen={termen} /></td>}
                  {soort === 'combinatie' && <td><span className="gs-pil">{item.houderLocatie || '—'}</span></td>}
                  {soort !== 'houder' && <td className="num">{mm(item.hoekradius ?? item.plaatIso?.radius)}</td>}
                  {soort !== 'houder' && <td className="num">{mm(item.dikte ?? item.plaatIso?.dikte, 2)}</td>}
                  {soort === 'houder' && <td>{item.soortPlaat || '—'}</td>}
                  {soort === 'houder' && (
                    <td>
                      {item.combinaties.length === 0 ? (
                        <span className="gs-tabel-leeg">geen</span>
                      ) : (
                        <span className="gs-tabel-plaatjes">
                          {item.combinaties.map((c) => (
                            <span key={c.id} className="gs-pil">
                              <Markeer tekst={c.plaat || 'Onbekend'} termen={termen} />
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className="gs-raster">
            {lijst.slice(0, max).map((item) => (
              <Kaart
                key={item.id}
                item={item}
                foto={fotoVan(item)}
                termen={termen}
                onOpen={(id) => zet({ id }, { geschiedenis: true })}
              />
            ))}
          </div>
          {lijst.length > max && (
            <div className="gs-meer">
              <button type="button" className="btn btn-secondary" onClick={() => setMax((m) => m + MAX_KAARTEN)}>
                Toon meer ({formatNumber(lijst.length - max)} over)
              </button>
            </div>
          )}
        </>
      )}

      {geopend && (
        <Detail
          key={geopend.id}
          item={geopend}
          items={items}
          fotos={fotos}
          onOpen={(id) => zet({ id }, { geschiedenis: true })}
          onClose={() => zet({ id: '' })}
        />
      )}
    </div>
  )
}

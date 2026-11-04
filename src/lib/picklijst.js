import { collection, documentId, getDoc, getDocs, doc, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { laadLooproute, sorteerPicksOpLooproute } from './looproute'
import { laadPickrapport } from './pickrapport'
import { laadVerkooporderVoorAfdruk } from './verkooporders'

// Firestore staat max. 30 waarden per 'in'-query toe.
async function haalOpIn(collectie, veld, waarden) {
  const uniek = [...new Set(waarden.filter(Boolean))]
  const docs = []
  for (let i = 0; i < uniek.length; i += 30) {
    const snap = await getDocs(query(collection(db, collectie), where(veld, 'in', uniek.slice(i, i + 30))))
    docs.push(...snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  }
  return docs
}

// Vervangende artikelen: voor een A-artikel mag het BON-artikel met hetzelfde
// nummer gepakt worden als het A-artikel niet (genoeg) op voorraad is
// (A104 15-15 -> BON104 15-15, A108a 1/2-15 -> BON108A 1/2-15). Het BON-artikel
// wordt dan omgeboekt naar het A-artikel (zie boekOmboekingen in lib/voorraad.js)
// en als A-artikel geleverd.
export function vervangendeNummers(artikelnummer) {
  const m = /^A(.+)$/i.exec(String(artikelnummer || '').trim())
  if (!m) return []
  const rest = m[1]
  const [eerste, ...overig] = rest.split(' ')
  return [...new Set([`BON${rest}`, `BON${rest.toUpperCase()}`, `BON${[eerste.toUpperCase(), ...overig].join(' ')}`])]
}

async function verdeelOverVoorraad(openRegels) {
  const kandidaten = openRegels.flatMap((r) => vervangendeNummers(r.artikelnummer))
  const vervangers = await haalOpIn('artikelen', 'artikelnummer', kandidaten)
  const vervangerVan = {}
  for (const r of openRegels) {
    const nummers = vervangendeNummers(r.artikelnummer)
    const v = vervangers.find((a) => nummers.includes(a.artikelnummer) && !a.geblokkeerd)
    if (v) vervangerVan[r.id] = v
  }

  const standen = (
    await haalOpIn('voorraadstanden', 'artikelId', [
      ...openRegels.map((r) => r.artikelId),
      ...Object.values(vervangerVan).map((v) => v.id),
    ])
  ).filter((s) => Number(s.aantal) > 0)

  const locatieDocs = await haalOpIn(
    'locaties',
    documentId(),
    standen.map((s) => s.locatieId)
  )
  const locatiesById = Object.fromEntries(locatieDocs.map((l) => [l.id, l]))

  // Voorraad per artikel+locatie die nog vrij is (één artikel kan op twee regels staan).
  const vrij = Object.fromEntries(standen.map((s) => [s.id, Number(s.aantal)]))
  const picks = []
  const tekorten = []

  for (const r of openRegels) {
    let nodig = r.nogTeLeveren
    const v = vervangerVan[r.id]
    const plekken = [
      ...standen.filter((s) => s.artikelId === r.artikelId).sort((a, b) => vrij[b.id] - vrij[a.id]),
      ...(v ? standen.filter((s) => s.artikelId === v.id).sort((a, b) => vrij[b.id] - vrij[a.id]) : []),
    ]
    for (const s of plekken) {
      if (nodig <= 0) break
      const pak = Math.min(nodig, vrij[s.id])
      if (pak <= 0) continue
      vrij[s.id] -= pak
      nodig -= pak
      const isVervanger = v && s.artikelId === v.id
      picks.push({
        sleutel: `${r.id}-${s.id}`,
        regelId: r.id,
        regelnummer: r.regelnummer,
        orderId: r.orderId || '',
        ordernummer: r.ordernummer || '',
        artikelId: s.artikelId,
        artikelnummer: isVervanger ? v.artikelnummer : r.artikelnummer,
        artikelnaam: isVervanger ? v.naam : r.artikelnaam,
        vervangt: isVervanger ? r.artikelnummer : '',
        omboekenNaarId: isVervanger ? r.artikelId : '',
        locatieId: s.locatieId,
        klantArtikelnummer: r.klantArtikelnummer || '',
        eenheid: r.eenheid,
        // Locatiecode altijd uit `locaties` (niet uit een eventueel verkeerde
        // kopie op de voorraadstand), zodat de picklijst nooit een aantal toont.
        locatieCode: locatiesById[s.locatieId]?.code || s.locatieCode || '',
        sorteercode: Number(locatiesById[s.locatieId]?.sorteercode) || 0,
        aantal: pak,
        voorraadOpLocatie: Number(s.aantal),
        opLocatie: Number(s.aantal), // alias voor bestaande order-picklijst
      })
    }
    if (nodig > 0) {
      tekorten.push({
        regelId: r.id,
        regelnummer: r.regelnummer,
        orderId: r.orderId || '',
        ordernummer: r.ordernummer || '',
        artikelnummer: r.artikelnummer,
        artikelnaam: r.artikelnaam,
        eenheid: r.eenheid,
        nodig: r.nogTeLeveren,
        tekort: nodig,
        vervanger: v?.artikelnummer || '',
      })
    }
  }

  const looproute = await laadLooproute()
  const gesorteerd = sorteerPicksOpLooproute(picks, {
    locatiesById,
    afstanden: looproute.afstanden,
    startZone: looproute.startZone,
  })

  return { picks: gesorteerd, tekorten, locatiesById, looproute }
}

// Zelfde artikel op dezelfde locatie (uit meerdere orders) samenvoegen tot één
// pickregel, met de betrokken ordernummers erbij.
function voegPicksSamen(picks) {
  const map = new Map()
  for (const p of picks) {
    const key = [p.locatieId, p.artikelId, p.omboekenNaarId || '', p.vervangt || ''].join('__')
    const bestaand = map.get(key)
    if (!bestaand) {
      map.set(key, {
        ...p,
        sleutel: key,
        ordernummers: p.ordernummer ? [p.ordernummer] : [],
        regelIds: p.regelId ? [p.regelId] : [],
        verdeling: [verdelingStuk(p)],
      })
      continue
    }
    bestaand.aantal += p.aantal
    voegVerdelingToe(bestaand.verdeling, verdelingStuk(p))
    if (p.ordernummer && !bestaand.ordernummers.includes(p.ordernummer)) {
      bestaand.ordernummers.push(p.ordernummer)
    }
    if (p.regelId && !bestaand.regelIds.includes(p.regelId)) bestaand.regelIds.push(p.regelId)
    bestaand.opLocatie = Math.max(Number(bestaand.opLocatie) || 0, Number(p.opLocatie) || 0)
    bestaand.voorraadOpLocatie = Math.max(
      Number(bestaand.voorraadOpLocatie) || 0,
      Number(p.voorraadOpLocatie) || 0
    )
  }
  return [...map.values()]
}

function verdelingStuk(p) {
  return {
    orderId: p.orderId || '',
    ordernummer: p.ordernummer || '',
    regelId: p.regelId || '',
    regelnummer: p.regelnummer ?? '',
    aantal: Number(p.aantal) || 0,
  }
}

function voegVerdelingToe(lijst, stuk) {
  if (!stuk.aantal) return
  const zelfde = lijst.find((v) => v.regelId && v.regelId === stuk.regelId)
  if (zelfde) zelfde.aantal += stuk.aantal
  else lijst.push({ ...stuk })
}

// Stelt de picklijst van een verkooporder samen: per orderregel wat nog
// geleverd moet worden, verdeeld over de locaties waar het artikel ligt
// (grootste voorraad eerst). Gesorteerd op looproute (afstandsmatrix of sorteercode).
export async function maakPicklijst(verkooporderId) {
  const gegevens = await laadVerkooporderVoorAfdruk(verkooporderId)
  const open = gegevens.regels
    .map((r) => ({
      ...r,
      orderId: gegevens.order.id,
      ordernummer: gegevens.order.ordernummer,
      nogTeLeveren: Math.max(0, (Number(r.aantal) || 0) - (Number(r.geleverd) || 0)),
    }))
    .filter((r) => r.nogTeLeveren > 0)

  const { picks, tekorten } = await verdeelOverVoorraad(open)
  return { ...gegevens, picks, tekorten, openRegels: open.length }
}

// Alle open regels van één klant (over meerdere verkooporders) in één picklijst,
// op looproute. Zelfde artikel+locatie wordt samengevoegd.
export async function maakPicklijstPerKlant(klantId) {
  if (!klantId) throw new Error('Geen klant gekozen.')

  const klantSnap = await getDoc(doc(db, 'klanten', klantId))
  if (!klantSnap.exists()) throw new Error('Klant niet gevonden.')
  const klant = { id: klantSnap.id, ...klantSnap.data() }

  const ordersSnap = await getDocs(query(collection(db, 'verkooporders'), where('klantId', '==', klantId)))
  const orders = ordersSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((o) => o.status !== 'geannuleerd' && o.status !== 'geleverd')

  if (orders.length === 0) {
    return {
      klant,
      orders: [],
      picks: [],
      tekorten: [],
      openRegels: 0,
      openOrders: 0,
    }
  }

  const regels = await haalOpIn(
    'verkooporderregels',
    'verkooporderId',
    orders.map((o) => o.id)
  )
  const orderById = Object.fromEntries(orders.map((o) => [o.id, o]))

  const open = regels
    .map((r) => {
      const order = orderById[r.verkooporderId]
      return {
        ...r,
        orderId: order?.id || r.verkooporderId,
        ordernummer: order?.ordernummer || '',
        nogTeLeveren: Math.max(0, (Number(r.aantal) || 0) - (Number(r.geleverd) || 0)),
      }
    })
    .filter((r) => r.nogTeLeveren > 0 && orderById[r.verkooporderId])

  const { picks: ruwePicks, tekorten } = await verdeelOverVoorraad(open)
  const picks = voegPicksSamen(ruwePicks)

  // Na samenvoegen opnieuw op looproute (volgorde blijft via locatieId).
  const looproute = await laadLooproute()
  const locatieIds = [...new Set(picks.map((p) => p.locatieId))]
  const locatieDocs = await haalOpIn('locaties', documentId(), locatieIds)
  const locatiesById = Object.fromEntries(locatieDocs.map((l) => [l.id, l]))
  const gesorteerd = sorteerPicksOpLooproute(picks, {
    locatiesById,
    afstanden: looproute.afstanden,
    startZone: looproute.startZone,
  })

  return {
    klant,
    orders: orders
      .filter((o) => open.some((r) => r.orderId === o.id))
      .sort((a, b) => String(a.ordernummer).localeCompare(String(b.ordernummer), 'nl', { numeric: true })),
    picks: gesorteerd,
    tekorten,
    openRegels: open.length,
    openOrders: orders.filter((o) => open.some((r) => r.orderId === o.id)).length,
  }
}

function sorteerInpaklijnen(lijnen) {
  return [...lijnen].sort((a, b) => {
    const order = String(a.ordernummer).localeCompare(String(b.ordernummer), 'nl', { numeric: true })
    if (order !== 0) return order
    return (Number(a.regelnummer) || 0) - (Number(b.regelnummer) || 0)
  })
}

// Nieuwe pickrapporten bewaren per orderregel hoeveel er gepickt is.
function lijnenUitVerdeling(gepickt) {
  const map = new Map()
  for (const regel of gepickt) {
    const stukken = Array.isArray(regel.verdeling) ? regel.verdeling : []
    for (const stuk of stukken) {
      const aantal = Number(stuk.aantal) || 0
      if (aantal <= 0) continue
      const sleutel = `${stuk.regelId || stuk.orderId || stuk.ordernummer}-${regel.artikelnummer || ''}`
      const bestaand = map.get(sleutel)
      if (bestaand) {
        bestaand.aantal += aantal
        continue
      }
      map.set(sleutel, {
        sleutel,
        regelId: stuk.regelId || '',
        regelnummer: stuk.regelnummer ?? '',
        orderId: stuk.orderId || '',
        ordernummer: stuk.ordernummer || '',
        artikelnummer: regel.artikelnummer || '',
        artikelnaam: regel.artikelnaam || '',
        eenheid: regel.eenheid || '',
        aantal,
      })
    }
  }
  return sorteerInpaklijnen([...map.values()])
}

// Oudere rapporten hebben geen verdeling. Dan het gepickte aantal verdelen
// over de open orderregels, nooit meer dan er gepickt is.
async function lijnenUitOudRapport(klantId, gepickt) {
  const ordersSnap = await getDocs(query(collection(db, 'verkooporders'), where('klantId', '==', klantId)))
  const orders = ordersSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((o) => o.status !== 'geannuleerd' && o.status !== 'geleverd')
  if (orders.length === 0) return []

  const regels = await haalOpIn(
    'verkooporderregels',
    'verkooporderId',
    orders.map((o) => o.id)
  )
  const orderById = Object.fromEntries(orders.map((o) => [o.id, o]))
  const open = regels
    .map((r) => {
      const order = orderById[r.verkooporderId]
      const nog = Math.max(0, (Number(r.aantal) || 0) - (Number(r.geleverd) || 0))
      if (!order || nog <= 0) return null
      return {
        id: r.id,
        regelnummer: r.regelnummer ?? '',
        orderId: order.id,
        ordernummer: order.ordernummer || '',
        artikelnummer: r.artikelnummer || '',
        artikelnaam: r.artikelnaam || r.omschrijving || '',
        eenheid: r.eenheid || '',
        nog,
      }
    })
    .filter(Boolean)
    .sort((a, b) => String(a.ordernummer).localeCompare(String(b.ordernummer), 'nl', { numeric: true }))

  const resterend = new Map()
  for (const regel of gepickt) {
    const nummer = regel.artikelnummer || ''
    if (!nummer) continue
    resterend.set(nummer, (resterend.get(nummer) || 0) + (Number(regel.aantal) || 0))
  }

  const lijnen = []
  for (const regel of open) {
    let gepicktNummer = ''
    if ((resterend.get(regel.artikelnummer) || 0) > 0) gepicktNummer = regel.artikelnummer
    else {
      const vervanger = gepickt.find(
        (p) => p.vervangt === regel.artikelnummer && (resterend.get(p.artikelnummer) || 0) > 0
      )
      if (vervanger) gepicktNummer = vervanger.artikelnummer
    }
    if (!gepicktNummer) continue
    const pak = Math.min(regel.nog, resterend.get(gepicktNummer) || 0)
    if (pak <= 0) continue
    resterend.set(gepicktNummer, (resterend.get(gepicktNummer) || 0) - pak)
    const bron = gepickt.find((p) => p.artikelnummer === gepicktNummer)
    lijnen.push({
      sleutel: `${regel.id}-${gepicktNummer}`,
      regelId: regel.id,
      regelnummer: regel.regelnummer,
      orderId: regel.orderId,
      ordernummer: regel.ordernummer,
      artikelnummer: gepicktNummer,
      artikelnaam: bron?.artikelnaam || regel.artikelnaam,
      eenheid: regel.eenheid || bron?.eenheid || '',
      aantal: pak,
    })
  }
  return lijnen
}

// Alleen wat er gepickt is, per orderregel. Niet-gepickte regels komen er niet op.
export async function maakInpaklijst(klantId) {
  if (!klantId) throw new Error('Geen klant gekozen.')

  const klantSnap = await getDoc(doc(db, 'klanten', klantId))
  if (!klantSnap.exists()) throw new Error('Klant niet gevonden.')
  const klant = { id: klantSnap.id, ...klantSnap.data() }

  const rapport = await laadPickrapport(klantId)
  const gepickt = (rapport?.regels || []).filter((r) => (Number(r.aantal) || 0) > 0)
  if (gepickt.length === 0) {
    return { klant, orders: [], lijnen: [], zonderPick: true }
  }

  const heeftVerdeling = gepickt.some((r) => Array.isArray(r.verdeling) && r.verdeling.length > 0)
  const lijnen = heeftVerdeling ? lijnenUitVerdeling(gepickt) : await lijnenUitOudRapport(klantId, gepickt)

  const orders = []
  const gezien = new Set()
  for (const lijn of lijnen) {
    if (!lijn.orderId || gezien.has(lijn.orderId)) continue
    gezien.add(lijn.orderId)
    orders.push({ id: lijn.orderId, ordernummer: lijn.ordernummer })
  }

  return { klant, orders, lijnen, zonderPick: false, gepicktOp: rapport.gepicktOp || '' }
}

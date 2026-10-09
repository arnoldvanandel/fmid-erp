import { collection, documentId, getDocs, query, where } from 'firebase/firestore'
import { db } from '../firebase'
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

// Stelt de picklijst van een verkooporder samen: per orderregel wat nog
// geleverd moet worden, verdeeld over de locaties waar het artikel ligt
// (grootste voorraad eerst, zodat er zo min mogelijk plekken nodig zijn).
// De picks staan op looproute: de sorteercode van de locatie uit Axapta.
// Wat niet op voorraad is, komt bij `tekorten`. Er wordt niets geboekt.
export async function maakPicklijst(verkooporderId) {
  const gegevens = await laadVerkooporderVoorAfdruk(verkooporderId)
  const open = gegevens.regels
    .map((r) => ({ ...r, nogTeLeveren: Math.max(0, (Number(r.aantal) || 0) - (Number(r.geleverd) || 0)) }))
    .filter((r) => r.nogTeLeveren > 0)

  const standen = (await haalOpIn('voorraadstanden', 'artikelId', open.map((r) => r.artikelId))).filter(
    (s) => Number(s.aantal) > 0
  )
  const locaties = Object.fromEntries(
    (await haalOpIn('locaties', documentId(), standen.map((s) => s.locatieId))).map((l) => [l.id, l])
  )

  // Voorraad per artikel+locatie die nog vrij is (één artikel kan op twee regels staan).
  const vrij = Object.fromEntries(standen.map((s) => [s.id, Number(s.aantal)]))
  const picks = []
  const tekorten = []

  for (const r of open) {
    let nodig = r.nogTeLeveren
    const plekken = standen
      .filter((s) => s.artikelId === r.artikelId)
      .sort((a, b) => vrij[b.id] - vrij[a.id])
    for (const s of plekken) {
      if (nodig <= 0) break
      const pak = Math.min(nodig, vrij[s.id])
      if (pak <= 0) continue
      vrij[s.id] -= pak
      nodig -= pak
      picks.push({
        sleutel: `${r.id}-${s.id}`,
        regelnummer: r.regelnummer,
        artikelnummer: r.artikelnummer,
        artikelnaam: r.artikelnaam,
        klantArtikelnummer: r.klantArtikelnummer || '',
        eenheid: r.eenheid,
        locatieCode: s.locatieCode,
        sorteercode: Number(locaties[s.locatieId]?.sorteercode) || 0,
        aantal: pak,
        opLocatie: Number(s.aantal),
      })
    }
    if (nodig > 0) {
      tekorten.push({
        regelnummer: r.regelnummer,
        artikelnummer: r.artikelnummer,
        artikelnaam: r.artikelnaam,
        eenheid: r.eenheid,
        nodig: r.nogTeLeveren,
        tekort: nodig,
      })
    }
  }

  // Looproute: sorteercode, en zonder sorteercode (0) op locatiecode achteraan.
  picks.sort(
    (a, b) =>
      (a.sorteercode || Infinity) - (b.sorteercode || Infinity) ||
      String(a.locatieCode).localeCompare(String(b.locatieCode), 'nl', { numeric: true })
  )

  return { ...gegevens, picks, tekorten, openRegels: open.length }
}

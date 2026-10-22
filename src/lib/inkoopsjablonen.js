import { addDoc, collection, deleteDoc, doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { haalArtikelenOp } from './artikelZoeken'
import { inkoopprijsPerEenheid } from './staffel'
import { maakInkooporder, voegInkooporderRegelToe } from './inkooporders'

// Inkoopsjablonen: een vaste inkooporder (leverancier + regels) die je steeds
// opnieuw bestelt. Een sjabloon is één document in `inkoopsjablonen`; de
// regels staan er als array in (een sjabloon heeft er hooguit enkele tientallen).
// Uit een sjabloon maak je met één klik een nieuwe concept-inkooporder.

// Alleen de velden die bij een volgende bestelling weer hetzelfde zijn.
function sjabloonRegel(r) {
  return {
    artikelId: r.artikelId,
    artikelnummer: r.artikelnummer || '',
    artikelnaam: r.artikelnaam || '',
    eenheid: r.eenheid || '',
    aantal: Number(r.aantal) || 0,
    // Prijs ter informatie; bij het aanmaken van een order geldt de actuele prijs.
    prijs: Number(r.prijs) || 0,
    leverancierArtikelnummer: r.leverancierArtikelnummer || '',
  }
}

export function nieuweSjabloonRegel(artikel, aantal, leverancierArtikelnummer = '') {
  return sjabloonRegel({
    artikelId: artikel.id,
    artikelnummer: artikel.artikelnummer,
    artikelnaam: artikel.naam,
    eenheid: artikel.eenheid,
    aantal,
    prijs: inkoopprijsPerEenheid(artikel, aantal),
    leverancierArtikelnummer,
  })
}

// "Opslaan als sjabloon" bij een inkooporder: kop + regels overnemen.
export async function maakSjabloonVanInkooporder({ naam, inkooporder, regels, gebruiker }) {
  const n = String(naam || '').trim()
  if (!n) throw new Error('Geef het sjabloon een naam.')
  if (!regels?.length) throw new Error('De inkooporder heeft nog geen regels.')
  const sjabloon = {
    naam: n,
    leverancierId: inkooporder.leverancierId,
    leverancierscode: inkooporder.leverancierscode || '',
    leverancierNaam: inkooporder.leverancierNaam || '',
    referentie: inkooporder.referentie || '',
    levering: inkooporder.levering || '',
    opmerkingen: inkooporder.opmerkingen || '',
    regels: [...regels]
      .sort((a, b) => (Number(a.regelnummer) || 0) - (Number(b.regelnummer) || 0))
      .map(sjabloonRegel),
    bronOrdernummer: inkooporder.ordernummer || '',
    aangemaaktDoor: gebruiker || '',
    datum: serverTimestamp(),
  }
  const ref = await addDoc(collection(db, 'inkoopsjablonen'), sjabloon)
  return { ...sjabloon, id: ref.id }
}

export async function wijzigSjabloon(sjabloonId, updates, gebruiker) {
  if (updates.naam !== undefined && !String(updates.naam).trim()) {
    throw new Error('Geef het sjabloon een naam.')
  }
  const data = { ...updates, gewijzigdDoor: gebruiker || '', gewijzigdOp: serverTimestamp() }
  if (updates.regels) data.regels = updates.regels.map(sjabloonRegel)
  await updateDoc(doc(db, 'inkoopsjablonen', sjabloonId), data)
}

export async function verwijderSjabloon(sjabloonId) {
  await deleteDoc(doc(db, 'inkoopsjablonen', sjabloonId))
}

// Maakt een nieuwe concept-inkooporder uit een sjabloon. Leverancier en
// artikelen worden opnieuw opgehaald, zodat de order de actuele gegevens
// krijgt: de prijs komt uit de inkoopprijs/inkoopstaffel van het artikel, net
// als bij het handmatig toevoegen van een regel. Alleen als het artikel geen
// inkoopprijs heeft, valt de prijs terug op die uit het sjabloon. Artikelen
// die niet meer bestaan worden overgeslagen en teruggemeld.
export async function maakInkooporderUitSjabloon({ sjabloon, gebruiker, gebruikerEmail }) {
  const levSnap = await getDoc(doc(db, 'leveranciers', sjabloon.leverancierId))
  if (!levSnap.exists()) throw new Error(`Leverancier ${sjabloon.leverancierscode} bestaat niet meer.`)
  const leverancier = { id: levSnap.id, ...levSnap.data() }

  const regels = sjabloon.regels || []
  const artikelen = await haalArtikelenOp(regels.map((r) => r.artikelId))

  const order = await maakInkooporder({ leverancier, gebruiker, gebruikerEmail })
  // Kopvelden uit het sjabloon gaan voor de standaardwaarden van de leverancier.
  const kop = {}
  for (const veld of ['referentie', 'levering', 'opmerkingen']) {
    if (sjabloon[veld]) kop[veld] = sjabloon[veld]
  }
  if (Object.keys(kop).length) {
    await updateDoc(doc(db, 'inkooporders', order.id), kop)
    Object.assign(order, kop)
  }

  const overgeslagen = []
  const toevoegen = []
  for (const r of regels) {
    const artikel = artikelen[r.artikelId]
    if (!artikel) {
      overgeslagen.push(r.artikelnummer)
      continue
    }
    const actueel = inkoopprijsPerEenheid(artikel, r.aantal)
    toevoegen.push({
      artikel,
      aantal: r.aantal,
      prijs: actueel > 0 ? actueel : Number(r.prijs) || 0,
      leverancierArtikelnummer: r.leverancierArtikelnummer,
    })
  }
  // Regelnummers 10, 20, 30… in de volgorde van het sjabloon.
  await Promise.all(
    toevoegen.map((r, i) => voegInkooporderRegelToe({ inkooporder: order, ...r, hoogsteRegelnummer: i * 10 }))
  )

  return { order, overgeslagen }
}

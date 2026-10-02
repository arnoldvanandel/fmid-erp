import { addDoc, collection, deleteDoc, doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'

// Eén stuklijstregel = één component (met aantal) van een artikel met
// artikeltype "Stuklijst". Net als bij voorraadmutaties/artikeldocumenten een
// platte top-level collectie met een verwijzing naar het bovenliggende
// artikel, zodat we 'm client-side kunnen filteren zonder extra index.
export async function voegStuklijstRegelToe({ stuklijstArtikel, componentArtikel, aantal }) {
  if (!stuklijstArtikel?.id) throw new Error('Geen stuklijst-artikel gekozen.')
  if (!componentArtikel?.id) throw new Error('Geen component gekozen.')
  if (componentArtikel.id === stuklijstArtikel.id) {
    throw new Error('Een stuklijst kan zichzelf niet als component bevatten.')
  }
  const n = Number(aantal)
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error('Aantal moet een positief getal zijn.')
  }

  await addDoc(collection(db, 'stuklijstregels'), {
    stuklijstArtikelId: stuklijstArtikel.id,
    stuklijstArtikelnummer: stuklijstArtikel.artikelnummer || '',
    componentArtikelId: componentArtikel.id,
    componentArtikelnummer: componentArtikel.artikelnummer || '',
    componentNaam: componentArtikel.naam || '',
    componentEenheid: componentArtikel.eenheid || '',
    aantal: n,
  })
}

export async function wijzigStuklijstRegelAantal(regelId, aantal) {
  const n = Number(aantal)
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error('Aantal moet een positief getal zijn.')
  }
  await updateDoc(doc(db, 'stuklijstregels', regelId), { aantal: n })
}

export async function verwijderStuklijstRegel(regelId) {
  await deleteDoc(doc(db, 'stuklijstregels', regelId))
}

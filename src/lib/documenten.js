import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
} from 'firebase/storage'
import { addDoc, collection, deleteDoc, doc, serverTimestamp } from 'firebase/firestore'
import { db, storage } from '../firebase'

const MAX_BYTES = 25 * 1024 * 1024

// Uploadt één PDF naar Storage (onder artikelen/{artikelId}/...) en legt de
// metadata vast in `artikeldocumenten`, zodat we 'm net als voorraadmutaties
// realtime per artikel kunnen tonen zonder aparte query/index nodig te hebben.
export async function uploadArtikelDocument({ artikel, file, gebruiker }) {
  if (!storage) {
    throw new Error(
      'Cloud Storage is nog niet ingeschakeld voor dit Firebase-project. ' +
        'Zie README.md ("Cloud Storage inschakelen") om dit eenmalig te doen.'
    )
  }
  if (!artikel?.id) throw new Error('Geen artikel gekozen.')
  if (!file) throw new Error('Geen bestand gekozen.')
  if (file.type !== 'application/pdf') {
    throw new Error('Alleen PDF-bestanden zijn toegestaan.')
  }
  if (file.size > MAX_BYTES) {
    throw new Error('Bestand is te groot (max 25 MB).')
  }

  const storagePath = `artikelen/${artikel.id}/${Date.now()}-${file.name}`
  const storageRef = ref(storage, storagePath)
  await uploadBytes(storageRef, file, { contentType: 'application/pdf' })
  const url = await getDownloadURL(storageRef)

  await addDoc(collection(db, 'artikeldocumenten'), {
    artikelId: artikel.id,
    artikelnummer: artikel.artikelnummer || '',
    bestandsnaam: file.name,
    storagePath,
    url,
    grootte: file.size,
    geuploadDoor: gebruiker || '',
    datum: serverTimestamp(),
  })
}

export async function verwijderArtikelDocument(documentItem) {
  if (!storage) throw new Error('Cloud Storage is niet beschikbaar.')
  if (!documentItem?.id) throw new Error('Document niet gevonden.')
  await deleteObject(ref(storage, documentItem.storagePath))
  await deleteDoc(doc(db, 'artikeldocumenten', documentItem.id))
}

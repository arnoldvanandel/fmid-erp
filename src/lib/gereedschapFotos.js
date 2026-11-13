import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db, storage } from '../firebase'
import { plaatSleutel } from './wisselplaat'

const MAX_BYTES = 5 * 1024 * 1024
const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

// Eén foto per plaatje of houder, op naam (zoals WNMG080408_HCX1125). Staat
// apart van `gereedschappen`, omdat de nachtelijke sync die collectie overschrijft.
export async function uploadGereedschapFoto({ naam, file, gebruiker }) {
  if (!storage) throw new Error('Cloud Storage is niet beschikbaar.')
  const sleutel = plaatSleutel(naam)
  if (!sleutel) throw new Error('Geen naam om de foto aan te koppelen.')
  if (!file) throw new Error('Geen bestand gekozen.')
  if (!TYPES.includes(file.type)) throw new Error('Kies een foto (JPG, PNG, WebP of GIF).')
  if (file.size > MAX_BYTES) throw new Error('Foto is te groot (max 5 MB).')

  const extensie = file.type.split('/')[1].replace('jpeg', 'jpg')
  const storagePath = `gereedschap/${sleutel}/${Date.now()}.${extensie}`
  const opslag = ref(storage, storagePath)
  await uploadBytes(opslag, file, { contentType: file.type })
  const url = await getDownloadURL(opslag)
  await setDoc(doc(db, 'gereedschapFotos', sleutel), {
    naam: String(naam).trim(),
    url,
    storagePath,
    geuploadDoor: gebruiker || '',
    datum: serverTimestamp(),
  })
  return url
}

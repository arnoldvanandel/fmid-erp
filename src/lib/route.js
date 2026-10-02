import { addDoc, collection, deleteDoc, doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'

// Eén routeregel = één bewerking (met volgnummer, bewerkingscentrum,
// insteltijd en tijd) van een artikel met artikeltype "Stuklijst". Zelfde
// patroon als stuklijstregels: platte top-level collectie met een
// verwijzing naar het bovenliggende artikel, zodat we 'm client-side kunnen
// filteren zonder extra index.
export async function voegRouteRegelToe({ artikel, volgnummer, bewerking, bewerkingscentrum, insteltijd, tijd }) {
  if (!artikel?.id) throw new Error('Geen artikel gekozen.')
  const v = Number(volgnummer)
  if (!Number.isFinite(v) || v <= 0) {
    throw new Error('Volgnummer moet een positief getal zijn.')
  }
  if (!bewerkingscentrum?.trim()) {
    throw new Error('Bewerkingscentrum is verplicht.')
  }
  const s = insteltijd === '' || insteltijd === undefined ? 0 : Number(insteltijd)
  if (!Number.isFinite(s) || s < 0) {
    throw new Error('Insteltijd moet een getal van 0 of hoger zijn.')
  }
  const t = Number(tijd)
  if (!Number.isFinite(t) || t <= 0) {
    throw new Error('Tijd moet een positief getal zijn.')
  }

  await addDoc(collection(db, 'routeregels'), {
    artikelId: artikel.id,
    artikelnummer: artikel.artikelnummer || '',
    volgnummer: v,
    bewerking: bewerking?.trim() || '',
    bewerkingscentrum: bewerkingscentrum.trim(),
    insteltijd: s,
    tijd: t,
  })
}

export async function wijzigRouteRegel(regelId, velden) {
  const payload = {}
  if (velden.volgnummer !== undefined) {
    const v = Number(velden.volgnummer)
    if (!Number.isFinite(v) || v <= 0) throw new Error('Volgnummer moet een positief getal zijn.')
    payload.volgnummer = v
  }
  if (velden.bewerking !== undefined) {
    payload.bewerking = velden.bewerking?.trim() || ''
  }
  if (velden.bewerkingscentrum !== undefined) {
    if (!velden.bewerkingscentrum?.trim()) throw new Error('Bewerkingscentrum is verplicht.')
    payload.bewerkingscentrum = velden.bewerkingscentrum.trim()
  }
  if (velden.insteltijd !== undefined) {
    const s = Number(velden.insteltijd)
    if (!Number.isFinite(s) || s < 0) throw new Error('Insteltijd moet een getal van 0 of hoger zijn.')
    payload.insteltijd = s
  }
  if (velden.tijd !== undefined) {
    const t = Number(velden.tijd)
    if (!Number.isFinite(t) || t <= 0) throw new Error('Tijd moet een positief getal zijn.')
    payload.tijd = t
  }
  await updateDoc(doc(db, 'routeregels', regelId), payload)
}

export async function verwijderRouteRegel(regelId) {
  await deleteDoc(doc(db, 'routeregels', regelId))
}

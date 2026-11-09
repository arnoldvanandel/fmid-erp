import { collection, doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'

const OPEN = 'ontvangst-sessie'
const lokaalSleutel = (id) => `ontvangstrapport-${id}`

function nieuwId() {
  return doc(collection(db, 'ontvangstrapporten')).id
}

export function leesOpenSessieId() {
  try {
    return sessionStorage.getItem(OPEN) || ''
  } catch {
    return ''
  }
}

function zetOpenSessie(id) {
  try {
    if (id) sessionStorage.setItem(OPEN, id)
    else sessionStorage.removeItem(OPEN)
  } catch {
    // Opslag kan geblokkeerd zijn; Firestore blijft de kopie.
  }
}

function leesLokaal(id) {
  try {
    const raw = sessionStorage.getItem(lokaalSleutel(id))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function schrijfLokaal(rapport) {
  try {
    sessionStorage.setItem(lokaalSleutel(rapport.id), JSON.stringify(rapport))
  } catch {
    // Firestore is de kopie voor de pc.
  }
}

async function bewaar(rapport) {
  schrijfLokaal(rapport)
  await setDoc(doc(db, 'ontvangstrapporten', rapport.id), rapport)
}

function regelVoorRapport(regel) {
  return {
    artikelnummer: regel.artikelnummer || '',
    artikelnaam: regel.artikelnaam || '',
    aantal: Number(regel.aantal) || 0,
    eenheid: regel.eenheid || '',
    locatieCode: regel.locatieCode || '',
    ordernummer: regel.ordernummer || '',
    leverancier: regel.leverancier || '',
    geboektOp: regel.geboektOp || new Date().toISOString(),
  }
}

// Eén keer boeken op de pc is meteen een eigen, afgesloten rapport.
export async function maakOntvangstrapport(regels, gebruiker) {
  const nu = new Date().toISOString()
  const rapport = {
    id: nieuwId(),
    gestartOp: nu,
    afgeslotenOp: nu,
    gebruiker: gebruiker || '',
    regels: (regels || []).filter((r) => Number(r.aantal) > 0).map(regelVoorRapport),
  }
  if (!rapport.regels.length) return null
  await bewaar(rapport)
  return rapport
}

// Eén inboeksessie op de telefoon. De volgende keer opnieuw inboeken wordt een nieuw rapport.
export async function voegOntvangstregelToe(regel, gebruiker) {
  let id = leesOpenSessieId()
  let rapport = id ? leesLokaal(id) : null
  if (id && !rapport) {
    try {
      const snap = await getDoc(doc(db, 'ontvangstrapporten', id))
      if (snap.exists()) rapport = { id: snap.id, ...snap.data() }
    } catch {
      rapport = null
    }
  }
  if (!rapport || rapport.afgeslotenOp) {
    id = nieuwId()
    rapport = {
      id,
      gestartOp: new Date().toISOString(),
      afgeslotenOp: '',
      gebruiker: gebruiker || '',
      regels: [],
    }
    zetOpenSessie(id)
  }
  rapport.gebruiker = gebruiker || rapport.gebruiker || ''
  rapport.regels = [...(rapport.regels || []), regelVoorRapport(regel)]
  await bewaar(rapport)
  return rapport
}

export async function sluitOntvangstsessie() {
  const id = leesOpenSessieId()
  if (!id) return null
  let rapport = leesLokaal(id)
  if (!rapport) {
    try {
      const snap = await getDoc(doc(db, 'ontvangstrapporten', id))
      if (snap.exists()) rapport = { id: snap.id, ...snap.data() }
    } catch {
      rapport = null
    }
  }
  zetOpenSessie('')
  if (!rapport || rapport.afgeslotenOp) return rapport
  if (!(rapport.regels || []).length) return rapport
  rapport.afgeslotenOp = new Date().toISOString()
  await bewaar(rapport)
  return rapport
}

export async function laadOntvangstrapport(id) {
  let opgeslagen = null
  try {
    const snap = await getDoc(doc(db, 'ontvangstrapporten', id))
    if (snap.exists()) opgeslagen = { id: snap.id, ...snap.data() }
  } catch {
    opgeslagen = null
  }
  const lokaal = leesLokaal(id)
  if (!opgeslagen) return lokaal
  if (!lokaal) return opgeslagen
  const lokaalAantal = (lokaal.regels || []).length
  const opgeslagenAantal = (opgeslagen.regels || []).length
  return lokaalAantal >= opgeslagenAantal ? lokaal : opgeslagen
}

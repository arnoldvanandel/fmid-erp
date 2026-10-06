import { useEffect, useMemo, useState } from 'react'
import {
  collection,
  documentId,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore'
import { db } from '../firebase'

// Met ~17.000 artikelen (Axapta-import) halen we nooit meer de hele collectie
// op: dat is traag en kost per keer 17.000 Firestore-reads. In plaats daarvan
// krijgt elk artikel een veld `zoek` met zoektermen (begin van elk woord uit
// artikelnummer en naam), waarop met één array-contains-query gezocht wordt.

const MAX_TERM = 20

function woorden(tekst) {
  return String(tekst || '')
    .toLowerCase()
    .split(/[\s,;:()/\\+*"'[\]{}]+|(?<=\D)\.|\.(?=\D)/)
    .flatMap((w) => [w, ...w.split('-')])
    .map((w) => w.trim())
    .filter(Boolean)
}

function voorvoegsels(woord) {
  const w = woord.slice(0, MAX_TERM)
  const lijst = []
  for (let i = 1; i <= w.length; i++) lijst.push(w.slice(0, i))
  return lijst
}

// Zoektermen voor het veld `zoek` van een artikel.
export function zoekTermen({ artikelnummer, naam, zoeknaam }) {
  const termen = new Set()
  const nummer = String(artikelnummer || '').toLowerCase().trim()
  for (const t of voorvoegsels(nummer)) termen.add(t)
  for (const w of [...woorden(artikelnummer), ...woorden(naam), ...woorden(zoeknaam)]) {
    for (const t of voorvoegsels(w)) termen.add(t)
  }
  return [...termen]
}

// Zoekt artikelen op (een deel van) artikelnummer of naam. Zonder zoekterm:
// de eerste `max` artikelen op artikelnummer.
export async function zoekArtikelen(term, { max = 50, filter } = {}) {
  const ref = collection(db, 'artikelen')
  const zoekwoorden = [...new Set(woorden(term))].map((w) => w.slice(0, MAX_TERM))
  const heleTerm = String(term || '').toLowerCase().trim().slice(0, MAX_TERM)

  let docs
  if (zoekwoorden.length === 0) {
    docs = (await getDocs(query(ref, orderBy('artikelnummer'), limit(max)))).docs
  } else {
    // Zoek op het langste woord (meest specifiek) en filter de rest hier.
    const sleutel = zoekwoorden.includes(heleTerm)
      ? heleTerm
      : [...zoekwoorden].sort((a, b) => b.length - a.length)[0]
    docs = (await getDocs(query(ref, where('zoek', 'array-contains', sleutel), limit(400)))).docs
  }

  let artikelen = docs.map((d) => ({ id: d.id, ...d.data() }))
  if (zoekwoorden.length > 1) {
    artikelen = artikelen.filter((a) => {
      const z = new Set(a.zoek || [])
      return z.has(heleTerm) || zoekwoorden.every((w) => z.has(w))
    })
  }
  if (filter) artikelen = artikelen.filter(filter)
  return artikelen
    .sort((a, b) => String(a.artikelnummer).localeCompare(String(b.artikelnummer), 'nl'))
    .slice(0, max)
}

// Eén artikel op exact artikelnummer.
export async function haalArtikelOpNummer(artikelnummer) {
  const nr = String(artikelnummer || '').trim()
  if (!nr) return null
  const snap = await getDocs(query(collection(db, 'artikelen'), where('artikelnummer', '==', nr), limit(1)))
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() }
}

// Artikelen op id (Firestore staat max. 30 ids per 'in'-query toe).
export async function haalArtikelenOp(ids) {
  const uniek = [...new Set(ids.filter(Boolean))]
  const resultaat = {}
  for (let i = 0; i < uniek.length; i += 30) {
    const deel = uniek.slice(i, i + 30)
    const snap = await getDocs(query(collection(db, 'artikelen'), where(documentId(), 'in', deel)))
    for (const d of snap.docs) resultaat[d.id] = { id: d.id, ...d.data() }
  }
  return resultaat
}

export async function telArtikelen() {
  return (await getCountFromServer(collection(db, 'artikelen'))).data().count
}

// React-hook: zoekresultaten bij een zoekterm, met een korte vertraging
// zodat er niet bij elke toetsaanslag een query gaat.
export function useArtikelZoeken(term, { max = 50, filter, ververs = 0 } = {}) {
  const [artikelen, setArtikelen] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let actief = true
    setLoading(true)
    const timer = setTimeout(() => {
      zoekArtikelen(term, { max, filter })
        .then((lijst) => {
          if (!actief) return
          setArtikelen(lijst)
          setError(null)
        })
        .catch((err) => actief && setError(err.message))
        .finally(() => actief && setLoading(false))
    }, 250)
    return () => {
      actief = false
      clearTimeout(timer)
    }
    // filter is een functie; bewust niet als afhankelijkheid (zou elke render opnieuw zoeken)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, max, ververs])

  return { artikelen, loading, error }
}

// React-hook: artikelen bij een lijst ids (bijv. componenten van een stuklijst).
export function useArtikelenOpId(ids) {
  const sleutel = useMemo(() => [...new Set(ids.filter(Boolean))].sort().join(','), [ids])
  const [artikelenById, setArtikelenById] = useState({})

  useEffect(() => {
    let actief = true
    if (!sleutel) {
      setArtikelenById({})
      return undefined
    }
    haalArtikelenOp(sleutel.split(','))
      .then((map) => actief && setArtikelenById(map))
      .catch(() => actief && setArtikelenById({}))
    return () => {
      actief = false
    }
  }, [sleutel])

  return artikelenById
}

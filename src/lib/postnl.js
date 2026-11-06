import { getFunctions, httpsCallable } from 'firebase/functions'
import { doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { app, db } from '../firebase'

// Adressen uit het oude labelprogramma (C:\Snelstart\Label software\adres.json).
// Straat van Wasco Deventer stond daar als "Rigatsraat"; dat is Rigastraat.
export const STANDAARD_ADRESSEN = [
  { id: 'installatiebalie', titel: 'Installatiebalie', naam: 'Installatiebalie B.V.', straat: 'Pannenweg', huisnummer: '223-223', plaats: 'Nederweert', postcode: '6031RK' },
  { id: 'bonfix', titel: 'Bonfix', naam: 'Bonfix B.V.', straat: 'Holsteinstraat', huisnummer: '4', plaats: 'Zwolle', postcode: '8028RT' },
  { id: 'slaats', titel: 'Slaats', naam: 'Slaats B.V.', straat: 'Kruisstraat', huisnummer: '13', plaats: 'Meijel', postcode: '5768RW' },
  { id: 'vsh', titel: 'Vsh', naam: 'Vsh DC Zeewolde B.V.', straat: 'Productieweg', huisnummer: '9', plaats: 'Zeewolde', postcode: '3899AK' },
  { id: 'wasco-leigraaf', titel: 'Wasco Leigraaf', naam: 'Wasco DC Kleinmateriaal', straat: 'Leigraaf', huisnummer: '54', plaats: 'Twello', postcode: '7391AL' },
  { id: 'wasco-rigastraat', titel: 'Wasco Rigastraat', naam: 'Wasco DC Kleinmateriaal', straat: 'Rigastraat', huisnummer: '17', plaats: 'Deventer', postcode: '7418EW' },
  { id: 'itb-boxmeer', titel: 'ITB Boxmeer', naam: 'I.T.B. Boxmeer B.V.', straat: 'Lionstraat', huisnummer: '10', plaats: 'Boxmeer', postcode: '5831AK' },
  { id: 'betherma', titel: 'Betherma', naam: 'Betherma Nederland B.V.', straat: 'Etruskenweg', huisnummer: '9', plaats: 'Oss', postcode: '5349AZ' },
  { id: 'thermo-trade', titel: 'Thermo trade', naam: 'Thermo trade', straat: 'Molenstraat', huisnummer: '33', plaats: 'Geleen', postcode: '6161CT' },
  { id: 'watson-marlow', titel: 'Watson Marlow Bredel', naam: 'Watson Marlow Bredel B.V.', straat: 'Kade', huisnummer: '3', plaats: 'Delden', postcode: '7491EZ' },
  { id: 'de-jong', titel: 'De Jong Hot Water Tanks', naam: 'De Jong hot water tanks', straat: 'Leitsweg', huisnummer: '4', plaats: 'Gorredijk', postcode: '8401CL' },
  { id: 'loa', titel: 'LOA', naam: 'LOA Aldor2', straat: 'Wetering', huisnummer: '21', plaats: 'Weert', postcode: '6002SM' },
  { id: 'tubeworkx', titel: 'Tubeworkx', naam: 'Tubeworkx B.V.', straat: 'Bedrijvenpark Twente Noord', huisnummer: '54', plaats: 'Almelo', postcode: '7602KS' },
  { id: 'aalberts', titel: 'Aalberts', naam: 'AIPS warehouse', straat: 'Productieweg', huisnummer: '9', plaats: 'Zeewolde', postcode: '3899AK' },
  { id: 'qtis', titel: 'QTIS BV', naam: 'QTIS B.V.', straat: 'Kubus', huisnummer: '200', plaats: 'Sliedrecht', postcode: '3364DG' },
  { id: 'cema', titel: 'Cema BV', naam: 'Cema BV', straat: 'Burgemeester Lemmensstraat', huisnummer: '216', plaats: 'Geleen', postcode: '6163JS' },
]

const functions = getFunctions(app, 'europe-west1')
const maakLabel = httpsCallable(functions, 'postnlLabel')

export function postcodeWeergave(postcode) {
  const s = String(postcode || '').replace(/\s+/g, '').toUpperCase()
  if (/^[0-9]{4}[A-Z]{2}$/.test(s)) return `${s.slice(0, 4)} ${s.slice(4)}`
  return String(postcode || '').trim()
}

export function isNederland(land) {
  const l = String(land || '').trim().toLowerCase()
  return !l || l === 'nl' || l === 'nederland' || l === 'netherlands' || l === 'the netherlands'
}

// "Burgemeester Lemmensstraat 216" -> straat + huisnummer. Lukt dat niet,
// dan blijft het huisnummer leeg en vult de gebruiker het zelf in.
export function splitsStraatHuisnummer(straat) {
  const tekst = String(straat || '').trim().replace(/\s+/g, ' ')
  const m = tekst.match(/^(.*\S)\s+(\d+[a-zA-Z]?(?:[/-]\d+[a-zA-Z]?)?)$/)
  if (!m) return { straat: tekst, huisnummer: '', huisnummerToevoeging: '' }
  return { straat: m[1], huisnummer: m[2], huisnummerToevoeging: '' }
}

export function adresRegel(adres) {
  const nr = [adres.huisnummer, adres.huisnummerToevoeging].filter(Boolean).join(' ')
  return `${adres.straat || ''} ${nr}`.trim()
}

// Eenmalig de adressen uit het oude programma wegschrijven. Bestaat `_meta`
// al, dan is dat gebeurd en laten we verwijderde tegels met rust.
export async function zaaiStandaardAdressen() {
  const metaRef = doc(db, 'postnlSnelkoppelingen', '_meta')
  const meta = await getDoc(metaRef)
  if (meta.exists()) return false
  const batch = writeBatch(db)
  STANDAARD_ADRESSEN.forEach((adres, index) => {
    batch.set(doc(db, 'postnlSnelkoppelingen', adres.id), {
      titel: adres.titel,
      naam: adres.naam,
      voornaam: '',
      straat: adres.straat,
      huisnummer: adres.huisnummer,
      huisnummerToevoeging: '',
      postcode: adres.postcode,
      plaats: adres.plaats,
      land: 'NL',
      volgorde: index,
      standaard: true,
      aangemaaktOp: serverTimestamp(),
    })
  })
  batch.set(metaRef, { soort: 'meta', gezaaid: true, aangemaaktOp: serverTimestamp() })
  await batch.commit()
  return true
}

export async function vraagPostnlLabel({ adres, aantal }) {
  const resultaat = await maakLabel({
    aantal,
    adres: {
      naam: adres.naam,
      voornaam: adres.voornaam || '',
      straat: adres.straat,
      huisnummer: adres.huisnummer,
      huisnummerToevoeging: adres.huisnummerToevoeging || '',
      postcode: adres.postcode,
      plaats: adres.plaats,
    },
  })
  return resultaat.data
}

export function pdfUitBase64(base64) {
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i)
  return URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
}

export function openPdf(url, { bestaand, naLaden } = {}) {
  const venster = bestaand && !bestaand.closed ? bestaand : window.open('', 'postnl-label')
  if (!venster) return null
  if (naLaden) venster.addEventListener('load', naLaden, { once: true })
  venster.location = url
  venster.focus()
  return venster
}

export function drukPdfAf(url) {
  const venster = openPdf(url, {
    naLaden: (event) => {
      event.currentTarget.focus()
      event.currentTarget.print()
    },
  })
  return !!venster
}

export function foutVanPostnl(err) {
  const code = err?.code || ''
  if (code === 'functions/not-found' || code === 'functions/unavailable') {
    return 'De PostNL-koppeling is nog niet actief op de server.'
  }
  if (code === 'functions/unauthenticated') return 'Log opnieuw in om een label te maken.'
  const bericht = String(err?.message || '').replace(/^FirebaseError:\s*/, '')
  return bericht || 'Label maken is mislukt.'
}

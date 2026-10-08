// Vult de lokale Firebase-emulators met testgegevens, om verkooporders,
// pakbonnen en facturen te testen zonder de echte data te raken.
//
//   npm run emulators        (terminal 1)
//   npm run seed:emulator    (terminal 2, eenmalig na het starten)
//   npm run dev:emulator     -> http://localhost:5174
//
// Inloggen met de testgebruiker hieronder. Alles is fictief en verdwijnt
// zodra de emulators stoppen.

const PROJECT = 'demo-fmid-erp'
const AUTH = 'http://127.0.0.1:9099'
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`

export const TESTGEBRUIKER = { email: 'test@fmid.test', wachtwoord: 'fmid-test-1234', naam: 'Test Gebruiker' }

// JS-waarde -> Firestore REST-waarde.
function waarde(v) {
  if (v === null || v === undefined) return { nullValue: null }
  if (typeof v === 'boolean') return { booleanValue: v }
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }
  if (typeof v === 'string') return { stringValue: v }
  if (v instanceof Date) return { timestampValue: v.toISOString() }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(waarde) } }
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, w]) => [k, waarde(w)])) } }
}

async function zet(pad, data) {
  const res = await fetch(`${FS}/${pad}`, {
    method: 'PATCH',
    // "owner" omzeilt de beveiligingsregels; werkt alleen in de emulator.
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, waarde(v)])) }),
  })
  if (!res.ok) throw new Error(`${pad}: ${res.status} ${await res.text()}`)
}

async function maakGebruiker() {
  const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TESTGEBRUIKER.email, password: TESTGEBRUIKER.wachtwoord, returnSecureToken: true }),
  })
  const json = await res.json()
  if (json.localId) return json.localId
  // Bestaat al: inloggen om de uid te krijgen.
  const login = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TESTGEBRUIKER.email, password: TESTGEBRUIKER.wachtwoord, returnSecureToken: true }),
  })
  return (await login.json()).localId
}

const uid = await maakGebruiker()
await zet(`users/${uid}`, { email: TESTGEBRUIKER.email, naam: TESTGEBRUIKER.naam, role: 'admin' })

const basisKlant = {
  zoeknaam: '',
  klantgroep: 'NL',
  telefoon: '',
  mobiel: '',
  fax: '',
  website: '',
  adresControleren: false,
  leveringsvoorwaarde: 'FH',
  leveringswijze: '',
  inclBtw: false,
  kvkNummer: '',
  geblokkeerd: false,
  valuta: 'EUR',
}

await zet('klanten/test-nl', {
  ...basisKlant,
  klantcode: '9001',
  naam: 'Testklant Nederland B.V.',
  contactpersoon: 'Jan de Vries',
  email: 'inkoop@testklant.test',
  orderbevestigingEmails: ['inkoop@testklant.test', 'planning@testklant.test'],
  factuurEmails: ['crediteuren@testklant.test'],
  straat: 'Teststraat 1',
  postcode: '1234 AB',
  plaats: 'Teststad',
  land: 'Nederland',
  btwGroep: 'NL',
  btwNummer: 'NL000000000B01',
  betalingstermijn: 30,
  taal: 'nl',
  adressen: [
    { type: 'levering', naam: 'Testklant Magazijn', straat: 'Magazijnweg 10', postcode: '5678 CD', plaats: 'Opslagdorp', land: 'Nederland', telefoon: '', email: '', adresControleren: false },
    { type: 'factuur', naam: 'Testklant Holding B.V.', straat: 'Postbus 99', postcode: '1234 ZZ', plaats: 'Teststad', land: 'Nederland', telefoon: '', email: '', adresControleren: false },
  ],
})

await zet('klanten/test-de', {
  ...basisKlant,
  klantgroep: 'EU',
  klantcode: '9002',
  naam: 'Testkunde GmbH',
  contactpersoon: 'Anna Schmidt',
  email: 'einkauf@testkunde.test',
  straat: 'Teststraße 5',
  postcode: 'D-12345',
  plaats: 'Teststadt',
  land: 'Duitsland',
  btwGroep: 'EU-IC',
  btwNummer: 'DE000000000',
  betalingstermijn: 14,
  taal: 'de',
  leveringsvoorwaarde: 'EXW',
  adressen: [],
})

const basisArtikel = {
  artikeltype: 'Artikel',
  artikelgroep: 'TEST',
  eenheid: 'Stuks',
  inkoopprijs: 1,
  inkoopprijsHoeveelheid: 1,
  verkoopprijsHoeveelheid: 1,
  btwGroep: 'Hoog',
  geblokkeerd: false,
  inkoopGeblokkeerd: false,
  verkoopGeblokkeerd: false,
}
// Vereenvoudigde versie van zoekTermen() uit src/lib/artikelZoeken.js.
function zoek(...teksten) {
  const termen = new Set()
  for (const w of teksten.join(' ').toLowerCase().split(/[\s-]+/).filter(Boolean)) {
    for (let i = 1; i <= Math.min(w.length, 20); i++) termen.add(w.slice(0, i))
  }
  const nummer = teksten[0].toLowerCase()
  for (let i = 1; i <= nummer.length; i++) termen.add(nummer.slice(0, i))
  return [...termen]
}

const artikelen = [
  { id: 'test-1', artikelnummer: 'TEST-001', naam: 'Testfitting 22 mm', verkoopprijs: 12.5 },
  { id: 'test-2', artikelnummer: 'TEST-002', naam: 'Testbocht 90 graden 28 mm', verkoopprijs: 412, verkoopprijsHoeveelheid: 100 },
]
for (const { id, ...a } of artikelen) {
  await zet(`artikelen/${id}`, { ...basisArtikel, ...a, zoeknaam: '', zoek: zoek(a.artikelnummer, a.naam) })
}

await zet('locaties/test-hfd', { code: 'HFD', naam: 'Hoofdmagazijn' })
for (const artikel of ['test-1', 'test-2']) {
  await zet(`voorraadstanden/${artikel}__test-hfd`, {
    artikelId: artikel,
    artikelnummer: artikel === 'test-1' ? 'TEST-001' : 'TEST-002',
    locatieId: 'test-hfd',
    locatieCode: 'HFD',
    aantal: 100,
  })
}

console.log(`Emulator gevuld. Inloggen als ${TESTGEBRUIKER.email} (wachtwoord in scripts/emulator-seed.mjs).`)

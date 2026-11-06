import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { logger } from 'firebase-functions'
import { PDFDocument } from 'pdf-lib'

// Zelfde PostNL-contract als het oude labelprogramma (live_versie.exe).
// De API-sleutel staat in Secret Manager:
//   firebase functions:secrets:set POSTNL_APIKEY
const POSTNL_APIKEY = defineSecret('POSTNL_APIKEY')
const POSTNL_KLANTCODE = 'DKCJ'
const POSTNL_KLANTNUMMER = '9966111'

const BARCODE_URL = 'https://api.postnl.nl/shipment/v1_1/barcode'
const ZENDING_URL = 'https://api.postnl.nl/v1/shipment'
const MAX_AANTAL = 20

function tekst(waarde, max) {
  return String(waarde ?? '').trim().slice(0, max)
}

function postcodeVan(waarde) {
  return tekst(waarde, 12).replace(/\s+/g, '').toUpperCase()
}

function tijdstempel(datum = new Date()) {
  const delen = new Intl.DateTimeFormat('nl-NL', {
    timeZone: 'Europe/Amsterdam',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(datum)
  const v = Object.fromEntries(delen.filter((d) => d.type !== 'literal').map((d) => [d.type, d.value]))
  return `${v.day}-${v.month}-${v.year} ${v.hour}:${v.minute}:${v.second}`
}

function postnlFout(json, tekstAntwoord) {
  const lijst = json?.Errors || json?.ResponseShipments?.[0]?.Errors || json?.ResponseShipments?.[0]?.Warnings
  if (Array.isArray(lijst) && lijst.length) {
    return lijst
      .map((e) => e.Description || e.ErrorMsg || e.Message || e.message)
      .filter(Boolean)
      .join('; ')
  }
  return json?.fault?.faultstring || tekstAntwoord.slice(0, 400) || 'PostNL gaf een fout terug.'
}

async function postnl(url, { method, headers, body }) {
  const res = await fetch(url, {
    method,
    headers,
    body,
    signal: AbortSignal.timeout(25000),
  })
  const tekstAntwoord = await res.text()
  let json = null
  try {
    json = tekstAntwoord ? JSON.parse(tekstAntwoord) : null
  } catch {
    json = null
  }
  if (!res.ok) {
    throw new HttpsError('failed-precondition', postnlFout(json, tekstAntwoord) || `PostNL antwoordde met ${res.status}.`)
  }
  return json || {}
}

async function haalBarcode(headers, klantcode, klantnummer) {
  const params = new URLSearchParams({
    CustomerCode: klantcode,
    CustomerNumber: klantnummer,
    Type: '3S',
    Serie: '000000000-999999999',
  })
  const json = await postnl(`${BARCODE_URL}?${params}`, { method: 'GET', headers })
  const barcode = json.Barcode
  if (!barcode) throw new HttpsError('failed-precondition', postnlFout(json, 'Geen barcode ontvangen.'))
  return barcode
}

function zendingBody({ barcode, adres, tijd, klantcode, klantnummer }) {
  return {
    Customer: {
      Address: {
        AddressType: '02',
        City: 'Dussen',
        CompanyName: 'FMI Dussen B.V.',
        Countrycode: 'NL',
        HouseNr: '5',
        Street: 'Loswal',
        Zipcode: '4271BA',
      },
      CollectionLocation: '100548',
      ContactPerson: 'van Andel',
      CustomerCode: klantcode,
      CustomerNumber: klantnummer,
      Email: 'info@fmid.nl',
      Name: 'Janssen',
    },
    Message: {
      MessageID: '1',
      MessageTimeStamp: tijd,
      Printertype: 'GraphicFile|PDF',
    },
    Shipments: {
      Addresses: [
        {
          AddressType: '01',
          City: adres.plaats,
          Countrycode: 'NL',
          FirstName: adres.voornaam,
          HouseNr: adres.huisnummer,
          HouseNrExt: adres.huisnummerToevoeging,
          Name: adres.naam,
          Street: adres.straat,
          Zipcode: adres.postcode,
        },
      ],
      Barcode: barcode,
      Contacts: [
        {
          ContactType: '01',
          Email: 'receiver@email.com',
          SMSNr: '+31612345678',
          TelNr: '+31301234567',
        },
      ],
      DeliveryAddress: '01',
      Dimension: { Weight: '2000' },
      ProductCodeDelivery: '3085',
    },
  }
}

async function haalLabelPdf(headers, body) {
  const json = await postnl(`${ZENDING_URL}?confirm=true`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  const zendingen = json.ResponseShipments
  const eerste = Array.isArray(zendingen) ? zendingen[0] : zendingen
  const content = eerste?.Labels?.[0]?.Content
  if (!content) throw new HttpsError('failed-precondition', postnlFout(json, 'Geen label ontvangen.'))
  const pdf = Buffer.from(content, 'base64')
  if (pdf.subarray(0, 4).toString() !== '%PDF') {
    throw new HttpsError('failed-precondition', 'PostNL stuurde geen PDF-label terug.')
  }
  return pdf
}

async function voegPdfsSamen(pdfs) {
  if (pdfs.length === 1) return pdfs[0]
  const samen = await PDFDocument.create()
  for (const pdf of pdfs) {
    const doc = await PDFDocument.load(pdf)
    const paginas = await samen.copyPages(doc, doc.getPageIndices())
    paginas.forEach((pagina) => samen.addPage(pagina))
  }
  return Buffer.from(await samen.save())
}

async function magLabelMaken(uid) {
  const snap = await getFirestore().doc(`users/${uid}`).get()
  const rol = snap.data()?.role
  return rol === 'invoer' || rol === 'admin'
}

export const postnlLabel = onCall(
  {
    region: 'europe-west1',
    invoker: 'public',
    secrets: [POSTNL_APIKEY],
    timeoutSeconds: 120,
    memory: '256MiB',
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Log in om een PostNL-label te maken.')
    }
    if (!(await magLabelMaken(request.auth.uid))) {
      throw new HttpsError('permission-denied', 'Geen rechten om een PostNL-label te maken.')
    }

    const data = request.data || {}
    const aantal = Math.min(MAX_AANTAL, Math.max(1, Math.floor(Number(data.aantal) || 1)))
    const bron = data.adres || {}
    const adres = {
      naam: tekst(bron.naam, 35),
      voornaam: tekst(bron.voornaam, 35),
      straat: tekst(bron.straat, 95),
      huisnummer: tekst(bron.huisnummer, 35),
      huisnummerToevoeging: tekst(bron.huisnummerToevoeging, 35),
      postcode: postcodeVan(bron.postcode),
      plaats: tekst(bron.plaats, 35),
    }
    if (!adres.naam || !adres.straat || !adres.huisnummer || !adres.postcode || !adres.plaats) {
      throw new HttpsError('invalid-argument', 'Naam, straat, huisnummer, postcode en plaats zijn verplicht.')
    }
    if (!/^[1-9][0-9]{3}[A-Z]{2}$/.test(adres.postcode)) {
      throw new HttpsError('invalid-argument', `Postcode ${adres.postcode} is geen Nederlandse postcode.`)
    }

    const sleutel = POSTNL_APIKEY.value()
    if (!sleutel) throw new HttpsError('failed-precondition', 'De PostNL-sleutel ontbreekt op de server.')
    const headers = {
      accept: 'application/json',
      'Content-Type': 'application/json',
      apikey: sleutel,
    }
    const klantcode = POSTNL_KLANTCODE
    const klantnummer = POSTNL_KLANTNUMMER
    const tijd = tijdstempel()

    try {
      const pdfs = []
      const barcodes = []
      for (let i = 0; i < aantal; i += 1) {
        const barcode = await haalBarcode(headers, klantcode, klantnummer)
        const body = zendingBody({ barcode, adres, tijd, klantcode, klantnummer })
        pdfs.push(await haalLabelPdf(headers, body))
        barcodes.push(barcode)
      }
      const pdf = await voegPdfsSamen(pdfs)
      logger.info('PostNL-label gemaakt', { uid: request.auth.uid, aantal, barcodes })
      return { pdfBase64: pdf.toString('base64'), barcodes }
    } catch (err) {
      if (err instanceof HttpsError) throw err
      logger.error('PostNL-label mislukt', { error: err.message })
      throw new HttpsError('internal', err.message || 'PostNL-label maken is mislukt.')
    }
  }
)

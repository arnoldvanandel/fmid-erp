import { formatNumber, formatPrijs } from './format'
import { T } from '../pages/inkooporders/InkooporderDocument'
import { NEDERLAND, eenheid, landRegel, leveringTekst } from '../pages/inkooporders/documentDelen'
import { BEDRIJF, datumKort, datumLang } from '../pages/inkooporders/bedrijf'

// RTF is 7-bit: backslash en accolades krijgen een backslash, alles boven
// ASCII wordt \uN? (16-bit, met teken).
function rtf(tekst) {
  let uit = ''
  const s = String(tekst ?? '')
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c === 92 || c === 123 || c === 125) uit += '\\' + s[i]
    else if (c === 10) uit += '\\line '
    else if (c < 32) continue
    else if (c < 128) uit += s[i]
    else uit += `\\u${c > 32767 ? c - 65536 : c}?`
  }
  return uit
}

const alinea = (tekst, { vet = false, klein = false, boven = 0 } = {}) =>
  `\\pard\\sb${boven}\\fs${klein ? 15 : 18}${vet ? '\\b' : ''} ${rtf(tekst)}${vet ? '\\b0' : ''}\\par\n`

// `samenvoegen` = [van, tot]: die cellen (inclusief) worden één cel, zodat een
// lange tekst niet in een smalle kolom afbreekt.
function tabelrij(cellen, breedtes, rechts, { vet = false, rand = false, samenvoegen } = {}) {
  let x = 0
  let uit = '\\trowd\\trgaph60\\trleft0'
  breedtes.forEach((b, i) => {
    x += b
    const merge = samenvoegen
      ? i === samenvoegen[0]
        ? '\\clmgf'
        : i > samenvoegen[0] && i <= samenvoegen[1]
          ? '\\clmrg'
          : ''
      : ''
    uit += `${merge}${rand ? '\\clbrdrb\\brdrs\\brdrw10' : ''}\\cellx${x}`
  })
  cellen.forEach((cel, i) => {
    uit += `\\pard\\intbl${rechts[i] ? '\\qr' : '\\ql'}\\fs16${vet ? '\\b' : ''} ${rtf(cel)}${vet ? '\\b0' : ''}\\cell`
  })
  return uit + '\\row\n'
}

// Zet de inkooporder om naar een RTF-document (base64), met dezelfde inhoud
// als de PDF (InkooporderDocument) maar zonder briefpapier en logo. Voor
// leveranciers die de order alleen als RTF kunnen ontvangen.
export function maakRtfBase64({ order, leverancier, regels }) {
  const taal = T[leverancier?.taal] ? leverancier.taal : 'nl'
  const t = T[taal]
  const bedrag = (r) => Math.round((Number(r.aantal) || 0) * (Number(r.prijs) || 0) * 100) / 100
  const totaal = regels.reduce((sum, r) => sum + bedrag(r), 0)
  const valuta = leverancier?.valuta || 'EUR'
  const termijn = leverancier?.betalingstermijn
  const contact = order.referentie || leverancier?.contactpersoon
  const plaatsregel = [leverancier?.postcode, leverancier?.plaats?.toUpperCase()].filter(Boolean).join(' ')

  const gegevens = [
    [t.besteldatum, datumLang(order.besteldatum)],
    [t.leverancier, order.leverancierscode],
    [t.offerte, order.offertenummer],
    [t.besteldDoor, [order.besteldDoor, order.besteldDoorEmail].filter(Boolean).join(' · ')],
    [t.valuta, valuta],
    [t.leverdatum, datumLang(order.verwachteLeverdatum)],
    [t.levering, leveringTekst(order.levering)],
    [t.betaling, termijn != null && termijn !== '' ? t.betalingTekst(termijn) : ''],
    [
      t.afleveradres,
      `${BEDRIJF.naam}, ${BEDRIJF.adres.slice(0, 2).join(', ').replace(/\s{2,}/g, ' ')}, ${NEDERLAND[taal]}`,
    ],
  ].filter(([, waarde]) => waarde)

  const breedtes = [600, 1500, 3000, 1200, 800, 600, 900, 1100, 1072]
  const rechts = [false, false, false, false, true, false, true, true, true]

  let doc =
    '{\\rtf1\\ansi\\ansicpg1252\\deff0\\deflang1043' +
    '{\\fonttbl{\\f0\\fswiss\\fcharset0 Arial;}}' +
    '\\paperw11906\\paperh16838\\margl567\\margr567\\margt567\\margb567\\f0\\fs18\n'

  doc += alinea(BEDRIJF.naam, { vet: true })
  for (const regel of BEDRIJF.adres.slice(0, 2)) doc += alinea(regel.replace(/\s{2,}/g, ' '))
  doc += alinea(`Tel. ${BEDRIJF.telefoon} · ${BEDRIJF.email} · ${BEDRIJF.website}`, { klein: true })

  doc += alinea(`${t.titel} ${order.ordernummer}`, { vet: true, boven: 360 })
  doc += alinea(datumLang(order.besteldatum))

  doc += alinea(leverancier?.naam || order.leverancierNaam, { vet: true, boven: 240 })
  if (contact) doc += alinea(`${t.tav} ${contact}`)
  if (leverancier?.straat) doc += alinea(leverancier.straat)
  if (plaatsregel) doc += alinea(plaatsregel)
  if (landRegel(leverancier?.land, taal)) doc += alinea(landRegel(leverancier?.land, taal))

  gegevens.forEach(([label, waarde], i) => {
    doc += alinea(`${label}: ${waarde}`, { boven: i === 0 ? 240 : 0 })
  })

  doc += '\\pard\\sb240\\par\n'
  doc += tabelrij(
    [t.pos, t.artikel, t.omschrijving, t.uwArtikel, t.aantal, t.eenheid, t.prijs, t.bedrag, t.leverdatumKort],
    breedtes,
    rechts,
    { vet: true, rand: true }
  )
  regels.forEach((r, i) => {
    doc += tabelrij(
      [
        r.regelnummer || (i + 1) * 10,
        r.artikelnummer,
        r.artikelnaam,
        r.leverancierArtikelnummer,
        formatNumber(r.aantal, Number.isInteger(Number(r.aantal)) ? 0 : 2),
        eenheid(r.eenheid, taal),
        formatPrijs(r.prijs),
        formatNumber(bedrag(r), 2),
        datumKort(r.leverdatum),
      ],
      breedtes,
      rechts
    )
  })
  doc += tabelrij(
    ['', t.regels(regels.length), '', '', t.totaal, '', '', `${valuta} ${formatNumber(totaal, 2)}`, ''],
    breedtes,
    [false, false, false, false, true, true, true, true, true],
    { vet: true, samenvoegen: [4, 6] }
  )

  if (order.opmerkingen) {
    doc += alinea(t.opmerkingen, { vet: true, boven: 240 })
    doc += alinea(order.opmerkingen)
  }
  doc += alinea(t.instructie(order.ordernummer), { boven: 240 })
  doc += alinea(`${t.correspondentie} ${order.leverancierscode} - ${order.ordernummer}`, { vet: true })
  doc += alinea(t.automatisch, { klein: true, boven: 120 })
  doc += '}'

  return btoa(doc)
}

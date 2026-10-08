import { LEVERINGSVOORWAARDEN } from '../../lib/stamgegevens'

// Onderdelen die alle documenten delen (inkooporder, orderbevestiging, pakbon,
// factuur). Opmaak: .doc-* in afdruk.css.

// Eenheden en ons land in de taal van de leverancier of klant.
const EENHEDEN = {
  de: { stuks: 'Stk.', meter: 'm', kg: 'kg', set: 'Satz' },
  en: { stuks: 'pcs', meter: 'm', kg: 'kg', set: 'set' },
}
export const NEDERLAND = { nl: 'Nederland', de: 'Niederlande', en: 'the Netherlands' }

// Landnamen staan bij klanten en leveranciers in het Nederlands; in het adres
// op een Duits of Engels document vertalen we de bekende landen.
const LANDEN = {
  duitsland: { de: 'Deutschland', en: 'Germany' },
  belgië: { de: 'Belgien', en: 'Belgium' },
  frankrijk: { de: 'Frankreich', en: 'France' },
  spanje: { de: 'Spanien', en: 'Spain' },
  italië: { de: 'Italien', en: 'Italy' },
  oostenrijk: { de: 'Österreich', en: 'Austria' },
  zwitserland: { de: 'Schweiz', en: 'Switzerland' },
  polen: { de: 'Polen', en: 'Poland' },
  tsjechië: { de: 'Tschechien', en: 'Czech Republic' },
  zweden: { de: 'Schweden', en: 'Sweden' },
  noorwegen: { de: 'Norwegen', en: 'Norway' },
  denemarken: { de: 'Dänemark', en: 'Denmark' },
  roemenië: { de: 'Rumänien', en: 'Romania' },
  'verenigd koninkrijk': { de: 'Vereinigtes Königreich', en: 'United Kingdom' },
}

export function landNaam(land, taal) {
  return LANDEN[String(land || '').trim().toLowerCase()]?.[taal] || land
}

// Land onder het adres, behalve bij Nederland.
export function landRegel(land, taal) {
  if (!land || /^(nederland|the netherlands)$/i.test(land)) return ''
  return landNaam(land, taal).toUpperCase()
}

export function eenheid(tekst, taal) {
  return EENHEDEN[taal]?.[String(tekst || '').toLowerCase()] || tekst
}

// "DAP" -> "DAP — Delivered at Place"; vrije tekst blijft zoals hij is.
export function leveringTekst(levering) {
  const code = String(levering || '').trim()
  return LEVERINGSVOORWAARDEN[code.toUpperCase()] ? `${code.toUpperCase()} — ${LEVERINGSVOORWAARDEN[code.toUpperCase()]}` : code
}

export function Veld({ label, children }) {
  return (
    <div className="doc-veld">
      <div className="doc-label">{label}</div>
      <div className="doc-waarde">{children || '—'}</div>
    </div>
  )
}

import { BEDRIJF } from './bedrijf'

// Het FMID-briefpapier (ontwerp "Brief_FMID_voorzijde"): logo linksboven,
// bedrijfsgegevens rechtsboven met blauwe labels, en onderaan een groene band
// met blauwe balk, de foto van de draaibank en de bankgegevens. De inhoud van
// het document komt ertussen. Maten en opmaak staan in afdruk.css (.brief-*).
function Gegevens({ className, regels }) {
  return (
    <div className={className}>
      {regels.map(([waarde, label], i) => (
        <div key={i} className="brief-regel">
          <span>{waarde}</span>
          <span className="brief-label">{label}</span>
        </div>
      ))}
    </div>
  )
}

export default function Briefpapier({ children }) {
  const kop = [
    [BEDRIJF.naam, 'Adres'],
    ...BEDRIJF.adres.map((r) => [r, '']),
    [BEDRIJF.telefoon, 'Tel'],
    [BEDRIJF.fax, 'Fax'],
    ['', ''],
    [BEDRIJF.email, 'Mail'],
    ['', ''],
    [BEDRIJF.website, 'Web'],
  ]
  const voet = [
    BEDRIJF.bank && [BEDRIJF.bank, 'Bank'],
    BEDRIJF.bic && [BEDRIJF.bic, 'BIC'],
    BEDRIJF.iban && [BEDRIJF.iban, 'IBAN'],
    BEDRIJF.kvkNummer && [BEDRIJF.kvkNummer, `KvK ${BEDRIJF.kvkPlaats}`.trim()],
    BEDRIJF.btwNummer && [BEDRIJF.btwNummer, 'BTWnr.'],
  ].filter(Boolean)

  return (
    <div className="afdruk-pagina">
      <img src="/fmid-logo.png" alt="FMID" className="brief-logo" />
      <Gegevens className="brief-gegevens" regels={kop} />

      {children}

      <img src="/briefpapier-voet.jpg" alt="" className="brief-voet-foto" />
      <div className="brief-voet-blauw" />
      <div className="brief-voet-groen" />
      <Gegevens className="brief-gegevens brief-bank" regels={voet} />
    </div>
  )
}

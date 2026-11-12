import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import PicklijstQrVenster from '../../components/PicklijstQrVenster'
import { useAuth } from '../../contexts/AuthContext'
import { formatDateTime, formatNumber } from '../../lib/format'
import { maakPicklijstPerKlant } from '../../lib/picklijst'
import { boekOmboekingen } from '../../lib/voorraad'
import { datumLang } from '../inkooporders/bedrijf'
import { Veld } from '../inkooporders/documentDelen'
import '../inkooporders/afdruk.css'

function aantal(v) {
  return formatNumber(v, Number.isInteger(Number(v)) ? 0 : 2)
}

// Gecombineerde picklijst per klant: alle open regels over orders heen,
// op looproute, met vakjes om af te vinken.
export default function KlantPicklijstAfdruk() {
  const { klantId } = useParams()
  const { profile } = useAuth()
  const [lijst, setLijst] = useState(null)
  const [error, setError] = useState(null)
  const [melding, setMelding] = useState(null)
  const [bezig, setBezig] = useState(false)
  const [ververs, setVervers] = useState(0)
  const [gemaaktOp, setGemaaktOp] = useState(() => new Date())
  const [qrOpen, setQrOpen] = useState(false)

  useEffect(() => {
    let actief = true
    setError(null)
    maakPicklijstPerKlant(klantId)
      .then((l) => {
        if (!actief) return
        setLijst(l)
        setGemaaktOp(new Date())
      })
      .catch((err) => actief && setError(err.message))
    return () => {
      actief = false
    }
  }, [klantId, ververs])

  async function handleOmboeken() {
    const omboek = lijst.picks.filter((p) => p.omboekenNaarId)
    const tekst = omboek
      .map((p) => `${p.aantal}× ${p.artikelnummer} → ${p.vervangt} (locatie ${p.locatieCode})`)
      .join('\n')
    if (!confirm(`Deze omboekingen boeken?\n\n${tekst}`)) return
    setBezig(true)
    setMelding(null)
    try {
      await boekOmboekingen({
        omboekingen: omboek.map((p) => ({
          vanArtikelId: p.artikelId,
          naarArtikelId: p.omboekenNaarId,
          locatieId: p.locatieId,
          aantal: p.aantal,
        })),
        bronNummer: `klant ${lijst.klant.klantcode}`,
        gebruiker: profile?.naam || profile?.email,
      })
      setMelding({ soort: 'info', tekst: `${omboek.length} omboeking(en) geboekt. De picklijst is bijgewerkt.` })
      setVervers((v) => v + 1)
    } catch (err) {
      setMelding({ soort: 'danger', tekst: err.message })
    } finally {
      setBezig(false)
    }
  }

  useEffect(() => {
    if (lijst?.klant) {
      document.title = `Picklijst ${lijst.klant.klantcode} — ${lijst.klant.naam || ''}`
    }
  }, [lijst])

  if (error) {
    return (
      <div className="center-screen">
        <div className="banner banner-danger">{error}</div>
      </div>
    )
  }
  if (!lijst) {
    return (
      <div className="center-screen">
        <div className="spinner" />
      </div>
    )
  }

  const { klant, orders, picks, tekorten } = lijst
  const locaties = new Set(picks.map((p) => p.locatieCode)).size
  const aantalOmboeken = picks.filter((p) => p.omboekenNaarId).length

  return (
    <div className="afdruk-scherm">
      <div className="afdruk-toolbar" style={{ gap: 8 }}>
        {aantalOmboeken > 0 && (
          <button className="btn btn-secondary" onClick={handleOmboeken} disabled={bezig}>
            {bezig ? 'Omboeken…' : `Omboekingen boeken (${aantalOmboeken})`}
          </button>
        )}
        <button className="btn btn-secondary" type="button" onMouseDown={() => setQrOpen(true)}>
          Op telefoon
        </button>
        <button className="btn btn-primary" onClick={() => window.print()}>
          PDF picklijst
        </button>
      </div>
      {melding && (
        <div className={`banner banner-${melding.soort} afdruk-toolbar`} style={{ display: 'block' }}>
          {melding.tekst}
        </div>
      )}

      <div className="afdruk-pagina pick-pagina">
        <div className="doc-kop">
          <div className="doc-titelblok">
            <h1 className="doc-titel">Picklijst (klant)</h1>
            <div className="doc-nummer">
              {klant.klantcode} — {klant.naam}
            </div>
            <div className="doc-datum">Gemaakt {formatDateTime(gemaaktOp)}</div>
          </div>
          <img src="/fmid-logo.png" alt="FMID" className="pick-logo" />
        </div>

        <div className="doc-gegevens">
          <Veld label="Klant">
            {klant.klantcode} — {klant.naam}
          </Veld>
          <Veld label="Open orders">{lijst.openOrders}</Veld>
          <Veld label="Te picken">
            {picks.length} {picks.length === 1 ? 'pick' : 'picks'} · {locaties}{' '}
            {locaties === 1 ? 'locatie' : 'locaties'}
          </Veld>
          <Veld label="Orders">{orders.map((o) => o.ordernummer).join(', ') || '—'}</Veld>
          <div className="doc-veld doc-veld-breed" style={{ gridColumn: 'span 5' }}>
            <div className="doc-label">Gewenste leverdata</div>
            <div className="doc-waarde">
              {[...new Set(orders.map((o) => datumLang(o.gewensteLeverdatum)).filter(Boolean))].join(' · ') || '—'}
            </div>
          </div>
        </div>

        {picks.length === 0 ? (
          <p className="doc-instructie">Er is niets te picken: alles is geleverd of niet op voorraad.</p>
        ) : (
          <table className="doc-regels pick-regels">
            <thead>
              <tr>
                <th className="pick-vink">✓</th>
                <th>Locatie</th>
                <th>Artikelnr.</th>
                <th>Omschrijving</th>
                <th className="num">Picken</th>
                <th>Eenh.</th>
                <th>Orders</th>
                <th className="num">Gepickt</th>
              </tr>
            </thead>
            <tbody>
              {picks.map((p) => (
                <tr key={p.sleutel}>
                  <td className="pick-vink">
                    <span className="pick-vakje" />
                  </td>
                  <td className="pick-locatie">
                    <div className="doc-nowrap">{p.locatieCode || '—'}</div>
                    <div className="pick-voorraad-bij">
                      voorraad {aantal(p.voorraadOpLocatie ?? p.opLocatie)}
                    </div>
                  </td>
                  <td className="doc-artikelnummer doc-nowrap">{p.artikelnummer}</td>
                  <td>
                    {p.artikelnaam}
                    {p.vervangt && <div className="pick-vervangt">omboeken naar {p.vervangt}</div>}
                  </td>
                  <td className="num pick-aantal">
                    {aantal(p.aantal)}
                    {p.totaalOpen != null && <div className="pick-voorraad-bij">open {aantal(p.totaalOpen)}</div>}
                  </td>
                  <td className="doc-nowrap">{p.eenheid}</td>
                  <td className="doc-nowrap">{(p.ordernummers || [p.ordernummer]).filter(Boolean).join(', ')}</td>
                  <td className="num">
                    <span className="pick-invul" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tekorten.length > 0 && (
          <>
            <h2 className="pick-kop">Niet (volledig) op voorraad</h2>
            <table className="doc-regels pick-tekort">
              <thead>
                <tr>
                  <th>Order</th>
                  <th className="doc-pos">Pos.</th>
                  <th>Artikelnr.</th>
                  <th>Omschrijving</th>
                  <th className="num">Nog te leveren</th>
                  <th className="num">Tekort</th>
                  <th>Eenh.</th>
                </tr>
              </thead>
              <tbody>
                {tekorten.map((t) => (
                  <tr key={`${t.ordernummer}-${t.regelId || t.regelnummer}`}>
                    <td className="doc-nowrap">{t.ordernummer}</td>
                    <td className="doc-pos">{t.regelnummer}</td>
                    <td className="doc-artikelnummer doc-nowrap">{t.artikelnummer}</td>
                    <td>
                      {t.artikelnaam}
                      {t.vervanger && <div className="pick-vervangt">ook {t.vervanger} niet (genoeg) op voorraad</div>}
                    </td>
                    <td className="num">{aantal(t.nodig)}</td>
                    <td className="num doc-artikelnummer">{aantal(t.tekort)}</td>
                    <td>{t.eenheid}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <div className="pick-aftekenen">
          <div>Gepickt door: ______________________</div>
          <div>Datum: ______________</div>
          <div>Colli / pallets: ________</div>
        </div>
        <p className="doc-instructie">
          Vink elke regel af en noteer bij afwijkingen het gepickte aantal. Dezelfde artikelen uit meerdere
          orders staan samengevoegd op één regel. De volgorde volgt de looproute (afstandsmatrix of
          sorteercode van de locatie). Geef de lijst daarna terug aan verkoop; de voorraad wordt afgeboekt
          bij het maken van de pakbon per order.
        </p>
      </div>
      {qrOpen && <PicklijstQrVenster klant={klant} onClose={() => setQrOpen(false)} />}
    </div>
  )
}

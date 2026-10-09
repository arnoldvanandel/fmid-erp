import { useEffect, useState } from 'react'
import { formatNumber } from '../../lib/format'
import { maakPakbon } from '../../lib/verkooporders'
import { maakPicklijst } from '../../lib/picklijst'
import Modal from '../../components/Modal'
import LocatieKiezer from '../../components/LocatieKiezer'
import { GetalCel } from '../../components/RegelGrid'

// Pakbon maken: per orderregel en per locatie hoeveel er nu geleverd wordt.
// Voorstel = de picklijst (locaties met voorraad, grootste eerst). BON-picks die
// nog niet zijn omgeboekt tellen niet mee: die eerst omboeken op de picklijst.
// Na het maken: pakbon afdrukken of mailen.
export default function PakbonVenster({ order, regels, gebruiker, onMailen, onKlaar }) {
  const [rijen, setRijen] = useState(null)
  const [nogOmboeken, setNogOmboeken] = useState([])
  const [leverdatum, setLeverdatum] = useState(new Date().toISOString().slice(0, 10))
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState(null)
  const [gemaakt, setGemaakt] = useState(null)

  const open = regels.filter((r) => (Number(r.geleverd) || 0) < Number(r.aantal))

  useEffect(() => {
    maakPicklijst(order.id)
      .then((lijst) => {
        const eigen = lijst.picks.filter((p) => !p.omboekenNaarId)
        setNogOmboeken(lijst.picks.filter((p) => p.omboekenNaarId))
        const nieuw = []
        for (const r of open) {
          const picks = eigen.filter((p) => p.regelId === r.id)
          if (picks.length === 0) nieuw.push({ sleutel: `${r.id}-leeg`, regelId: r.id, locatieCode: '', locatie: null, aantal: 0 })
          for (const p of picks) {
            nieuw.push({
              sleutel: p.sleutel,
              regelId: r.id,
              locatieCode: p.locatieCode,
              locatie: { id: p.locatieId, code: p.locatieCode },
              aantal: p.aantal,
            })
          }
        }
        setRijen(nieuw)
      })
      .catch((err) => setFout(err.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id])

  function wijzig(sleutel, velden) {
    setRijen((lijst) => lijst.map((r) => (r.sleutel === sleutel ? { ...r, ...velden } : r)))
  }

  function voegLocatieToe(regelId) {
    setRijen((lijst) => {
      const i = lijst.map((r) => r.regelId).lastIndexOf(regelId)
      const extra = { sleutel: `${regelId}-${Date.now()}`, regelId, locatieCode: '', locatie: null, aantal: 0 }
      return [...lijst.slice(0, i + 1), extra, ...lijst.slice(i + 1)]
    })
  }

  async function handleMaken() {
    setFout(null)
    for (const r of open) {
      const totaal = rijen.filter((x) => x.regelId === r.id).reduce((s, x) => s + (Number(x.aantal) || 0), 0)
      const rest = Number(r.aantal) - (Number(r.geleverd) || 0)
      if (totaal > rest) {
        setFout(`${r.artikelnummer}: er staat nog ${formatNumber(rest)} open; je levert er ${formatNumber(totaal)}.`)
        return
      }
    }
    for (const x of rijen) {
      if (Number(x.aantal) > 0 && x.locatieCode.trim() && !x.locatie) {
        setFout(`Locatie "${x.locatieCode}" bestaat niet. Laat het veld leeg om niet af te boeken.`)
        return
      }
    }
    setBezig(true)
    try {
      const pakbon = await maakPakbon({
        verkooporderId: order.id,
        leveringen: rijen.map((x) => ({ regelId: x.regelId, locatieId: x.locatie?.id || '', aantal: Number(x.aantal) || 0 })),
        leverdatum,
        gebruiker,
      })
      setGemaakt(pakbon)
    } catch (err) {
      setFout(err.message)
    } finally {
      setBezig(false)
    }
  }

  if (gemaakt) {
    return (
      <Modal title={`Pakbon ${gemaakt.pakbonnummer} gemaakt`} onClose={() => onKlaar(gemaakt)} width={520}>
        <div className="banner banner-info">
          Pakbon {gemaakt.pakbonnummer} is gemaakt en de voorraad is afgeboekt.
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={() => onKlaar(gemaakt)}>
            Sluiten
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => onMailen(gemaakt)}>
            Mailen…
          </button>
          <a
            className="btn btn-primary"
            href={`/pakbonnen/${gemaakt.id}/afdruk`}
            target="_blank"
            rel="noreferrer"
          >
            Pakbon afdrukken
          </a>
        </div>
      </Modal>
    )
  }

  const regelVan = Object.fromEntries(open.map((r) => [r.id, r]))

  return (
    <Modal title={`Pakbon maken — ${order.ordernummer}`} onClose={bezig ? undefined : () => onKlaar(null)} width={900}>
      {fout && <div className="banner banner-danger">{fout}</div>}
      {nogOmboeken.length > 0 && (
        <div className="banner banner-warning">
          Er staan nog {nogOmboeken.length} BON-artikel(en) op de picklijst die eerst omgeboekt moeten worden (
          {nogOmboeken.map((p) => `${p.aantal}× ${p.artikelnummer}`).join(', ')}). Boek die om via de picklijst;
          tot dan tellen ze hier niet mee.
        </div>
      )}

      <div className="field-row">
        <div className="field" style={{ maxWidth: 200 }}>
          <label>Leverdatum</label>
          <input type="date" value={leverdatum} onChange={(e) => setLeverdatum(e.target.value)} />
        </div>
      </div>

      {!rijen ? (
        <div className="empty-state">
          <div className="spinner" style={{ margin: '0 auto' }} />
        </div>
      ) : (
        <div className="regel-grid-wrap" style={{ marginBottom: 6 }}>
          <table className="regel-grid">
            <thead>
              <tr>
                <th>Artikelnummer</th>
                <th>Artikelnaam</th>
                <th className="num">Nog te leveren</th>
                <th>Locatie</th>
                <th className="num">Nu leveren</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rijen.map((x, i) => {
                const r = regelVan[x.regelId]
                const eersteVanRegel = i === 0 || rijen[i - 1].regelId !== x.regelId
                return (
                  <tr key={x.sleutel}>
                    <td className="alleen-lezen">{eersteVanRegel ? r.artikelnummer : ''}</td>
                    <td className="alleen-lezen">{eersteVanRegel ? r.artikelnaam : ''}</td>
                    <td className="num alleen-lezen">
                      {eersteVanRegel ? formatNumber(Number(r.aantal) - (Number(r.geleverd) || 0)) : ''}
                    </td>
                    <td>
                      <LocatieKiezer
                        value={x.locatieCode}
                        onChange={(code) => wijzig(x.sleutel, { locatieCode: code })}
                        onKies={(l) => wijzig(x.sleutel, { locatie: l })}
                        placeholder="Leeg = niet afboeken"
                      />
                    </td>
                    <td className="num">
                      <GetalCel
                        rij={i}
                        kolom="nu"
                        value={x.aantal}
                        decimalen={0}
                        maxDecimalen={2}
                        onCommit={(v) => wijzig(x.sleutel, { aantal: v === '' ? 0 : v })}
                      />
                    </td>
                    <td>
                      {eersteVanRegel && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => voegLocatieToe(x.regelId)}
                          title="Nog een locatie voor deze regel"
                        >
                          + locatie
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="hint">
        Voorstel volgens de picklijst. Pas aantallen aan naar wat er gepickt is; 0 = deze regel nu niet leveren. Het
        restant blijft openstaan voor een volgende pakbon.
      </p>

      <div className="modal-actions">
        <button type="button" className="btn btn-secondary" onClick={() => onKlaar(null)} disabled={bezig}>
          Annuleren
        </button>
        <button type="button" className="btn btn-primary" onClick={handleMaken} disabled={bezig || !rijen}>
          {bezig ? 'Pakbon maken…' : 'Pakbon maken'}
        </button>
      </div>
    </Modal>
  )
}

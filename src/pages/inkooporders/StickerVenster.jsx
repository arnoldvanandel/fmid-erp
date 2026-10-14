import { useEffect, useState } from 'react'
import MailVenster from '../../components/MailVenster'
import Modal from '../../components/Modal'
import { laadInkooporderVoorAfdruk } from '../../lib/inkooporders'
import { BONFIX, mailStickers, standaardAfleveradres, stickerRegels } from '../../lib/stickers'

// Stickers voor de BON-artikelen van een inkooporder bestellen bij Bonfix.
// De aantallen (+20, afgerond op 10) en Bonfix-nummers zijn voor deze mail
// nog aan te passen; Bonfix stuurt de stickers naar de leverancier van de order.
export default function StickerVenster({ inkooporder, regels, profile, onKlaar }) {
  const [gegevens, setGegevens] = useState(null)
  const [stickers, setStickers] = useState(null)
  const [zakjes, setZakjes] = useState(true)
  const [afleveradres, setAfleveradres] = useState('')
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState(null)

  useEffect(() => {
    let actief = true
    Promise.all([laadInkooporderVoorAfdruk(inkooporder.id), stickerRegels(regels)])
      .then(([g, s]) => {
        if (!actief) return
        setGegevens(g)
        setStickers(s)
        setAfleveradres(standaardAfleveradres(g.leverancier))
      })
      .catch((err) => actief && setFout(err.message))
    return () => {
      actief = false
    }
    // Eenmalig laden bij openen, zodat aangepaste aantallen niet terugspringen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inkooporder.id])

  function wijzig(index, veld, waarde) {
    setStickers((lijst) => lijst.map((r, i) => (i === index ? { ...r, [veld]: waarde } : r)))
  }

  async function versturen(ontvangers) {
    const teBestellen = stickers.filter((r) => Number(r.aantal) > 0)
    if (teBestellen.length === 0) throw new Error('Er zijn geen stickers om te bestellen.')
    const zonderNummer = teBestellen.filter((r) => !String(r.bonfixNummer).trim())
    if (zonderNummer.length) {
      throw new Error(`Vul het Bonfix-nummer in bij ${zonderNummer.map((r) => r.artikelnummer).join(', ')}.`)
    }
    if (!afleveradres.trim()) throw new Error('Vul het afleveradres in.')
    setBezig(true)
    try {
      await mailStickers({
        afleveradres,
        gegevens,
        regels: teBestellen,
        zakjes,
        ontvangers,
        gebruiker: profile?.naam || profile?.email,
        gebruikerEmail: profile?.email,
        handtekening: profile?.handtekening,
      })
      onKlaar()
    } finally {
      setBezig(false)
    }
  }

  if (!gegevens || !stickers) {
    return (
      <Modal title="Stickers bestellen bij Bonfix" onClose={onKlaar} width={640}>
        {fout ? <div className="banner banner-danger">{fout}</div> : <div className="spinner" style={{ margin: '20px auto' }} />}
      </Modal>
    )
  }

  const lev = gegevens.leverancier
  return (
    <MailVenster
      titel="Stickers bestellen bij Bonfix"
      standaardAdressen={[BONFIX.email]}
      eerderGemaildOp={inkooporder.stickersBesteldOp}
      gebruikerEmail={profile?.email}
      bezig={bezig}
      width={640}
      onVersturen={versturen}
      onAnnuleren={onKlaar}
    >
      <table className="data-table" style={{ marginBottom: 12 }}>
        <thead>
          <tr>
            <th>Artikel</th>
            <th>Bonfix nummer</th>
            <th>Bonfix code</th>
            <th className="num">Hoeveelheid</th>
            <th>Eenheid</th>
          </tr>
        </thead>
        <tbody>
          {stickers.map((r, i) => (
            <tr key={r.artikelnummer + i} style={{ cursor: 'default' }}>
              <td>{r.artikelnummer}</td>
              <td>
                <input
                  type="text"
                  value={r.bonfixNummer}
                  onChange={(e) => wijzig(i, 'bonfixNummer', e.target.value)}
                  style={{ width: 90 }}
                />
              </td>
              <td>{r.bonfixCode}</td>
              <td className="num">
                <input
                  type="number"
                  min="0"
                  step="10"
                  value={r.aantal}
                  onChange={(e) => wijzig(i, 'aantal', e.target.value)}
                  style={{ width: 90, textAlign: 'right' }}
                />
              </td>
              <td>{r.eenheid}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint" style={{ marginTop: -4 }}>
        Hoeveelheid = orderhoeveelheid + 20, afgerond op 10. Een ontbrekend Bonfix-nummer vul je vast in bij het
        artikel (tabblad Algemeen).
      </p>
      <div className="field">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={zakjes} onChange={(e) => setZakjes(e.target.checked)} style={{ width: 'auto' }} />
          Ook een doos zakjes meesturen
        </label>
      </div>
      <div className="field">
        <label>Afleveradres (Bonfix stuurt de stickers hierheen)</label>
        <textarea rows={5} value={afleveradres} onChange={(e) => setAfleveradres(e.target.value)} />
        <span className="hint">Geen postbus. Wordt onthouden bij {lev?.naam || 'de leverancier'}.</span>
      </div>
    </MailVenster>
  )
}

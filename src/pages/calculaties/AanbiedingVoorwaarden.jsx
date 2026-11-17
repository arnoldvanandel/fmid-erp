import { LEVERINGSVOORWAARDEN } from '../../lib/stamgegevens'
import { MAIL_TALEN } from '../../lib/inkooporderMail'
import { geldigTot } from '../../lib/calculaties'
import { datumLang } from '../inkooporders/bedrijf'

// Voorwaarden van de aanbieding en aan wie hij gericht is. Gedeeld door de
// calculatie (tabblad Prijs en voorwaarden) en de aanbieding met artikelen.
export default function AanbiedingVoorwaarden({ form, set, calculatiedatum }) {
  function setAdres(veld, waarde) {
    set('adres', { ...form.adres, [veld]: waarde })
  }
  const tot = geldigTot({ calculatiedatum, geldigDagen: form.geldigDagen })

  return (
    <>
      <div className="field-row" style={{ marginTop: 14 }}>
        <div className="field">
          <label>Leveringsvoorwaarde</label>
          <select value={form.leveringsvoorwaarde} onChange={(e) => set('leveringsvoorwaarde', e.target.value)}>
            <option value="">— kies —</option>
            {Object.entries(LEVERINGSVOORWAARDEN).map(([code, naam]) => (
              <option key={code} value={code}>
                {code} — {naam}
              </option>
            ))}
            {form.leveringsvoorwaarde && !LEVERINGSVOORWAARDEN[form.leveringsvoorwaarde] && (
              <option value={form.leveringsvoorwaarde}>{form.leveringsvoorwaarde}</option>
            )}
          </select>
        </div>
        <div className="field">
          <label>Levertijd</label>
          <input
            type="text"
            value={form.levertijd}
            onChange={(e) => set('levertijd', e.target.value)}
            placeholder="bijv. 4 weken na opdracht"
          />
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label>Betalingstermijn (dagen)</label>
          <input
            type="number"
            min="0"
            value={form.betalingstermijn}
            onChange={(e) => set('betalingstermijn', e.target.value)}
          />
        </div>
        <div className="field">
          <label>Aanbieding geldig (dagen)</label>
          <input type="number" min="0" value={form.geldigDagen} onChange={(e) => set('geldigDagen', e.target.value)} />
          <span className="hint">{tot ? `Geldig tot ${datumLang(tot)}.` : 'Zonder einddatum.'}</span>
        </div>
      </div>
      <div className="regel-grid-kop" style={{ marginTop: 6 }}>
        <h3>Aanbieding aan</h3>
      </div>
      <div className="field-row">
        <div className="field">
          <label>Naam</label>
          <input type="text" value={form.adres.naam} onChange={(e) => setAdres('naam', e.target.value)} />
          <span className="hint">
            Zoals hij op de aanbieding staat. Een andere klant kies je bovenaan met Wijzigen.
          </span>
        </div>
        <div className="field">
          <label>Straat</label>
          <input type="text" value={form.adres.straat} onChange={(e) => setAdres('straat', e.target.value)} />
        </div>
      </div>
      <div className="field-row">
        <div className="field" style={{ maxWidth: 140 }}>
          <label>Postcode</label>
          <input type="text" value={form.adres.postcode} onChange={(e) => setAdres('postcode', e.target.value)} />
        </div>
        <div className="field">
          <label>Plaats</label>
          <input type="text" value={form.adres.plaats} onChange={(e) => setAdres('plaats', e.target.value)} />
        </div>
        <div className="field">
          <label>Land</label>
          <input type="text" value={form.adres.land} onChange={(e) => setAdres('land', e.target.value)} />
        </div>
        <div className="field" style={{ maxWidth: 160 }}>
          <label>Taal</label>
          <select value={form.taal} onChange={(e) => set('taal', e.target.value)}>
            {Object.entries(MAIL_TALEN).map(([code, naam]) => (
              <option key={code} value={code}>
                {naam}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label>Contactpersoon bij de klant</label>
          <input type="text" value={form.contactpersoon} onChange={(e) => set('contactpersoon', e.target.value)} />
        </div>
        <div className="field">
          <label>Uw referentie</label>
          <input
            type="text"
            value={form.referentie}
            onChange={(e) => set('referentie', e.target.value)}
            placeholder="Aanvraagnummer van de klant"
          />
        </div>
      </div>
      <div className="field">
        <label>Opmerkingen (komen op de aanbieding)</label>
        <textarea rows={3} value={form.opmerkingen} onChange={(e) => set('opmerkingen', e.target.value)} />
      </div>
    </>
  )
}

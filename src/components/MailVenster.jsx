import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { formatDateTime } from '../lib/format'
import Modal from './Modal'

// Venster om een document (inkooporder, orderbevestiging, pakbon, factuur) te
// mailen. De standaardadressen komen van de leverancier of klant; voor deze
// ene mail kun je adressen toevoegen of weghalen.
export default function MailVenster({
  titel,
  standaardAdressen,
  eerderGemaildOp,
  adressenHint,
  gebruikerEmail,
  bezig,
  annulerenLabel = 'Annuleren',
  onVersturen,
  onAnnuleren,
}) {
  const [aanTekst, setAanTekst] = useState((standaardAdressen || []).join(', '))
  const [fout, setFout] = useState(null)

  const aan = aanTekst
    .split(/[,;\s]+/)
    .map((e) => e.trim())
    .filter(Boolean)
  const ongeldig = aan.filter((e) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))
  const cc = gebruikerEmail && !aan.includes(gebruikerEmail) ? gebruikerEmail : null

  async function handleVersturen() {
    setFout(null)
    if (aan.length === 0) {
      setFout('Vul minimaal één e-mailadres in.')
      return
    }
    if (ongeldig.length) {
      setFout(`Geen geldig e-mailadres: ${ongeldig.join(', ')}`)
      return
    }
    try {
      await onVersturen(aan)
    } catch (err) {
      setFout(err.message)
    }
  }

  return (
    <Modal title={titel} onClose={bezig ? undefined : onAnnuleren} width={520}>
      {fout && <div className="banner banner-danger">{fout}</div>}
      {eerderGemaildOp && (
        <div className="banner banner-warning">Let op: dit is al eerder gemaild ({formatDateTime(eerderGemaildOp)}).</div>
      )}
      <div className="field">
        <label>Aan</label>
        <textarea
          rows={3}
          value={aanTekst}
          onChange={(e) => setAanTekst(e.target.value)}
          placeholder="naam@bedrijf.nl, inkoop@bedrijf.nl"
          autoFocus
        />
        <span className="hint">
          Meerdere adressen scheiden met een komma. Wat je hier toevoegt geldt alleen voor deze mail
          {adressenHint ? `; ${adressenHint}` : ''}.
        </span>
      </div>
      {cc && <p className="hint">Kopie (cc) naar: {cc}</p>}
      <div className="modal-actions">
        <button type="button" className="btn btn-secondary" onClick={onAnnuleren} disabled={bezig}>
          {annulerenLabel}
        </button>
        <button type="button" className="btn btn-primary" onClick={handleVersturen} disabled={bezig}>
          {bezig ? 'Versturen…' : `Versturen${aan.length > 1 ? ` (${aan.length} adressen)` : ''}`}
        </button>
      </div>
    </Modal>
  )
}

// Toont naar wie en wanneer een document gemaild is, en (live) of de Cloud
// Function verstuurMail de mail daadwerkelijk heeft kunnen versturen.
// `document` heeft de velden gemaildNaar, gemaildCc, gemaildOp en mailId.
export function MailStatus({ document: d, compact = false }) {
  const [delivery, setDelivery] = useState(null)

  useEffect(() => {
    if (!d?.mailId) return undefined
    return onSnapshot(
      doc(db, 'mail', d.mailId),
      (snap) => setDelivery(snap.data()?.delivery || null),
      () => setDelivery(null)
    )
  }, [d?.mailId])

  if (!d?.gemaildOp) return null

  const state = delivery?.state
  const label =
    state === 'SUCCESS'
      ? 'verzonden'
      : state === 'ERROR'
        ? `niet verzonden: ${delivery.error || 'onbekende fout'}`
        : 'wacht op verzending'

  if (compact) {
    return (
      <span className={'badge ' + (state === 'ERROR' ? 'badge-danger' : state === 'SUCCESS' ? 'badge-success' : 'badge-warning')}>
        gemaild {formatDateTime(d.gemaildOp)} — {label}
      </span>
    )
  }

  return (
    <div className={'banner ' + (state === 'ERROR' ? 'banner-danger' : state === 'SUCCESS' ? 'banner-info' : 'banner-warning')}>
      Gemaild naar {(d.gemaildNaar || []).join(', ')}
      {d.gemaildCc?.length ? ` (cc: ${d.gemaildCc.join(', ')})` : ''} op {formatDateTime(d.gemaildOp)} — {label}
    </div>
  )
}

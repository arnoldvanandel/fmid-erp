import { afrondingAantal, enterSluitToetsenbord, evalueerAantal } from '../lib/magazijnInvoer'

// Aantalveld waarin 80x2 of 80*2+20 meteen de uitkomst toont.
// Enter of het veld verlaten zet het resultaat in het veld en boekt niet.
export default function AantalInput({ value, onValue, ...rest }) {
  const n = evalueerAantal(value)
  const formule = /[xX×*+/]/.test(String(value || ''))

  function rondAf() {
    const af = afrondingAantal(value)
    if (af != null) onValue(af)
  }

  return (
    <>
      <input
        inputMode="text"
        autoComplete="off"
        enterKeyHint="done"
        value={value}
        onKeyDown={(e) => {
          enterSluitToetsenbord(e)
        }}
        onChange={(e) => onValue(e.target.value)}
        onBlur={rondAf}
        {...rest}
      />
      {formule && Number.isFinite(n) ? <span className="hint">= {n}</span> : null}
    </>
  )
}

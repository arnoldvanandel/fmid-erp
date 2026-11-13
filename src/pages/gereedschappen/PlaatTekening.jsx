import { useId } from 'react'
import { plaatPad, VORMEN } from '../../lib/wisselplaat'

const GAT_Y = { T: 0.22, W: 0.12, DR: 0.2 }

// Bovenaanzicht van een wisselplaat, getekend uit de ISO-vorm. Een dikkere
// rand onderaan suggereert de dikte; de hoekafronding volgt de radius.
export default function PlaatTekening({ vorm, radius, metGat = true, grootte = 120, stil = false }) {
  const id = useId().replace(/:/g, '')
  const afronding = Math.min(0.26, 0.035 + (Number(radius) || 0) * 0.11)
  const pad = plaatPad(vorm, afronding)
  const rond = VORMEN[vorm]?.soort === 'rond'
  const bekend = Boolean(pad) || rond

  return (
    <svg
      className={`gs-tekening${stil ? '' : ' gs-tekening-levend'}`}
      width={grootte}
      height={grootte}
      viewBox="-1.35 -1.35 2.7 2.7"
      role="img"
      aria-label={bekend ? `Wisselplaat ${VORMEN[vorm]?.naam || vorm}` : 'Wisselplaat'}
    >
      <defs>
        <linearGradient id={`vlak-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" className="gs-stop-licht" />
          <stop offset="100%" className="gs-stop-donker" />
        </linearGradient>
        <radialGradient id={`glans-${id}`} cx="0.3" cy="0.25" r="0.8">
          <stop offset="0%" className="gs-stop-glans" />
          <stop offset="100%" className="gs-stop-glans-uit" />
        </radialGradient>
      </defs>

      {rond ? (
        <g>
          <circle cx="0.04" cy="0.1" r="1" className="gs-plaat-rand" />
          <circle cx="0" cy="0" r="1" fill={`url(#vlak-${id})`} className="gs-plaat-vlak" />
          <circle cx="0" cy="0" r="1" fill={`url(#glans-${id})`} />
          <circle cx="0" cy="0" r="0.78" className="gs-plaat-snijkant" />
        </g>
      ) : pad ? (
        <g>
          <path d={pad} transform="translate(0.04 0.1)" className="gs-plaat-rand" />
          <path d={pad} fill={`url(#vlak-${id})`} className="gs-plaat-vlak" />
          <path d={pad} fill={`url(#glans-${id})`} />
          <path d={pad} transform="scale(0.8)" className="gs-plaat-snijkant" />
        </g>
      ) : (
        <g>
          <rect x="-1.1" y="-0.32" width="2.2" height="0.64" rx="0.12" transform="translate(0.04 0.08)" className="gs-plaat-rand" />
          <rect x="-1.1" y="-0.32" width="2.2" height="0.64" rx="0.12" fill={`url(#vlak-${id})`} className="gs-plaat-vlak" />
          <rect x="-1.1" y="-0.32" width="2.2" height="0.64" rx="0.12" fill={`url(#glans-${id})`} />
          <path d="M-1.1 0 L-0.78 -0.32 M1.1 0 L0.78 -0.32 M-1.1 0 L-0.78 0.32 M1.1 0 L0.78 0.32" className="gs-plaat-snijkant" />
        </g>
      )}

      {bekend && metGat && (
        <g>
          <circle cx="0" cy={GAT_Y[vorm] || 0} r="0.26" className="gs-plaat-gat-rand" />
          <circle cx="0" cy={GAT_Y[vorm] || 0} r="0.17" className="gs-plaat-gat" />
        </g>
      )}
    </svg>
  )
}

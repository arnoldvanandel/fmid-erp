import { createPortal } from 'react-dom'

export default function Modal({ title, onClose, children, width }) {
  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
    >
      <div className="modal" style={width ? { maxWidth: width } : undefined}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Sluiten">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  )
}

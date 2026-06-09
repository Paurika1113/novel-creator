import { useEffect, useRef, type ReactNode } from 'react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  width?: number
  /** 覆盖 modal-body 的样式（例如 padding） */
  bodyStyle?: React.CSSProperties
}

export default function Modal({ open, onClose, title, children, width = 480, bodyStyle }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      const handleKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose()
      }
      document.addEventListener('keydown', handleKey)
      return () => document.removeEventListener('keydown', handleKey)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="modal-overlay"
      ref={overlayRef}
      onMouseDown={() => {
        // Track that mouse started on overlay
        if (overlayRef.current) overlayRef.current.dataset.mousedown = 'true'
      }}
      onMouseUp={() => {
        if (overlayRef.current) {
          const close = overlayRef.current.dataset.mousedown === 'true'
          overlayRef.current.dataset.mousedown = 'false'
          if (close) onClose()
        }
      }}
    >
      <div
        className="modal-content"
        style={{ width }}
        onMouseDown={(e) => {
          // Prevent mousedown from reaching overlay (fixes text-selection click-through)
          e.stopPropagation()
        }}
      >
        {title && (
          <div className="modal-header">
            <h2 className="modal-title">{title}</h2>
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>
        )}
        <div className="modal-body" style={bodyStyle}>{children}</div>
      </div>
    </div>
  )
}

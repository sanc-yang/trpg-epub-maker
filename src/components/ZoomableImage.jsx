import { useState } from 'react'
import { X } from 'lucide-react'

/** 클릭하면 모달로 크게 보여주는 이미지 */
export default function ZoomableImage({ src, alt, t, style }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <div
        onClick={() => setOpen(true)}
        style={{
          width: '100%', borderRadius: 12, overflow: 'hidden',
          cursor: 'pointer', border: `1px solid ${t.glassBorder}`, boxShadow: t.shadow,
          ...style,
        }}
      >
        <img src={src} alt={alt} style={{ display: 'block', width: '100%' }} />
      </div>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24, cursor: 'zoom-out',
          }}
        >
          <img
            src={src} alt={alt}
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8, boxShadow: '0 16px 48px rgba(0,0,0,0.5)', cursor: 'default' }}
          />
          <button type="button" onClick={() => setOpen(false)} aria-label="닫기" style={{
            position: 'fixed', top: 20, right: 20, background: 'rgba(255,255,255,0.15)', border: 'none',
            color: '#fff', borderRadius: '50%', width: 36, height: 36, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}><X size={18} /></button>
        </div>
      )}
    </>
  )
}

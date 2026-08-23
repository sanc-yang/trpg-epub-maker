import { useState } from 'react'
import Spinner from './Spinner'

/**
 * 버튼 아래 인라인 팝오버. 섹션(청크) 단위로 나눠 클립보드 복사.
 * 배경은 항상 흰 카드 고정 — 라이트/다크 테마와 무관하게 패널 위에 떠서 잘 보여야 함.
 */
export default function CopyChunksPopover({ label, chunkCount, onCopyChunk, onClose, accent = '#1c1c1e', accentFg = '#fff' }) {
  const [copied, setCopied] = useState(null)
  const [copying, setCopying] = useState(null)

  const handleCopy = async (i) => {
    if (copying !== null) return
    setCopying(i)
    await onCopyChunk(i)
    setCopying(null)
    setCopied(i)
    setTimeout(() => setCopied(null), 1800)
  }

  return (
    <div style={{
      position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 200,
      background: '#fff', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 12,
      padding: '14px 16px', width: 280, boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      {label && <div style={{ fontSize: '0.8em', color: '#6c6c70', textAlign: 'left' }}>{label}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
        {Array.from({ length: chunkCount }, (_, i) => (
          <button key={i} type="button" onClick={() => handleCopy(i)} disabled={copying !== null} style={{
            padding: '7px 12px', borderRadius: 7, border: 'none',
            background: copied === i ? '#22c55e' : accent, color: accentFg,
            fontWeight: 600, fontSize: '0.85em', cursor: copying !== null ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            transition: 'background 0.2s', opacity: copying !== null && copying !== i ? 0.5 : 1,
          }}>
            {copied === i
              ? '복사 완료!'
              : copying === i
                ? <><Spinner size={12} color={accentFg} />복사 중...</>
                : chunkCount === 1 ? '복사' : `섹션 ${i + 1} 복사`}
          </button>
        ))}
      </div>
      <button type="button" onClick={onClose} style={{
        padding: '5px 0', borderRadius: 7, border: '1px solid rgba(0,0,0,0.12)',
        background: 'transparent', color: '#6c6c70', fontSize: '0.85em', cursor: 'pointer',
      }}>닫기</button>
    </div>
  )
}

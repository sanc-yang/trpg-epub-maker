import { useRef, useState } from 'react'
import { Book, X } from 'lucide-react'
import { glass } from '../theme'

/**
 * 파일 드롭존. 로그 업로드 · 표지 이미지 업로드가 같은 모양을 쓰도록 하나로 모음.
 * size 만 다르고 테두리 · 배경 · 드래그 반응은 전부 동일.
 * onClear 를 넘기면 우측 상단에 X 버튼이 떠서 업로드된 걸 지우고 초기 상태로 되돌릴 수 있음.
 */
export default function DropZone({
  t, onFile, accept, inputId, size = 'lg', icon, children, style, onClear,
}) {
  const ref = useRef(null)
  const [over, setOver] = useState(false)

  const pad = size === 'lg' ? '32px 20px' : '20px 16px'

  // 아이콘을 넘기지 않으면 책 아이콘. null 을 넘기면 아이콘 없음.
  const glyph = icon === undefined
    ? <Book size={size === 'lg' ? 26 : 22} strokeWidth={1.5} color={t.textSub}
        style={{ margin: size === 'lg' ? '0 auto 9px' : '0 auto 7px', display: 'block' }} />
    : icon

  return (
    <div
      onClick={() => ref.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); onFile(e.dataTransfer.files[0]) }}
      style={{
        ...glass(t),
        position: 'relative',
        border: `1.5px dashed ${over ? t.text : t.glassBorder}`,
        background: over
          ? (t.isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.50)')
          : (t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.50)'),
        borderRadius: 16,
        padding: pad,
        textAlign: 'center',
        cursor: 'pointer',
        transition: 'all 0.2s',
        color: t.textSub,
        fontSize: '0.88em',
        ...style,
      }}
    >
      {onClear && (
        <button
          type="button"
          aria-label="지우기"
          onClick={(e) => { e.stopPropagation(); onClear() }}
          style={{
            position: 'absolute', top: 10, right: 10, zIndex: 1,
            width: 26, height: 26, borderRadius: '50%',
            background: t.surface, border: `1px solid ${t.border}`,
            color: t.textSub, cursor: 'pointer', padding: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        ><X size={14} /></button>
      )}
      <input
        id={inputId} ref={ref} type="file" accept={accept}
        style={{ display: 'none' }}
        onChange={(e) => { onFile(e.target.files[0]); e.target.value = '' }}
      />
      {glyph}
      {children}
    </div>
  )
}

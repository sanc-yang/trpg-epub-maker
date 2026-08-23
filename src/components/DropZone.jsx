import { useRef, useState } from 'react'
import { Book } from 'lucide-react'
import { glass } from '../theme'

/**
 * 파일 드롭존. 로그 업로드 · 표지 이미지 업로드가 같은 모양을 쓰도록 하나로 모음.
 * size 만 다르고 테두리 · 배경 · 드래그 반응은 전부 동일.
 */
export default function DropZone({
  t, onFile, accept, inputId, size = 'lg', icon, children, style,
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

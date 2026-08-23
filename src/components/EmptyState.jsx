import { Book } from 'lucide-react'
import { glass, styles } from '../theme'
import DropZone from './DropZone'

/**
 * eBook 이 아직 없어 페이지가 의미를 갖지 못할 때의 안내.
 *
 * 안내 문구에 「로그」를 쓰지 않는 이유 = TRPG 유저에게 로그는 «변환 전 채팅 로그»를
 * 가리키는 말이라, 이미 변환을 마친 결과물을 로그라고 부르면 헷갈림.
 * 버튼 문구의 「로그 변환」은 메뉴 이름이므로 그대로 둠.
 *
 * onUploadEpub 을 넘기면 기존 .epub 파일을 직접 업로드하는 경로도 같이 보여줌 —
 * 이 메뉴들의 원래 목적은 «이미 만든 epub의 정보/표지만 다시 고치는 것»이라
 * 로그 변환 없이도 여기서 바로 열 수 있어야 함.
 */
export default function EmptyState({ t, onGoConvert, onUploadEpub, title = '먼저 eBook을 올려주세요', desc }) {
  const S = styles(t)
  return (
    <div style={{ ...glass(t), borderRadius: 16, padding: '40px 24px', textAlign: 'center' }}>
      <Book size={26} strokeWidth={1.5} color={t.textMuted} style={{ margin: '0 auto 13px', display: 'block' }} />
      <h3 style={{ fontSize: '0.95em', fontWeight: 700, color: t.text, margin: '0 0 7px' }}>{title}</h3>
      <p style={{ fontSize: '0.82em', color: t.textSub, lineHeight: 1.65, margin: 0 }}>{desc}</p>

      {onUploadEpub && (
        <>
          <div style={{ maxWidth: 320, margin: '18px auto 0' }}>
            <DropZone t={t} size="sm" accept=".epub" onFile={onUploadEpub}>
              기존 .epub 파일 드롭 또는 클릭
            </DropZone>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px auto 0', maxWidth: 320, color: t.textMuted, fontSize: '0.72em' }}>
            <div style={{ flex: 1, height: 1, background: t.borderSub }} />
            또는
            <div style={{ flex: 1, height: 1, background: t.borderSub }} />
          </div>
        </>
      )}

      <button type="button" onClick={onGoConvert} style={{ ...S.btnPrimary, marginTop: onUploadEpub ? 14 : 18, fontSize: '0.82em', padding: '8px 18px' }}>
        로그 변환으로 이동
      </button>
    </div>
  )
}

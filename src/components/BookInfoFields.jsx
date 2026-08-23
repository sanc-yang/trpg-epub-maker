import { X } from 'lucide-react'
import { useCallback } from 'react'
import { glass, styles } from '../theme'
import CoverPreview from './CoverPreview'
import DropZone from './DropZone'

/**
 * 제목 · 작가명 · 표지 이미지 입력 + 미리보기.
 * eBook 생성 시점(ConvertPage)과 나중에 다시 고칠 때(BookInfoPage) 양쪽에서 씀.
 */
export default function BookInfoFields({ t, title, setTitle, author, setAuthor, coverImage, setCoverImage, onGoCoverGenerator }) {
  const S = styles(t)
  const G = glass(t)

  const readImage = useCallback((file) => {
    if (!file || !file.type.startsWith('image/')) return
    const r = new FileReader()
    r.onload = (ev) => setCoverImage(ev.target.result)
    r.readAsDataURL(file)
  }, [setCoverImage])

  return (
    <div style={{ ...G, borderRadius: 16, padding: 24 }}>
      <p style={S.sectionLabel}>기본 정보</p>
      <div className="split-cover">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="field-row">
            <div style={{ ...S.field, flex: 2, minWidth: 150 }}>
              <label style={S.label}>제목</label>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="시나리오 제목" style={S.input} />
            </div>
            <div style={{ ...S.field, flex: 1, minWidth: 130 }}>
              <label style={S.label}>작가명</label>
              <input value={author} onChange={e => setAuthor(e.target.value)} placeholder="페어명 또는 팀명" style={S.input} />
            </div>
          </div>

          <div style={S.field}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
              <label style={{ ...S.label, marginBottom: 0 }}>표지 이미지</label>
              <span style={{ fontSize: '0.68em', color: t.textMuted }}>*선택 사항</span>
            </div>
            {coverImage ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <img src={coverImage} alt="표지" style={{ height: 56, borderRadius: 6, border: `1px solid ${t.border}`, objectFit: 'cover' }} />
                <button type="button" onClick={() => setCoverImage(null)} style={{
                  color: t.textMuted, background: 'none', border: 'none', cursor: 'pointer',
                  padding: 0, display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8em', fontFamily: 'inherit',
                }}>
                  <X size={13} /> 제거
                </button>
              </div>
            ) : (
              <DropZone t={t} size="sm" accept="image/*" onFile={readImage}>
                클릭하거나 이미지를 드래그하세요
              </DropZone>
            )}
            <p style={{ fontSize: '0.72em', color: t.textMuted, margin: '9px 0 0', lineHeight: 1.6 }}>
              이미지를 올리지 않으면 제목 · 작가명으로 기본 표지가 자동 생성됩니다.
              직접 구성하려면 <button type="button" onClick={onGoCoverGenerator} style={{
                background: 'none', border: 'none', padding: 0, color: t.textSub,
                textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit',
              }}>표지 생성기</button> 로 이동하세요.
            </p>
          </div>
        </div>

        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <CoverPreview coverImage={coverImage} coverTitle={title} coverAuthor={author} />
          <span style={{ fontSize: '0.72em', color: t.textMuted }}>표지 미리보기</span>
        </div>
      </div>
    </div>
  )
}

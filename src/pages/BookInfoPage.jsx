import { useCallback } from 'react'
import { X } from 'lucide-react'
import { glass, styles } from '../theme'
import PageHeader from '../components/PageHeader'
import CoverPreview from '../components/CoverPreview'
import EmptyState from '../components/EmptyState'
import DropZone from '../components/DropZone'

export default function BookInfoPage({ app }) {
  const { t, messages, title, setTitle, author, setAuthor, coverImage, setCoverImage, setPage } = app
  const S = styles(t)

  const readImage = useCallback((file) => {
    if (!file || !file.type.startsWith('image/')) return
    const r = new FileReader()
    r.onload = (ev) => setCoverImage(ev.target.result)
    r.readAsDataURL(file)
  }, [setCoverImage])

  if (!messages.length) {
    return (
      <>
        <PageHeader title="책 정보 수정" desc="전자책의 제목 · 작가명 · 표지를 지정합니다" t={t} />
        <EmptyState
          t={t}
          onGoConvert={() => setPage('convert')}
          desc={<>책 정보는 eBook이 있어야 지정할 수 있습니다.<br />제목은 파일명에서 자동으로 채워집니다.</>}
        />
      </>
    )
  }

  return (
    <>
      <PageHeader title="책 정보 수정" desc="전자책의 제목 · 작가명 · 표지를 지정합니다" t={t} />

      <div style={{ ...glass(t), borderRadius: 16, padding: 24 }}>
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
                직접 구성하려면 <button type="button" onClick={() => setPage('cover')} style={{
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
    </>
  )
}

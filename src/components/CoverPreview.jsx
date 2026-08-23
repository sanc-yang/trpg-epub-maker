/** 업로드/생성된 표지 또는 제목·작가명 기반 기본 표지의 축소 미리보기 */
export default function CoverPreview({ coverImage, coverTitle, coverAuthor, width = 140 }) {
  const height = Math.round(width * 1.5)
  return (
    <div style={{
      width, height, background: '#000', overflow: 'hidden', borderRadius: 4,
      display: 'flex', flexDirection: 'column',
      fontSize: Math.max(9, Math.round(width / 14)), position: 'relative', flexShrink: 0,
    }}>
      {coverImage ? (
        <img src={coverImage} alt="" style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '1.4em 1.2em' }}>
          <div style={{ textAlign: 'center' }}>
            {coverTitle && (
              <div style={{ color: '#fff', fontSize: '1.4em', fontWeight: 800, letterSpacing: '-0.01em', lineHeight: 1.4 }}>
                {coverTitle}
              </div>
            )}
          </div>
          {coverAuthor && (
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.95em', textAlign: 'right' }}>
              {coverAuthor}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

import { Download } from 'lucide-react'
import { styles } from '../theme'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import BookInfoFields from '../components/BookInfoFields'

export default function BookInfoPage({ app }) {
  const {
    t, messages, uploadedEpub, handleEpubUpload,
    title, setTitle, author, setAuthor, coverImage, setCoverImage,
    epubTitle, setEpubTitle, epubAuthor, setEpubAuthor, epubCoverImage, setEpubCoverImage,
    setPage, setCoverReturnTo, isGenerating, handleDownload,
  } = app
  const S = styles(t)
  const hasEbook = messages.length > 0 || !!uploadedEpub

  // 업로드한 epub을 편집 중이면 그쪽 상태를, 아니면 로그 변환 쪽 상태를 사용 — 서로 안 섞임
  const fields = uploadedEpub
    ? { title: epubTitle, setTitle: setEpubTitle, author: epubAuthor, setAuthor: setEpubAuthor, coverImage: epubCoverImage, setCoverImage: setEpubCoverImage }
    : { title, setTitle, author, setAuthor, coverImage, setCoverImage }

  if (!hasEbook) {
    return (
      <>
        <PageHeader title="책 정보 수정" desc="전자책의 제목 · 작가명 · 표지를 지정합니다" t={t} />
        <EmptyState
          t={t}
          onGoConvert={() => setPage('convert')}
          onUploadEpub={handleEpubUpload}
          desc={<>이미 만든 .epub 파일을 올리거나, 새로 로그를 변환해야 지정할 수 있습니다.<br />제목은 파일명에서 자동으로 채워집니다.</>}
        />
      </>
    )
  }

  return (
    <>
      <PageHeader title="책 정보 수정" desc="전자책의 제목 · 작가명 · 표지를 지정합니다" t={t} />

      {uploadedEpub && (
        <p style={{ fontSize: '0.78em', color: t.textSub, margin: '0 0 16px' }}>
          불러온 파일: <strong style={{ color: t.text }}>{uploadedEpub.fileName}</strong>
        </p>
      )}

      <BookInfoFields
        t={t} {...fields}
        onGoCoverGenerator={() => { setCoverReturnTo('bookinfo'); setPage('cover') }}
      />

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <button type="button" onClick={handleDownload} disabled={isGenerating} style={{
          ...S.btnPrimary, padding: '7px 16px', fontSize: '0.84em',
          opacity: isGenerating ? 0.5 : 1, cursor: isGenerating ? 'not-allowed' : 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}>
          {isGenerating ? '생성 중...' : <><Download size={14} />수정한 epub 다운로드</>}
        </button>
      </div>
    </>
  )
}

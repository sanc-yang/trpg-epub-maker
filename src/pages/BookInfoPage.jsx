import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import BookInfoFields from '../components/BookInfoFields'

export default function BookInfoPage({ app }) {
  const { t, messages, title, setTitle, author, setAuthor, coverImage, setCoverImage, setPage } = app

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

      <BookInfoFields
        t={t} title={title} setTitle={setTitle} author={author} setAuthor={setAuthor}
        coverImage={coverImage} setCoverImage={setCoverImage}
        onGoCoverGenerator={() => setPage('cover')}
      />
    </>
  )
}

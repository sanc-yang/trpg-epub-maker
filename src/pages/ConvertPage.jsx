import { useRef, useState } from 'react'
import { Book, FolderOpen, Check, BookOpen, Dices, Theater, Download, Clipboard } from 'lucide-react'
import { glass, styles } from '../theme'
import ToggleSwitch from '../components/ToggleSwitch'
import DropZone from '../components/DropZone'
import ZoomableImage from '../components/ZoomableImage'
import CopyChunksPopover from '../components/CopyChunksPopover'
import Spinner from '../components/Spinner'
import BookInfoFields from '../components/BookInfoFields'
import { MessageRow, CcfoliaMessageRow } from '../components/MessageRows'
import { annotate } from '../utils/annotateMessages'
import { generatePreviewHtml, messagesToBlogHtml } from '../utils/generateEpub'
import { compressBase64Img, copyHtmlToClipboard, downloadHtmlFile } from '../utils/htmlCopy'
import { SHOW_CCFOLIA_URL_MODE } from '../featureFlags'
import PageHeader from '../components/PageHeader'
import guideRoll20 from '../assets/guide-roll20.png'
import guideCcfolia from '../assets/guide-ccfolia.png'

const HTML_CHUNK_SIZE = 2000 // Roll20/코코포리아 HTML 복사 — 섹션당 메시지 수
const EBOOK_CHUNK_SIZE = 10000 // eBook HTML 복사 — 섹션당 메시지 수

// 복사/다운로드 HTML의 배경색. 흰색 그대로 두면 빈 페이지처럼 보여서
// Roll20 쪽도 코코포리아처럼 은은한 색을 깔아줌 (메시지 행 색상과는 구분되게)
const PREVIEW_BG = { roll20: '#f0f0f0', ccfolia: '#0e0e16' }

// 이미지 압축 시 투명 영역을 채울 배경색. 롤템플릿 등은 자체 스타일이라
// 파란(대사) 배경과 안 어울려서, 대사(data-dialogue) 행 안의 이미지만 파란색을
// 쓰고 나머지는 무난한 회색으로 채움
const IMG_BG_RESOLVERS = {
  roll20: (row) => (row.hasAttribute('data-dialogue') ? '#e8f4ff' : '#f5f5f5'),
  ccfolia: () => '#f5f5f5',
}
const DEFAULT_IMG_BG = { roll20: '#e8f4ff', ccfolia: '#f5f5f5' } // <style> img 기본값(투명 배경이 없다면 눈에 안 보임)

function getFilteredRows(elId, includeSadam) {
  const el = document.getElementById(elId)
  if (!el) return []
  return Array.from(el.children).filter(c => includeSadam || c.getAttribute('data-sadam') !== 'true')
}

// 아바타는 화면에 36~44px로만 보이므로 첨부 이미지보다 훨씬 작게 압축
const AVATAR_MAX = 96
const CONTENT_MAX = 400

// rows 안의 data: 이미지를 canvas로 압축해 outerHTML 문자열로 합침 (같은 이미지 중복 압축 방지)
// resolveImgBg(row): 그 행 안의 이미지에 채울 배경색을 정하는 함수
async function compressRowsToHtml(rows, resolveImgBg) {
  const keyToToken = new Map() // `${src}|${bg}` → token
  const tokenInfo = new Map() // token → { src, bg, isAvatar }

  rows.forEach(row => {
    const bg = resolveImgBg(row)
    row.querySelectorAll('img[src^="data:"]').forEach(img => {
      const src = img.getAttribute('src')
      const key = `${src}|${bg}`
      if (!keyToToken.has(key)) {
        const token = `__T${keyToToken.size}__`
        keyToToken.set(key, token)
        tokenInfo.set(token, { src, bg, isAvatar: img.hasAttribute('data-avatar') })
      }
    })
  })

  const toRestore = []
  rows.forEach(row => {
    const bg = resolveImgBg(row)
    row.querySelectorAll('img[src^="data:"]').forEach(img => {
      const src = img.getAttribute('src')
      toRestore.push([img, src])
      img.setAttribute('src', keyToToken.get(`${src}|${bg}`))
    })
  })

  const inner = rows.map(c => c.outerHTML).join('')
  toRestore.forEach(([img, src]) => img.setAttribute('src', src))

  const tokenToCompressed = new Map()
  await Promise.all([...tokenInfo.entries()].map(async ([token, { src, bg, isAvatar }]) => {
    const max = isAvatar ? AVATAR_MAX : CONTENT_MAX
    tokenToCompressed.set(token, await compressBase64Img(src, 0.72, bg, max, max))
  }))
  let finalInner = inner
  tokenToCompressed.forEach((compressed, token) => { finalInner = finalInner.replaceAll(token, compressed) })
  return finalInner
}

// Roll20/코코포리아 미리보기 DOM → 클립보드용 HTML 조각 (이미지 압축 포함, 섹션 단위)
async function copyPreviewChunk({ elId, chunkIndex, includeSadam, templateCss, bgColor, mode }) {
  const rows = getFilteredRows(elId, includeSadam)
  const slice = rows.slice(chunkIndex * HTML_CHUNK_SIZE, (chunkIndex + 1) * HTML_CHUNK_SIZE)
  const finalInner = await compressRowsToHtml(slice, IMG_BG_RESOLVERS[mode])
  const html = `<style>img{background-color:${DEFAULT_IMG_BG[mode]}!important;max-width:100%!important}${templateCss || ''}</style><div style="background:${bgColor};padding:8px;">${finalInner}</div>`
  await copyHtmlToClipboard(html)
}

// Roll20/코코포리아 로그 전체 → 청크 없이 통짜 HTML 문서 파일로 다운로드 (PDF처럼 한 문서로 보는 용도)
async function downloadPreviewHtml({ elId, includeSadam, templateCss, bgColor, mode, title }) {
  const rows = getFilteredRows(elId, includeSadam)
  const finalInner = await compressRowsToHtml(rows, IMG_BG_RESOLVERS[mode])
  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>
*{box-sizing:border-box;}
html,body{margin:0;width:100%;max-width:100%;overflow-x:hidden;}
body{background:${bgColor};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}
img{background-color:${DEFAULT_IMG_BG[mode]}!important;max-width:100%!important}
${templateCss || ''}
</style>
</head>
<body>
<div style="max-width:820px;margin:0 auto;padding:8px;background:${bgColor};">${finalInner}</div>
</body>
</html>`
  downloadHtmlFile(html, title)
}

const STAT_ROWS = {
  roll20: (s, t) => [
    ['전체', s.total, t.text],
    ['대사', s.general, '#3b82f6'], ['사담', s.sadam, t.textSub],
    ['숨김굴림', s.hidden, '#ef4444'], ['귓속말', s.whisper, '#eab308'],
    ['GM 지문', s.desc, '#22c55e'], ['GM 특수', s.emote, '#f97316'],
  ],
  ccfolia: (s, t) => [
    ['전체', s.total, t.text], ['일반', s.general, '#3b82f6'],
    ['사담', s.sadam, t.textSub], ['비밀', s.hidden, '#ef4444'],
  ],
}

export default function ConvertPage({ app }) {
  const {
    t, toast, source, switchSource, ccfoliaMode, setCcfoliaMode,
    roomInput, setRoomInput, isFetching, fetchCount, handleFetchCcfolia,
    handleFileDrop, clearLog, fileName, stats, isParsing, messages, messagesWithAvatars,
    selectedMode, setSelectedMode,
    includeSadam, setIncludeSadam, bodyFont,
    title, setTitle, author, setAuthor, coverImage, setCoverImage, setPage, setCoverReturnTo,
    templateCss, isGenerating, handleDownload,
    setShowAvatarManager, hideAvatarArea, setHideAvatarArea,
  } = app

  const S = styles(t)
  const G = glass(t)
  const modeRef = useRef(null)

  // HTML 복사 팝오버 — 'epub' | 'roll20' | 'ccfolia' | null
  const [copyPopover, setCopyPopover] = useState(null)
  // 모드 선택 카드 hover — 'epub' | 'roll20' | 'ccfolia' | null
  const [hoverMode, setHoverMode] = useState(null)

  const handleCopyEbookChunk = async (i) => {
    const filtered = messagesWithAvatars.filter(m => includeSadam || !m.isSadam)
    const slice = filtered.slice(i * EBOOK_CHUNK_SIZE, (i + 1) * EBOOK_CHUNK_SIZE)
    const html = `<style>${templateCss || ''}</style>${messagesToBlogHtml(slice, true, bodyFont)}`
    await copyHtmlToClipboard(html)
    toast(`eBook HTML 섹션 ${i + 1} 복사 완료!`)
  }

  const handleCopyPreviewChunk = async (mode, i) => {
    await copyPreviewChunk({
      elId: mode === 'roll20' ? 'roll20-preview-msgs' : 'ccfolia-preview-msgs',
      chunkIndex: i, includeSadam, templateCss,
      bgColor: PREVIEW_BG[mode], mode,
    })
    toast(`섹션 ${i + 1} 복사 완료!`)
  }

  // HTML 다운로드 — 청크 없이 전체를 한 문서로 (PDF처럼 통짜로 보는 용도)
  const [downloadingHtml, setDownloadingHtml] = useState(null) // null | 'roll20' | 'ccfolia'
  const handleDownloadPreviewHtml = async (mode) => {
    if (downloadingHtml) return
    setDownloadingHtml(mode)
    try {
      await downloadPreviewHtml({
        elId: mode === 'roll20' ? 'roll20-preview-msgs' : 'ccfolia-preview-msgs',
        includeSadam, templateCss,
        bgColor: PREVIEW_BG[mode], mode,
        title: `${title || fileName.replace(/\.(html|zip)$/i, '')} - ${mode === 'roll20' ? 'Roll20' : '코코포리아'}`,
      })
      toast('HTML 다운로드 완료!')
    } finally {
      setDownloadingHtml(null)
    }
  }

  // 코코포리아 방 입력 유효성
  const roomTrimmed = roomInput.trim()
  const roomUrlValid = /ccfolia\.com\/rooms\/[a-zA-Z0-9_-]{4,}/.test(roomTrimmed)
  const roomIdValid = /^[a-zA-Z0-9_-]{4,}$/.test(roomTrimmed)
  const roomValid = roomUrlValid || roomIdValid
  const roomInvalidMsg = roomTrimmed.length > 0 && !roomValid

  const previewRows = annotate(messagesWithAvatars, includeSadam)

  return (
    <>
      <PageHeader title="로그 변환" desc="세션 로그를 올리고 어떤 형식으로 볼지 고릅니다" t={t} />

      {/* 플랫폼 탭 */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${t.border}`, marginBottom: 24 }}>
        {[['roll20', 'Roll20'], ['ccfolia', '코코포리아']].map(([key, label]) => (
          <button key={key} type="button" onClick={() => switchSource(key)} style={{
            background: 'none', border: 'none',
            borderBottom: source === key ? `2px solid ${t.text}` : '2px solid transparent',
            marginBottom: -1, padding: '8px 22px 10px',
            fontWeight: source === key ? 600 : 400,
            color: source === key ? t.text : t.textSub,
            fontSize: '0.9em', cursor: 'pointer', fontFamily: 'inherit',
            transition: 'color 0.15s',
          }}>
            {label}
          </button>
        ))}
      </div>

      {/* 코코포리아 입력 방식 — URL 모드가 숨김이면 선택 UI 자체를 감춤 */}
      {source === 'ccfolia' && SHOW_CCFOLIA_URL_MODE && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {[['url', 'URL로 가져오기'], ['html', 'HTML 업로드']].map(([key, label]) => (
              <button key={key} type="button" onClick={() => setCcfoliaMode(key)} style={{
                ...S.btnSecondary,
                background: ccfoliaMode === key ? t.accent : t.surface,
                color: ccfoliaMode === key ? t.accentFg : t.textSub,
                border: `1px solid ${ccfoliaMode === key ? t.accent : t.border}`,
                fontWeight: ccfoliaMode === key ? 600 : 400,
              }}>{label}</button>
            ))}
          </div>
          {ccfoliaMode === 'url' && (
            <div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <input
                  value={roomInput} onChange={e => setRoomInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && roomValid && handleFetchCcfolia()}
                  placeholder="방 URL 또는 방 ID (예: https://ccfolia.com/rooms/abc123)"
                  style={{ ...S.input, flex: 1, minWidth: 200, borderColor: roomInvalidMsg ? '#ef4444' : t.inputBorder }}
                  disabled={isFetching}
                />
                <button type="button" onClick={handleFetchCcfolia} disabled={isFetching || !roomValid} style={{
                  ...S.btnPrimary, opacity: (isFetching || !roomValid) ? 0.5 : 1,
                  cursor: (isFetching || !roomValid) ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                }}>
                  {isFetching ? `수집 중... (${fetchCount}건)` : '가져오기'}
                </button>
              </div>
              {roomTrimmed.length > 0 && (
                <div style={{ fontSize: '0.78em', marginTop: 6, color: roomValid ? '#22c55e' : '#ef4444', display: 'flex', alignItems: 'center', gap: 4 }}>
                  {roomValid
                    ? <><Check size={12} /> 유효한 {roomUrlValid ? 'URL' : '방 ID'}입니다</>
                    : <span>유효한 ccfolia URL 또는 방 ID를 입력해주세요</span>}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 드롭존 */}
      {(source === 'roll20' || ccfoliaMode === 'html') && (
        <DropZone
          t={t} onFile={handleFileDrop} inputId="fileInput"
          accept={source === 'roll20' ? '.zip' : '.html'}
          style={{ marginBottom: 24 }}
          onClear={fileName ? clearLog : undefined}
          icon={fileName
            ? null
            : <FolderOpen size={26} strokeWidth={1.5} color={t.textSub} style={{ margin: '0 auto 9px', display: 'block' }} />}
        >
          {fileName
            ? <span style={{ color: t.text, fontWeight: 600, fontSize: '1.02em', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Book size={15} /> {fileName}</span>
            : (source === 'roll20' ? 'Roll20 ZIP 파일 드롭 또는 클릭' : '코코포리아 HTML 파일 드롭 또는 클릭')}
        </DropZone>
      )}

      {/* 로그 추출 가이드 — 아직 아무것도 안 올라간 상태에서만 노출, 드롭존과 같은 폭 */}
      {!fileName && !stats && (
        <div style={{ marginBottom: 24 }}>
          <ZoomableImage
            t={t}
            src={source === 'roll20' ? guideRoll20 : guideCcfolia}
            alt={source === 'roll20' ? 'Roll20 로그 추출 가이드' : '코코포리아 로그 추출 가이드'}
          />
        </div>
      )}

      {source === 'ccfolia' && SHOW_CCFOLIA_URL_MODE && ccfoliaMode === 'url' && fileName && (
        <p style={{ fontSize: '0.84em', color: t.textSub, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 5 }}>
          <Check size={13} /> {fileName} 수집 완료
        </p>
      )}

      {/* 통계 */}
      {stats && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 26 }}>
          {(STAT_ROWS[source] || STAT_ROWS.roll20)(stats, t).map(([label, count, color]) => (
            <span key={label} style={{
              ...G, borderRadius: 20, padding: '4px 12px', fontSize: '0.78em',
              display: 'inline-flex', alignItems: 'center', gap: 5,
            }}>
              <strong style={{ color, fontWeight: 700 }}>{count}</strong>
              <span style={{ color: t.textSub }}>{label}</span>
            </span>
          ))}
        </div>
      )}

      {/* 파싱 중 */}
      {isParsing && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0 24px', color: t.textSub, fontSize: '0.9em' }}>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          <div style={{ width: 16, height: 16, border: `2px solid ${t.borderSub}`, borderTopColor: t.textSub, borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
          로그 변환 준비 중 ...
        </div>
      )}

      {/* 모드 선택 */}
      {!isParsing && messages.length > 0 && (
        <div style={{ marginBottom: 30 }} ref={modeRef}>
          <p style={{ fontSize: '0.85em', color: t.textSub, margin: '0 0 14px' }}>
            로그 변환 준비 완료. 어떤 형식으로 작업을 원하세요?
          </p>
          {source === 'ccfolia' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => setShowAvatarManager(true)} style={{
                ...S.btnSecondary, padding: '5px 14px', fontSize: '0.82em',
              }}>
                프로필 인장 관리
              </button>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82em', color: t.textSub, cursor: 'pointer', userSelect: 'none' }}>
                <input type="checkbox" checked={hideAvatarArea} onChange={e => setHideAvatarArea(e.target.checked)} style={{ accentColor: t.accent, cursor: 'pointer' }} />
                인장 영역 제거
              </label>
            </div>
          )}
          <div className="mode-grid">
            {[
              ['epub', BookOpen, 'eBook 스타일'],
              ['roll20', Dices, 'Roll20 스타일'],
              ['ccfolia', Theater, '코코포리아 스타일'],
            ].map(([mode, Icon, label]) => {
              const isSelected = selectedMode === mode
              const isHover = hoverMode === mode && !isSelected
              return (
              <button key={mode} type="button"
                onClick={() => {
                  setSelectedMode(prev => prev === mode ? null : mode)
                  setTimeout(() => modeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
                }}
                onMouseEnter={() => setHoverMode(mode)}
                onMouseLeave={() => setHoverMode(null)}
                style={{
                  ...G,
                  background: isSelected ? t.accent : (isHover ? t.hover : t.glass),
                  color: isSelected ? t.accentFg : t.text,
                  border: `1px solid ${isSelected ? t.accent : (isHover ? t.text : t.glassBorder)}`,
                  borderRadius: 16, padding: '15px 12px', cursor: 'pointer',
                  fontFamily: 'inherit', transition: 'all 0.2s',
                  fontSize: '0.82em', fontWeight: isSelected ? 600 : 400,
                  transform: isHover ? 'translateY(-2px)' : 'none',
                  boxShadow: isHover ? '0 6px 18px rgba(0,0,0,0.12)' : G.boxShadow,
                }}
              >
                <Icon size={19} strokeWidth={1.5} className="mode-icon" />
                <span>{label}</span>
              </button>
              )
            })}
          </div>
        </div>
      )}

      {/* eBook 패널 */}
      {selectedMode === 'epub' && (
        <>
          <div style={{ marginBottom: 16 }}>
            <BookInfoFields
              t={t} title={title} setTitle={setTitle} author={author} setAuthor={setAuthor}
              coverImage={coverImage} setCoverImage={setCoverImage}
              onGoCoverGenerator={() => { setCoverReturnTo('convert'); setPage('cover') }}
            />
          </div>
          <div style={{ ...G, borderRadius: 16, overflow: 'hidden', marginBottom: 30 }}>
          <div className="panel-bar" style={{ background: t.glass, borderBottom: `1px solid ${t.glassBorder}` }}>
            <span style={{ fontSize: '0.78em', color: t.textSub }}>eBook 본문 미리보기</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <ToggleSwitch checked={includeSadam} onChange={setIncludeSadam} label="사담 포함" labelColor={t.textSub} offColor={t.borderSub} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                <div style={{ position: 'relative' }}>
                  <button type="button" onClick={() => setCopyPopover(v => v === 'epub' ? null : 'epub')} style={{
                    ...S.btnSecondary, padding: '5px 14px', fontSize: '0.82em',
                    display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
                  }}>
                    <Clipboard size={13} />HTML 복사
                  </button>
                  {copyPopover === 'epub' && (
                    <CopyChunksPopover
                      label={`eBook · ${messagesWithAvatars.filter(m => includeSadam || !m.isSadam).length}개 메시지`}
                      chunkCount={Math.ceil(messagesWithAvatars.filter(m => includeSadam || !m.isSadam).length / EBOOK_CHUNK_SIZE) || 1}
                      onCopyChunk={handleCopyEbookChunk}
                      onClose={() => setCopyPopover(null)}
                      accent={t.accent} accentFg={t.accentFg}
                    />
                  )}
                </div>
                <button type="button" onClick={handleDownload} disabled={isGenerating} style={{
                  ...S.btnPrimary, padding: '5px 14px', fontSize: '0.82em',
                  opacity: isGenerating ? 0.5 : 1, cursor: isGenerating ? 'not-allowed' : 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
                }}>
                  {isGenerating ? '생성 중...' : <><Download size={13} />epub 다운로드</>}
                </button>
              </div>
            </div>
          </div>
          <iframe
            srcDoc={generatePreviewHtml(messagesWithAvatars, { title, includeSadam, templateCss, bodyFont })}
            style={{ width: '100%', height: 600, border: 'none', background: '#fff' }}
            title="eBook 본문 미리보기"
          />
          </div>
        </>
      )}

      {/* Roll20 / 코코포리아 스타일 패널 */}
      {(selectedMode === 'roll20' || selectedMode === 'ccfolia') && (() => {
        const isR20 = selectedMode === 'roll20'
        const Row = isR20 ? MessageRow : CcfoliaMessageRow
        return (
          <div style={{ ...G, borderRadius: 16, overflow: 'hidden', marginBottom: 30 }}>
            {!isR20 && <style>{`#ccfolia-preview-msgs img { background: #f5f5f5; }`}</style>}
            <div className="panel-bar" style={{ background: t.glass, borderBottom: `1px solid ${t.glassBorder}` }}>
              <span style={{ fontSize: '0.78em', color: t.textSub }}>
                {isR20 ? 'Roll20' : '코코포리아'} 스타일 미리보기
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <ToggleSwitch checked={includeSadam} onChange={setIncludeSadam} label="사담 포함" labelColor={t.textSub} offColor={t.borderSub} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                  <div style={{ position: 'relative' }}>
                    <button type="button" onClick={() => setCopyPopover(v => v === selectedMode ? null : selectedMode)} style={{
                      ...S.btnSecondary, padding: '5px 14px', fontSize: '0.82em',
                      display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
                    }}>
                      <Clipboard size={13} />HTML 복사
                    </button>
                    {copyPopover === selectedMode && (() => {
                      const total = previewRows.length
                      return (
                        <CopyChunksPopover
                          label={`${isR20 ? 'Roll20' : '코코포리아'} · ${total}개 메시지`}
                          chunkCount={Math.ceil(total / HTML_CHUNK_SIZE) || 1}
                          onCopyChunk={(i) => handleCopyPreviewChunk(selectedMode, i)}
                          onClose={() => setCopyPopover(null)}
                          accent={t.accent} accentFg={t.accentFg}
                        />
                      )
                    })()}
                  </div>
                  <button type="button" onClick={() => handleDownloadPreviewHtml(selectedMode)} disabled={!!downloadingHtml} style={{
                    ...S.btnPrimary, padding: '5px 14px', fontSize: '0.82em',
                    opacity: downloadingHtml ? 0.5 : 1, cursor: downloadingHtml ? 'not-allowed' : 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
                  }}>
                    {downloadingHtml === selectedMode
                      ? <><Spinner size={13} color={t.accentFg} />다운로드 중...</>
                      : <><Download size={13} />HTML 다운로드</>}
                  </button>
                </div>
              </div>
            </div>
            <div
              id={isR20 ? 'roll20-preview-msgs' : 'ccfolia-preview-msgs'}
              style={{
                maxHeight: 600, overflowY: 'auto', overflowX: 'hidden',
                background: isR20 ? '#fff' : '#0e0e16', color: isR20 ? '#1c1c1e' : undefined,
              }}
            >
              {previewRows.map(({ msg, isContinuation, isLastInGroup }, i) => (
                <Row key={msg.id || i} msg={msg} isContinuation={isContinuation} isLastInGroup={isLastInGroup} hideAvatar={hideAvatarArea} />
              ))}
            </div>
          </div>
        )
      })()}
    </>
  )
}

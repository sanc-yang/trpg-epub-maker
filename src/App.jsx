import { useState, useCallback } from 'react'
import JSZip from 'jszip'
import { parseRoll20Html } from './utils/parseRoll20'
import { fetchCcfoliaLog, parseCcfoliaHtml, extractRoomId } from './utils/parseCcfolia'
import { generateEpub, generatePreviewHtml } from './utils/generateEpub'
import './App.css'

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'])
const MIME_MAP = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp' }

const TYPE_COLOR = {
  general: '#e8f4ff',
  hidden: '#fff0f0',
  whisper: '#ffffc0',
  desc: '#f0fff0',
  emote: '#fde8d4',
  template: '#e8f4ff',
  rollresult: '#e8f4ff',
}

// ─── Roll20 스타일 메시지 행 ─────────────────────────────────────
const AVATAR_SIZE = 36

const R20_BORDER = '1px solid rgba(0,0,0,0.06)'

function MessageRow({ msg, isContinuation, isLastInGroup }) {
  const isCentered = msg.type === 'desc' || msg.type === 'emote'

  // desc / emote: 아바타 없이 원래 스타일 유지
  if (isCentered) {
    const isDesc = msg.type === 'desc'
    return (
      <div style={{
        background: isDesc ? 'rgba(0,0,0,0.04)' : (TYPE_COLOR[msg.type] || '#fff'),
        padding: '6px 10px 6px ' + (AVATAR_SIZE + 18) + 'px',
        textAlign: 'center',
        color: isDesc ? '#000' : '#8b4b1a',
        borderBottom: isLastInGroup ? R20_BORDER : 'none',
      }}>
        {msg.content && (
          <span style={{ fontStyle: 'italic', fontWeight: 'bold' }}
            dangerouslySetInnerHTML={{ __html: msg.content }} />
        )}
      </div>
    )
  }

  const bg = TYPE_COLOR[msg.type] || '#fff'
  const isSadam = msg.isSadam

  const contentBlock = (
    <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
      {!isContinuation && msg.speaker && (
        <div style={{ fontWeight: 'bold', fontSize: '0.85em', marginBottom: 2, color: '#333' }}>
          {msg.speaker}
        </div>
      )}
      {msg.type === 'template' && (
        <div dangerouslySetInnerHTML={{ __html: msg.templateHtml }} />
      )}
      {msg.type === 'rollresult' && (
        <>
          {msg.formula && <div style={{ fontSize: '0.82em', color: '#666' }}>{msg.formula}</div>}
          {msg.formattedHtml && <div dangerouslySetInnerHTML={{ __html: msg.formattedHtml }} />}
          {msg.rolled && <div style={{ fontWeight: 'bold' }}>= {msg.rolled}</div>}
        </>
      )}
      {msg.content && msg.type !== 'template' && msg.type !== 'rollresult' && (
        <span dangerouslySetInnerHTML={{ __html: msg.content }} />
      )}
    </div>
  )

  // 사담: 아바타 컬럼 없이 들여쓰기만
  if (isSadam) {
    return (
      <div style={{
        padding: `${isContinuation ? 2 : 6}px 10px ${isContinuation ? 2 : 6}px ${AVATAR_SIZE + 18}px`,
        background: 'rgba(0,0,0,0.04)',
        opacity: 0.75,
        fontSize: '0.9em',
        borderBottom: isLastInGroup ? R20_BORDER : 'none',
      }}>
        {contentBlock}
      </div>
    )
  }

  // 일반: 아바타 컬럼 있음, iconUrl 없으면 빈 공간만
  return (
    <div style={{
      display: 'flex',
      gap: 10,
      padding: isContinuation ? '2px 10px' : '6px 10px',
      background: bg,
      borderBottom: isLastInGroup ? R20_BORDER : 'none',
    }}>
      <div style={{ width: AVATAR_SIZE, flexShrink: 0 }}>
        {!isContinuation && msg.iconUrl && (
          <div style={{
            width: AVATAR_SIZE, height: AVATAR_SIZE,
            borderRadius: 4, overflow: 'hidden',
            background: '#d8d8d8',
          }}>
            <img src={msg.iconUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none' }} />
          </div>
        )}
      </div>
      {contentBlock}
    </div>
  )
}

// ─── 입력 공통 스타일 ────────────────────────────────────────────
const INP = { width: '100%', padding: '7px 10px', borderRadius: 4, border: '1px solid #ddd', fontSize: '0.9em', boxSizing: 'border-box', background: '#fff' }
const LBL = { fontSize: '0.8em', color: '#888', marginBottom: 4, display: 'block' }
const FIELD = { marginBottom: 12 }

// ─── 표지 미리보기 컴포넌트 ─────────────────────────────────────
function CoverPreview({ coverImage, coverTitle, catchPhrase, synopsis }) {
  return (
    <div style={{
      width: 140, height: 210, background: '#000', overflow: 'hidden', borderRadius: 4,
      display: 'flex', flexDirection: 'column',
      justifyContent: coverImage ? 'flex-start' : 'center',
      fontSize: 10,
    }}>
      {coverImage && (
        <img src={coverImage} alt="" style={{ display: 'block', width: '100%', maxHeight: '58%', objectFit: 'cover', flexShrink: 0 }} />
      )}
      <div style={{ padding: '1em 1.2em', textAlign: 'center' }}>
        {coverTitle && (
          <div style={{ color: '#fff', fontFamily: 'Georgia, serif', fontSize: '1.4em', fontWeight: 'bold', letterSpacing: '0.06em', marginBottom: '0.35em', lineHeight: 1.4 }}>
            {coverTitle}
          </div>
        )}
        {catchPhrase && (
          <div style={{ color: '#fff', fontSize: '1.1em', fontWeight: 300, letterSpacing: '0.05em', lineHeight: 1.8, marginBottom: '0.3em', opacity: 0.75, whiteSpace: 'pre-line' }}>
            {catchPhrase}
          </div>
        )}
        {synopsis && (
          <div style={{ color: '#fff', fontSize: '0.95em', lineHeight: 1.8, marginTop: '0.8em', textAlign: 'left', opacity: 0.88, whiteSpace: 'pre-line' }}>
            {synopsis}
          </div>
        )}
      </div>
    </div>
  )
}

const CC_BORDER = '1px solid rgba(255,255,255,0.03)'

// ─── 코코포리아 스타일 메시지 행 ─────────────────────────────────
function CcfoliaMessageRow({ msg, isContinuation, isLastInGroup }) {
  const AVATAR_W = 44

  // desc/emote: 아바타 없이 중앙 정렬 GM 지문
  if (msg.type === 'desc' || msg.type === 'emote') {
    return (
      <div style={{
        padding: '8px 14px',
        textAlign: 'center',
        color: msg.type === 'emote' ? '#ffa040' : '#ddd',
        fontStyle: 'italic',
        fontWeight: 'bold',
        fontSize: '0.85em',
        lineHeight: 1.65,
        borderBottom: isLastInGroup ? CC_BORDER : 'none',
        background: 'rgba(255,255,255,0.02)',
      }}>
        <span dangerouslySetInnerHTML={{ __html: msg.content }} />
      </div>
    )
  }

  // type별 본문 블록
  let contentBlock
  if (msg.type === 'template') {
    contentBlock = (
      <div style={{ background: '#f5f5f5', borderRadius: 4, overflow: 'hidden' }}>
        <div dangerouslySetInnerHTML={{ __html: msg.templateHtml }} />
      </div>
    )
  } else if (msg.type === 'rollresult') {
    contentBlock = (
      <div style={{
        background: 'rgba(255,255,255,0.05)', borderRadius: 6,
        padding: '6px 10px', display: 'inline-block',
      }}>
        {msg.formula && <div style={{ fontSize: '0.75em', color: '#888', marginBottom: 3 }}>{msg.formula}</div>}
        {msg.formattedHtml && <div dangerouslySetInnerHTML={{ __html: msg.formattedHtml }} />}
        {msg.rolled && <div style={{ fontWeight: 'bold', color: '#ffd080', fontSize: '1.1em' }}>= {msg.rolled}</div>}
      </div>
    )
  } else {
    contentBlock = (
      <div style={{
        color: '#d4d4d4',
        fontSize: msg.isSadam ? '0.8em' : '0.88em',
        lineHeight: 1.65,
        wordBreak: 'break-word',
        whiteSpace: 'pre-wrap',
        textAlign: 'left',
      }}
        dangerouslySetInnerHTML={{ __html: msg.content }}
      />
    )
  }

  return (
    <div style={{
      display: 'flex',
      gap: 10,
      padding: isContinuation ? '2px 14px' : '10px 14px 6px',
      background: msg.isSadam ? 'rgba(255,255,255,0.08)' : 'transparent',
      opacity: msg.isSadam ? 0.7 : 1,
      borderBottom: isLastInGroup ? CC_BORDER : 'none',
    }}>
      {/* 아바타 자리 */}
      <div style={{ width: AVATAR_W, flexShrink: 0 }}>
        {!isContinuation && (
          <div style={{
            width: AVATAR_W, height: AVATAR_W,
            borderRadius: 6, overflow: 'hidden',
            background: '#2a2a3a',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {msg.iconUrl
              ? <img src={msg.iconUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none' }} />
              : msg.speaker === 'GM'
                ? <span style={{ color: '#fff', fontWeight: 700, fontSize: '0.85em' }}>GM</span>
                : null
            }
          </div>
        )}
      </div>

      {/* 본문 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {!isContinuation && (
          <div style={{ marginBottom: 3, display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ color: msg.charColor || '#7eb8d4', fontWeight: 'bold', fontSize: '0.88em' }}>
              {msg.speaker || '(이름 없음)'}
            </span>
            {msg.isSadam && (
              <span style={{ color: '#666', fontSize: '0.7em', border: '1px solid #3a3a3a', borderRadius: 3, padding: '0 4px' }}>사담</span>
            )}
            {msg.type === 'hidden' && (
              <span style={{ color: '#c06060', fontSize: '0.7em', border: '1px solid #553333', borderRadius: 3, padding: '0 4px' }}>숨김</span>
            )}
            {msg.type === 'whisper' && (
              <span style={{ color: '#b8a800', fontSize: '0.7em', border: '1px solid #554400', borderRadius: 3, padding: '0 4px' }}>귓속말</span>
            )}
          </div>
        )}
        {contentBlock}
      </div>
    </div>
  )
}

// ─── 사담 토글 스위치 ───────────────────────────────────────────
function ToggleSwitch({ checked, onChange, label }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none', fontSize: '0.85em', color: '#555' }}>
      <div
        onClick={() => onChange(!checked)}
        style={{
          width: 36, height: 20, borderRadius: 10,
          background: checked ? '#2c5f2e' : '#ccc',
          position: 'relative', transition: 'background 0.2s',
          flexShrink: 0,
        }}
      >
        <div style={{
          width: 16, height: 16, borderRadius: '50%',
          background: '#fff', position: 'absolute',
          top: 2, left: checked ? 18 : 2,
          transition: 'left 0.2s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }} />
      </div>
      {label}
    </label>
  )
}

// ─── 토글 버튼 공통 스타일 ───────────────────────────────────────
function PreviewTab({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      background: active ? '#4a4a4a' : '#f0f0f0',
      color: active ? '#fff' : '#333',
      border: '1px solid #ccc',
      borderRadius: 6,
      padding: '7px 16px',
      fontSize: '0.85em',
      fontWeight: active ? 'bold' : 'normal',
      cursor: 'pointer',
    }}>
      {children}
    </button>
  )
}

// ─── 메인 앱 ────────────────────────────────────────────────────
export default function App() {
  const [messages, setMessages] = useState([])
  const [templateCss, setTemplateCss] = useState('')
  const [fileName, setFileName] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [stats, setStats] = useState(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [includeSadam, setIncludeSadam] = useState(true)

  // 메타데이터 / 표지
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [coverImage, setCoverImage] = useState(null)
  const [catchPhrase, setCatchPhrase] = useState('')
  const [synopsis, setSynopsis] = useState('')

  // 모드 선택: null | 'epub' | 'roll20' | 'ccfolia'
  const [selectedMode, setSelectedMode] = useState(null)
  const [isParsing, setIsParsing] = useState(false)

  // 플랫폼 선택
  const [source, setSource] = useState('roll20') // 'roll20' | 'ccfolia'
  const [ccfoliaMode, setCcfoliaMode] = useState('url') // 'html' | 'url'
  const [roomInput, setRoomInput] = useState('')
  const [isFetching, setIsFetching] = useState(false)
  const [fetchCount, setFetchCount] = useState(0)

  // ─── 파싱 결과 → 상태 반영 ────────────────────────────────────
  const applyParsedResult = useCallback(({ messages: parsed, templateCss: css }, name, isRoll20 = true) => {
    setIsParsing(false)
    setSelectedMode(null)
    setFileName(name)
    const base = name.replace(/\.(html|zip)$/i, '')
    setTitle(base)
    setMessages(parsed)
    setTemplateCss(css || '')
    if (isRoll20) {
      setStats({
        total: parsed.length,
        general: parsed.filter(m => m.type === 'general' && !m.isSadam).length,
        sadam: parsed.filter(m => m.isSadam).length,
        hidden: parsed.filter(m => m.type === 'hidden').length,
        whisper: parsed.filter(m => m.type === 'whisper').length,
        desc: parsed.filter(m => m.type === 'desc').length,
        emote: parsed.filter(m => m.type === 'emote').length,
        template: parsed.filter(m => m.type === 'template').length,
      })
    } else {
      setStats({
        total: parsed.length,
        general: parsed.filter(m => m.type === 'general' && !m.isSadam).length,
        sadam: parsed.filter(m => m.isSadam).length,
        hidden: parsed.filter(m => m.type === 'hidden').length,
        desc: 0, emote: 0, template: 0,
      })
    }
  }, [])

  // ─── Roll20 HTML 처리 ────────────────────────────────────────
  const processRoll20Html = useCallback(async (htmlText, name, localImageMap) => {
    const result = await parseRoll20Html(htmlText, localImageMap)
    applyParsedResult(result, name, true)
  }, [applyParsedResult])

  const handleRoll20File = useCallback((file) => {
    if (!file) return
    setIsParsing(true)
    if (file.name.endsWith('.zip')) {
      file.arrayBuffer().then(async (buffer) => {
        const zip = await JSZip.loadAsync(buffer)
        let htmlText = null, htmlName = ''
        for (const [path, entry] of Object.entries(zip.files)) {
          if (!entry.dir && path.endsWith('.html') && !path.includes('/')) {
            htmlText = await entry.async('text')
            htmlName = path
            break
          }
        }
        if (!htmlText) { alert('ZIP에서 HTML 로그 파일을 찾을 수 없습니다.'); return }
        const localImageMap = {}
        await Promise.all(
          Object.entries(zip.files)
            .filter(([path, entry]) => {
              if (entry.dir) return false
              const ext = path.split('.').pop().toLowerCase()
              return IMAGE_EXTS.has(ext)
            })
            .map(async ([path, entry]) => {
              const ext = path.split('.').pop().toLowerCase()
              const mime = MIME_MAP[ext] || 'image/png'
              const b64 = await entry.async('base64')
              localImageMap[path] = `data:${mime};base64,${b64}`
            })
        )
        await processRoll20Html(htmlText, htmlName, localImageMap)
      })
      return
    }
    if (!file.name.endsWith('.html')) return
    const reader = new FileReader()
    reader.onload = async (e) => { await processRoll20Html(e.target.result, file.name, {}) }
    reader.readAsText(file, 'utf-8')
  }, [processRoll20Html])

  // ─── 코코포리아 HTML 처리 ──────────────────────────────────
  const handleCcfoliaFile = useCallback((file) => {
    if (!file || !file.name.endsWith('.html')) return
    setIsParsing(true)
    const reader = new FileReader()
    reader.onload = async (e) => {
      const result = await parseCcfoliaHtml(e.target.result)
      if (result.parseError) {
        alert(result.parseError)
        return
      }
      applyParsedResult(result, file.name, false)
    }
    reader.readAsText(file, 'utf-8')
  }, [applyParsedResult])

  // ─── 코코포리아 URL 수집 ───────────────────────────────────
  const handleFetchCcfolia = useCallback(async () => {
    if (!roomInput.trim() || isFetching) return
    setIsFetching(true)
    setIsParsing(true)
    setFetchCount(0)
    try {
      const roomId = extractRoomId(roomInput)
      const result = await fetchCcfoliaLog(roomId, (count) => setFetchCount(count))
      applyParsedResult(result, roomId, false)
    } catch (err) {
      alert(`가져오기 실패: ${err.message}`)
    } finally {
      setIsFetching(false)
    }
  }, [roomInput, isFetching, applyParsedResult])

  // ─── 드롭존 공통 ──────────────────────────────────────────
  const handleFileDrop = useCallback((file) => {
    if (source === 'roll20') handleRoll20File(file)
    else handleCcfoliaFile(file)
  }, [source, handleRoll20File, handleCcfoliaFile])

  const onDrop = useCallback((e) => {
    e.preventDefault(); setIsDragging(false)
    handleFileDrop(e.dataTransfer.files[0])
  }, [handleFileDrop])
  const onDragOver = (e) => { e.preventDefault(); setIsDragging(true) }
  const onDragLeave = () => setIsDragging(false)
  const onInputChange = (e) => handleFileDrop(e.target.files[0])

  const onCoverChange = useCallback((e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setCoverImage(ev.target.result)
    reader.readAsDataURL(file)
  }, [])

  const handleDownload = useCallback(async () => {
    if (!messages.length || isGenerating) return
    setIsGenerating(true)
    try {
      const blob = await generateEpub(messages, {
        title, author, coverImage,
        coverTitle: title,
        catchPhrase, synopsis,
        includeSadam, templateCss,
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${title || fileName.replace(/\.(html|zip)$/i, '')}.epub`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setIsGenerating(false)
    }
  }, [messages, title, author, coverImage, catchPhrase, synopsis, fileName, isGenerating, includeSadam, templateCss])

  // ─── PDF 다운로드 ─────────────────────────────────────────────
  const handlePdf = useCallback((mode) => {
    const id = mode === 'roll20' ? 'roll20-preview-msgs' : 'ccfolia-preview-msgs'
    const el = document.getElementById(id)
    if (!el) return

    const bgColor = mode === 'ccfolia' ? '#0e0e16' : '#fff'

    // 스크롤 제한 임시 해제
    const origMax = el.style.maxHeight
    const origOverflow = el.style.overflowY
    el.style.maxHeight = 'none'
    el.style.overflowY = 'visible'

    // 현재 페이지에서 해당 div만 보이게 하고 인쇄
    const style = document.createElement('style')
    style.textContent =
      '@media print{' +
      'body *{visibility:hidden;}' +
      '#' + id + ',#' + id + ' *{visibility:visible;}' +
      '#' + id + '{position:absolute;left:0;top:0;width:100%;background:' + bgColor + '!important;}' +
      'body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}' +
      '}'
    document.head.appendChild(style)

    window.print()

    // 인쇄 다이얼로그 닫힌 후 복원
    el.style.maxHeight = origMax
    el.style.overflowY = origOverflow
    style.remove()
  }, [])

  // 플랫폼 전환 시 기존 파싱 결과 초기화
  const switchSource = (s) => {
    setSource(s)
    setMessages([])
    setStats(null)
    setFileName('')
    setTemplateCss('')
    setSelectedMode(null)
    setIsParsing(false)
  }

  return (
    <div style={{ fontFamily: 'sans-serif', maxWidth: 960, margin: '0 auto', padding: 24 }}>
      {templateCss && <style>{templateCss}</style>}
      <h1 style={{ fontSize: '1.4em', marginBottom: 4 }}>TRPG EPUB Maker</h1>

      {/* 플랫폼 탭 */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '2px solid #e0e0e0' }}>
        {[['roll20', 'Roll20'], ['ccfolia', '코코포리아']].map(([key, label]) => (
          <button key={key} onClick={() => switchSource(key)} style={{
            background: 'none', border: 'none',
            borderBottom: source === key ? '2px solid #2c5f2e' : '2px solid transparent',
            marginBottom: -2, padding: '8px 22px',
            fontWeight: source === key ? 'bold' : 'normal',
            color: source === key ? '#2c5f2e' : '#888',
            fontSize: '0.95em', cursor: 'pointer',
          }}>
            {label}
          </button>
        ))}
      </div>

      {/* 코코포리아 — 입력 방식 선택 */}
      {source === 'ccfolia' && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            {[['url', 'URL로 가져오기'], ['html', 'HTML 업로드']].map(([key, label]) => (
              <button key={key} onClick={() => setCcfoliaMode(key)} style={{
                background: ccfoliaMode === key ? '#f0f7ff' : '#f5f5f5',
                border: `1px solid ${ccfoliaMode === key ? '#4a90e2' : '#ddd'}`,
                borderRadius: 6, padding: '5px 14px', fontSize: '0.85em',
                color: ccfoliaMode === key ? '#2a6bb5' : '#666',
                fontWeight: ccfoliaMode === key ? 'bold' : 'normal', cursor: 'pointer',
              }}>
                {label}
              </button>
            ))}
          </div>
          {ccfoliaMode === 'url' && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                value={roomInput} onChange={e => setRoomInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleFetchCcfolia()}
                placeholder="방 URL 또는 방 ID 입력 (예: https://ccfolia.com/rooms/abc123)"
                style={{ ...INP, flex: 1 }} disabled={isFetching}
              />
              <button onClick={handleFetchCcfolia} disabled={isFetching || !roomInput.trim()} style={{
                background: isFetching ? '#aaa' : '#2a6bb5', color: '#fff',
                border: 'none', borderRadius: 6, padding: '8px 18px', fontSize: '0.9em',
                fontWeight: 'bold', cursor: isFetching ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
              }}>
                {isFetching ? `수집 중... (${fetchCount}건)` : '가져오기'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* 드롭존 */}
      {(source === 'roll20' || ccfoliaMode === 'html') && (
        <div
          onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
          style={{
            border: `2px dashed ${isDragging ? '#4a90e2' : '#ccc'}`,
            background: isDragging ? '#f0f7ff' : '#fafafa',
            borderRadius: 8, padding: '40px 20px', textAlign: 'center',
            cursor: 'pointer', marginBottom: 20, transition: 'all 0.15s',
          }}
          onClick={() => document.getElementById('fileInput').click()}
        >
          <input
            id="fileInput" type="file"
            accept={source === 'roll20' ? '.zip' : '.html'}
            style={{ display: 'none' }} onChange={onInputChange}
          />
          {fileName
            ? <span style={{ color: '#4a90e2', fontWeight: 'bold' }}>📄 {fileName}</span>
            : <span style={{ color: '#aaa' }}>
                {source === 'roll20'
                  ? 'Roll20 ZIP 파일을 여기에 드롭하거나 클릭해서 선택'
                  : '코코포리아 HTML 로그 파일을 여기에 드롭하거나 클릭해서 선택'}
              </span>
          }
        </div>
      )}

      {/* URL 모드 수집 완료 표시 */}
      {source === 'ccfolia' && ccfoliaMode === 'url' && fileName && (
        <div style={{ marginBottom: 20, color: '#4a90e2', fontWeight: 'bold', fontSize: '0.9em' }}>
          ✓ {fileName} 로그 수집 완료
        </div>
      )}

      {/* 통계 */}
      {stats && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
          {(source === 'roll20'
            ? [
                ['전체', stats.total, '#333'], ['대사', stats.general, '#4a90e2'],
                ['사담', stats.sadam, '#aaa'], ['숨김굴림', stats.hidden, '#e24a4a'],
                ['귓속말', stats.whisper, '#b8a800'],
                ['GM 지문', stats.desc, '#4aae4a'], ['GM 특수', stats.emote, '#e2a84a'],
              ]
            : [
                ['전체', stats.total, '#333'], ['일반', stats.general, '#4a90e2'],
                ['잡담', stats.sadam, '#aaa'], ['비밀', stats.hidden, '#e24a4a'],
              ]
          ).map(([label, count, color]) => (
            <div key={label} style={{ background: '#f5f5f5', borderRadius: 6, padding: '5px 12px', fontSize: '0.85em', color }}>
              <strong>{count}</strong> {label}
            </div>
          ))}
        </div>
      )}

      {/* 파싱 중 */}
      {isParsing && (
        <div style={{ padding: '24px 0', color: '#888', fontSize: '1em' }}>
          로그 변환 준비 중 ...
        </div>
      )}

      {/* 모드 선택 */}
      {!isParsing && messages.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: '0.95em', color: '#444', marginBottom: 12 }}>
            로그 변환 준비 완료. 어떤 형식으로 작업을 원하세요?
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {[
              ['epub', '📖 EPUB 스타일'],
              ['roll20', '🎲 Roll20 스타일'],
              ['ccfolia', '🎭 코코포리아 스타일'],
            ].map(([mode, label]) => (
              <button
                key={mode}
                onClick={() => setSelectedMode(prev => prev === mode ? null : mode)}
                style={{
                  background: selectedMode === mode ? '#2c5f2e' : '#f0f0f0',
                  color: selectedMode === mode ? '#fff' : '#333',
                  border: `1px solid ${selectedMode === mode ? '#2c5f2e' : '#ccc'}`,
                  borderRadius: 8, padding: '10px 22px',
                  fontSize: '0.95em', fontWeight: selectedMode === mode ? 'bold' : 'normal',
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* EPUB 스타일 패널 */}
      {selectedMode === 'epub' && (
        <>
          {/* 표지 편집 */}
          <div style={{ border: '1px solid #e0e0e0', borderRadius: 8, padding: '16px 20px', marginBottom: 16, background: '#fafafa' }}>
            <div style={{ fontWeight: 'bold', fontSize: '0.95em', color: '#333', marginBottom: 14 }}>표지 편집</div>
            <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={FIELD}>
                  <label style={LBL}>표지 이미지</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <input type="file" accept="image/*" onChange={onCoverChange} style={{ fontSize: '0.85em' }} />
                    {coverImage && (
                      <>
                        <img src={coverImage} alt="cover" style={{ height: 48, borderRadius: 3, border: '1px solid #ddd', objectFit: 'cover' }} />
                        <button onClick={() => setCoverImage(null)} style={{ fontSize: '0.8em', color: '#999', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>✕</button>
                      </>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ ...FIELD, flex: 2 }}>
                    <label style={LBL}>제목 (EPUB 타이틀)</label>
                    <input value={title} onChange={e => setTitle(e.target.value)} style={INP} />
                  </div>
                  <div style={{ ...FIELD, flex: 1 }}>
                    <label style={LBL}>작가명</label>
                    <input value={author} onChange={e => setAuthor(e.target.value)} placeholder="(선택)" style={INP} />
                  </div>
                </div>
                <div style={FIELD}>
                  <label style={LBL}>캐치프레이즈 <span style={{ opacity: 0.6 }}>(선택)</span></label>
                  <textarea value={catchPhrase} onChange={e => setCatchPhrase(e.target.value)} placeholder="짧은 한 줄 문구" rows={2} style={{ ...INP, resize: 'vertical', lineHeight: 1.6 }} />
                </div>
                <div style={{ marginBottom: 0 }}>
                  <label style={LBL}>개요 <span style={{ opacity: 0.6 }}>(선택)</span></label>
                  <textarea value={synopsis} onChange={e => setSynopsis(e.target.value)} placeholder="줄거리나 소개 문구를 입력하세요" rows={4} style={{ ...INP, resize: 'vertical', lineHeight: 1.6 }} />
                </div>
              </div>
              <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <CoverPreview coverImage={coverImage} coverTitle={title} catchPhrase={catchPhrase} synopsis={synopsis} />
                <span style={{ fontSize: '0.75em', color: '#aaa' }}>표지 미리보기</span>
              </div>
            </div>
          </div>

          {/* EPUB 다운로드 + 사담 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <button onClick={handleDownload} disabled={isGenerating} style={{
              background: isGenerating ? '#aaa' : '#2c5f2e', color: '#fff',
              border: 'none', borderRadius: 6, padding: '10px 22px',
              fontSize: '1em', fontWeight: 'bold', cursor: isGenerating ? 'not-allowed' : 'pointer',
            }}>
              {isGenerating ? '생성 중...' : '📥 EPUB 다운로드'}
            </button>
            <ToggleSwitch checked={includeSadam} onChange={setIncludeSadam} label="사담 포함" />
          </div>

          {/* EPUB iframe */}
          <div style={{ border: '1px solid #ddd', borderRadius: 8, overflow: 'hidden', marginBottom: 24 }}>
            <div style={{ background: '#f5f5f5', padding: '6px 14px', fontSize: '0.85em', color: '#666', borderBottom: '1px solid #ddd' }}>
              EPUB 본문 미리보기 — 실제 리더기 폰트에 따라 다를 수 있어요
            </div>
            <iframe
              srcDoc={generatePreviewHtml(messages, { title, includeSadam, templateCss })}
              style={{ width: '100%', height: 600, border: 'none', background: '#fff' }}
              title="EPUB 본문 미리보기"
            />
          </div>
        </>
      )}

      {/* Roll20 스타일 패널 */}
      {selectedMode === 'roll20' && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <ToggleSwitch checked={includeSadam} onChange={setIncludeSadam} label="사담 포함" />
          </div>
          <div style={{ border: '1px solid #ddd', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ background: '#f5f5f5', padding: '6px 14px', fontSize: '0.85em', color: '#666', borderBottom: '1px solid #ddd', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Roll20 스타일 미리보기</span>
              <button onClick={() => handlePdf('roll20')} style={{ background: '#4a4a4a', color: '#fff', border: 'none', borderRadius: 5, padding: '4px 12px', fontSize: '0.85em', cursor: 'pointer', fontWeight: 'bold' }}>
                🖨 PDF 다운로드
              </button>
            </div>
            <div id="roll20-preview-msgs" style={{ maxHeight: 600, overflowY: 'auto', background: '#fff' }}>
              {(() => {
                let lastSpeaker = ''
                const filtered = messages.filter(msg => !(msg.isSadam && !includeSadam))
                const annotated = filtered.map(msg => {
                  const isContinuation = !!msg.speaker && msg.speaker === lastSpeaker
                  lastSpeaker = msg.speaker
                  return { msg, isContinuation }
                })
                return annotated.map(({ msg, isContinuation }, i) => {
                  const isLastInGroup = i === annotated.length - 1 || !annotated[i + 1].isContinuation
                  return <MessageRow key={msg.id || i} msg={msg} isContinuation={isContinuation} isLastInGroup={isLastInGroup} />
                })
              })()}
            </div>
          </div>
        </div>
      )}

      {/* 코코포리아 스타일 패널 */}
      {selectedMode === 'ccfolia' && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <ToggleSwitch checked={includeSadam} onChange={setIncludeSadam} label="사담 포함" />
          </div>
          <div style={{ border: '1px solid #222', borderRadius: 8, overflow: 'hidden' }}>
            <style>{`#ccfolia-preview-msgs img { background: #f5f5f5; }`}</style>
            <div style={{ background: '#111118', padding: '6px 14px', fontSize: '0.85em', color: '#555', borderBottom: '1px solid #222', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>코코포리아 스타일 미리보기</span>
              <button onClick={() => handlePdf('ccfolia')} style={{ background: '#2a2a3a', color: '#aaa', border: '1px solid #3a3a4a', borderRadius: 5, padding: '4px 12px', fontSize: '0.85em', cursor: 'pointer', fontWeight: 'bold' }}>
                🖨 PDF 다운로드
              </button>
            </div>
            <div id="ccfolia-preview-msgs" style={{ maxHeight: 600, overflowY: 'auto', background: '#0e0e16' }}>
              {(() => {
                let lastSpeaker = ''
                let lastChannel = ''
                const filtered = messages.filter(msg => !(msg.isSadam && !includeSadam))
                const annotated = filtered.map(msg => {
                  const isContinuation = !!msg.speaker && msg.speaker === lastSpeaker && msg.channelName === lastChannel
                  lastSpeaker = msg.speaker
                  lastChannel = msg.channelName
                  return { msg, isContinuation }
                })
                return annotated.map(({ msg, isContinuation }, i) => {
                  const isLastInGroup = i === annotated.length - 1 || !annotated[i + 1].isContinuation
                  return <CcfoliaMessageRow key={msg.id || i} msg={msg} isContinuation={isContinuation} isLastInGroup={isLastInGroup} />
                })
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

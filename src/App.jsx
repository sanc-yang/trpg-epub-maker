import { useState, useCallback } from 'react'
import JSZip from 'jszip'
import { parseRoll20Html } from './utils/parseRoll20'
import { generateEpub, generatePreviewHtml, generateCoverPreviewHtml } from './utils/generateEpub'
import './App.css'

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'])
const MIME_MAP = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp' }

const TYPE_COLOR = {
  general: '#e8f4ff',
  hidden: '#fff0f0',
  desc: '#f0fff0',
  emote: '#fff8e0',
}

// ─── 메시지 행 컴포넌트 ──────────────────────────────────────────
function MessageRow({ msg }) {
  if (msg.type === 'template') {
    return (
      <div style={{ padding: '6px 10px', margin: '12px 0' }}>
        {msg.speaker && <strong style={{ marginRight: 6 }}>{msg.speaker}:</strong>}
        <div dangerouslySetInnerHTML={{ __html: msg.templateHtml }} />
      </div>
    )
  }
  if (msg.type === 'rollresult') {
    return (
      <div style={{ background: TYPE_COLOR.general, padding: '6px 10px', marginBottom: '2px' }}>
        {msg.speaker && <strong style={{ marginRight: 6 }}>{msg.speaker}:</strong>}
        {msg.formula && <div style={{ fontSize: '0.85em', color: '#666' }}>{msg.formula}</div>}
        {msg.formattedHtml && <div dangerouslySetInnerHTML={{ __html: msg.formattedHtml }} />}
        {msg.rolled && <div style={{ fontWeight: 'bold' }}>= {msg.rolled}</div>}
      </div>
    )
  }
  const bg = TYPE_COLOR[msg.type] || '#fff'
  const isSadam = msg.isSadam
  const isCentered = msg.type === 'desc' || msg.type === 'emote'
  return (
    <div style={{
      background: bg,
      opacity: isSadam ? 0.5 : 1,
      fontSize: isSadam ? '0.9em' : '1em',
      padding: '6px 10px',
      marginBottom: '2px',
      textAlign: isCentered ? 'center' : 'left',
    }}>
      {msg.speaker && <strong style={{ marginRight: 6 }}>{msg.speaker}:</strong>}
      {msg.content && (
        <span
          style={{
            fontStyle: msg.type === 'emote' ? 'italic' : 'normal',
            fontWeight: msg.type === 'emote' || msg.type === 'desc' ? 'bold' : 'normal',
          }}
          dangerouslySetInnerHTML={{ __html: msg.content }}
        />
      )}
    </div>
  )
}

// ─── 입력 공통 스타일 ────────────────────────────────────────────
const INP = { width: '100%', padding: '7px 10px', borderRadius: 4, border: '1px solid #ddd', fontSize: '0.9em', boxSizing: 'border-box', background: '#fff' }
const LBL = { fontSize: '0.8em', color: '#888', marginBottom: 4, display: 'block' }
const FIELD = { marginBottom: 12 }

// ─── 토글 버튼 공통 스타일 ───────────────────────────────────────
function ToggleBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      background: active ? '#4a4a4a' : '#f0f0f0',
      color: active ? '#fff' : '#333',
      border: '1px solid #ccc',
      borderRadius: 6,
      padding: '8px 18px',
      fontSize: '0.9em',
      fontWeight: 'bold',
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
  const [includeSadam, setIncludeSadam] = useState(false)

  // 메타데이터 / 표지
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [coverImage, setCoverImage] = useState(null)
  const [catchPhrase, setCatchPhrase] = useState('')
  const [synopsis, setSynopsis] = useState('')

  // 토글
  const [showPreview, setShowPreview] = useState(false)
  const [showMessages, setShowMessages] = useState(false)

  const processHtml = useCallback(async (htmlText, name, localImageMap) => {
    setFileName(name)
    const base = name.replace(/\.(html|zip)$/i, '')
    setTitle(base)
    const { messages: parsed, templateCss: css } = await parseRoll20Html(htmlText, localImageMap)
    setMessages(parsed)
    setTemplateCss(css)
    setStats({
      total: parsed.length,
      general: parsed.filter(m => m.type === 'general' && !m.isSadam).length,
      sadam: parsed.filter(m => m.isSadam).length,
      hidden: parsed.filter(m => m.type === 'hidden').length,
      desc: parsed.filter(m => m.type === 'desc').length,
      emote: parsed.filter(m => m.type === 'emote').length,
      template: parsed.filter(m => m.type === 'template').length,
    })
  }, [])

  const handleFile = useCallback((file) => {
    if (!file) return
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
        await processHtml(htmlText, htmlName, localImageMap)
      })
      return
    }
    if (!file.name.endsWith('.html')) return
    const reader = new FileReader()
    reader.onload = async (e) => { await processHtml(e.target.result, file.name, {}) }
    reader.readAsText(file, 'utf-8')
  }, [processHtml])

  const onDrop = useCallback((e) => {
    e.preventDefault(); setIsDragging(false)
    handleFile(e.dataTransfer.files[0])
  }, [handleFile])
  const onDragOver = (e) => { e.preventDefault(); setIsDragging(true) }
  const onDragLeave = () => setIsDragging(false)
  const onInputChange = (e) => handleFile(e.target.files[0])

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

  return (
    <div style={{ fontFamily: 'sans-serif', maxWidth: 960, margin: '0 auto', padding: 24 }}>
      {templateCss && <style>{templateCss}</style>}
      <h1 style={{ fontSize: '1.4em', marginBottom: 4 }}>TRPG EPUB Maker</h1>
      <p style={{ color: '#666', marginBottom: 20 }}>Roll20 아카이브 HTML 또는 ZIP 파일을 드래그앤드롭하거나 선택하세요.</p>

      {/* 드롭존 */}
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
        <input id="fileInput" type="file" accept=".html,.zip" style={{ display: 'none' }} onChange={onInputChange} />
        {fileName
          ? <span style={{ color: '#4a90e2', fontWeight: 'bold' }}>📄 {fileName}</span>
          : <span style={{ color: '#aaa' }}>HTML 또는 ZIP 파일을 여기에 드롭하거나 클릭해서 선택</span>
        }
      </div>

      {/* 통계 */}
      {stats && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
          {[
            ['전체', stats.total, '#333'], ['대사', stats.general, '#4a90e2'],
            ['사담', stats.sadam, '#aaa'], ['귓속말', stats.hidden, '#e24a4a'],
            ['GM 지문', stats.desc, '#4aae4a'], ['GM 특수', stats.emote, '#e2a84a'],
          ].map(([label, count, color]) => (
            <div key={label} style={{ background: '#f5f5f5', borderRadius: 6, padding: '5px 12px', fontSize: '0.85em', color }}>
              <strong>{count}</strong> {label}
            </div>
          ))}
        </div>
      )}

      {/* 표지 편집 */}
      {messages.length > 0 && (
        <div style={{ border: '1px solid #e0e0e0', borderRadius: 8, padding: '16px 20px', marginBottom: 20, background: '#fafafa' }}>
          <div style={{ fontWeight: 'bold', fontSize: '0.95em', color: '#333', marginBottom: 14 }}>표지 편집</div>
          <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>

            {/* 폼 */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* 표지 이미지 */}
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

              {/* 제목 + 작가명 */}
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

              {/* 캐치프레이즈 */}
              <div style={FIELD}>
                <label style={LBL}>캐치프레이즈 <span style={{ opacity: 0.6 }}>(선택)</span></label>
                <input value={catchPhrase} onChange={e => setCatchPhrase(e.target.value)} placeholder="짧은 한 줄 문구" style={INP} />
              </div>

              {/* 개요 */}
              <div style={{ marginBottom: 0 }}>
                <label style={LBL}>개요 <span style={{ opacity: 0.6 }}>(선택)</span></label>
                <textarea
                  value={synopsis}
                  onChange={e => setSynopsis(e.target.value)}
                  placeholder="줄거리나 소개 문구를 입력하세요"
                  rows={4}
                  style={{ ...INP, resize: 'vertical', lineHeight: 1.6 }}
                />
              </div>
            </div>

            {/* 표지 미리보기 */}
            <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 140, height: 210, overflow: 'hidden', border: '1px solid #ccc', borderRadius: 4, background: '#000' }}>
                <iframe
                  srcDoc={generateCoverPreviewHtml({ coverImage, coverTitle: title, catchPhrase, synopsis })}
                  style={{ width: 280, height: 420, border: 'none', transform: 'scale(0.5)', transformOrigin: 'top left' }}
                  title="표지 미리보기"
                />
              </div>
              <span style={{ fontSize: '0.75em', color: '#aaa' }}>표지 미리보기</span>
            </div>
          </div>
        </div>
      )}

      {/* 다운로드 + 토글 버튼 */}
      {messages.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <button
            onClick={handleDownload}
            disabled={isGenerating}
            style={{
              background: isGenerating ? '#aaa' : '#2c5f2e', color: '#fff',
              border: 'none', borderRadius: 6, padding: '10px 24px',
              fontSize: '1em', fontWeight: 'bold', cursor: isGenerating ? 'not-allowed' : 'pointer',
            }}
          >
            {isGenerating ? '생성 중...' : '📥 EPUB 다운로드'}
          </button>
          <ToggleBtn active={showPreview} onClick={() => setShowPreview(v => !v)}>
            {showPreview ? '본문 미리보기 닫기' : '👁 본문 미리보기'}
          </ToggleBtn>
          <ToggleBtn active={showMessages} onClick={() => setShowMessages(v => !v)}>
            {showMessages ? '메시지 목록 닫기' : '📋 메시지 목록'}
          </ToggleBtn>
          <label style={{ fontSize: '0.9em', color: '#555', cursor: 'pointer', userSelect: 'none', marginLeft: 4 }}>
            <input type="checkbox" checked={includeSadam} onChange={e => setIncludeSadam(e.target.checked)} style={{ marginRight: 6 }} />
            사담(OOC) 포함
          </label>
        </div>
      )}

      {/* EPUB 본문 미리보기 (토글) */}
      {showPreview && messages.length > 0 && (
        <div style={{ marginBottom: 24, border: '1px solid #ddd', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ background: '#f5f5f5', padding: '6px 14px', fontSize: '0.85em', color: '#666', borderBottom: '1px solid #ddd' }}>
            EPUB 본문 미리보기 — 실제 리더기 폰트에 따라 다를 수 있어요
          </div>
          <iframe
            srcDoc={generatePreviewHtml(messages, { title, includeSadam, templateCss })}
            style={{ width: '100%', height: 600, border: 'none', background: '#fff' }}
            title="EPUB 본문 미리보기"
          />
        </div>
      )}

      {/* 메시지 목록 (토글) */}
      {showMessages && messages.length > 0 && (
        <div style={{ border: '1px solid #eee', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ maxHeight: 600, overflowY: 'auto', padding: '8px 0' }}>
            {messages.map((msg, i) => <MessageRow key={msg.id || i} msg={msg} />)}
          </div>
        </div>
      )}
    </div>
  )
}

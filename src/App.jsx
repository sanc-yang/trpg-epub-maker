import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { Sun, Moon, FileText, FolderOpen, Check, BookOpen, Dices, Theater, X, Download, Printer, CheckCircle, AlertCircle, Clipboard } from 'lucide-react'
import JSZip from 'jszip'
import { parseRoll20Html } from './utils/parseRoll20'
import { parseCcfoliaHtml } from './utils/parseCcfolia'
import { generateEpub, generatePreviewHtml, messagesToHtml, epubCss, messagesToBlogHtml } from './utils/generateEpub'
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

const ROLL20_CSS = `
.r20-desc{padding:10px 40px 10px 54px;text-align:center;word-break:keep-all;}
.r20-desc-text{font-style:italic;font-weight:bold;}
.r20-sadam{background:rgba(0,0,0,0.04);opacity:0.75;font-size:0.9em;word-break:keep-all;}
.r20-row{display:flex;gap:10px;word-break:keep-all;}
.r20-avatar-col{width:36px;flex-shrink:0;}
.r20-avatar-box{width:36px;height:36px;border-radius:4px;overflow:hidden;}
.r20-avatar-img{width:100%;height:100%;object-fit:cover;}
.r20-content{flex:1;min-width:0;text-align:left;}
.r20-speaker{font-weight:bold;font-size:0.85em;margin-bottom:2px;color:#333;}
.r20-formula{font-size:0.82em;color:#666;}
.r20-rolled{font-weight:bold;}
.r20-content img{max-width:100%!important;height:auto!important;}
#roll20-preview-msgs img{max-width:100%!important;height:auto!important;}
`

const CCFOLIA_CSS = `
.ccf-desc{padding:8px 14px;text-align:center;font-style:italic;font-weight:bold;font-size:0.85em;line-height:1.65;background:rgba(255,255,255,0.02);word-break:keep-all;}
.ccf-desc--emote{color:#ffa040;}
.ccf-desc--gm{color:#ddd;}
.ccf-row{display:flex;gap:10px;word-break:keep-all;}
.ccf-sadam{background:rgba(255,255,255,0.08);opacity:0.7;}
.ccf-avatar-col{width:44px;flex-shrink:0;}
.ccf-avatar-box{width:44px;height:44px;border-radius:6px;overflow:hidden;background:#2a2a3a;display:flex;align-items:center;justify-content:center;}
.ccf-avatar-img{width:100%;height:100%;object-fit:cover;}
.ccf-gm-label{color:#fff;font-weight:700;font-size:0.85em;}
.ccf-content{flex:1;min-width:0;}
.ccf-speaker-row{margin-bottom:3px;display:flex;align-items:baseline;gap:8px;}
.ccf-speaker{font-weight:bold;font-size:0.88em;}
.ccf-badge{font-size:0.7em;border-radius:3px;padding:0 4px;}
.ccf-badge--sadam{color:#666;border:1px solid #3a3a3a;}
.ccf-badge--hidden{color:#c06060;border:1px solid #553333;}
.ccf-badge--whisper{color:#b8a800;border:1px solid #554400;}
.ccf-text{color:#d4d4d4;line-height:1.65;word-break:keep-all;white-space:pre-wrap;text-align:left;}
.ccf-text--sadam{font-size:0.8em;}
.ccf-text--normal{font-size:0.88em;}
.ccf-roll{background:rgba(255,255,255,0.05);border-radius:6px;padding:6px 10px;display:inline-block;}
.ccf-formula{font-size:0.75em;color:#888;margin-bottom:3px;}
.ccf-rolled{font-weight:bold;color:#ffd080;font-size:1.1em;}
.ccf-template{border-radius:4px;text-align:left;}
.ccf-content img{max-width:100%!important;height:auto!important;}
#ccfolia-preview-msgs img{max-width:100%!important;height:auto!important;}
`

function MessageRow({ msg, isContinuation, isLastInGroup }) {
  const isCentered = msg.type === 'desc' || msg.type === 'emote'

  if (isCentered) {
    const isDesc = msg.type === 'desc'
    return (
      <div className="r20-desc" style={{
        background: isDesc ? 'rgba(0,0,0,0.04)' : (TYPE_COLOR[msg.type] || '#fff'),
        color: isDesc ? '#000' : '#8b4b1a',
        borderBottom: isLastInGroup ? R20_BORDER : 'none',
      }}>
        {msg.content && (
          <span className="r20-desc-text" dangerouslySetInnerHTML={{ __html: msg.content }} />
        )}
      </div>
    )
  }

  const bg = TYPE_COLOR[msg.type] || '#fff'
  const isSadam = msg.isSadam

  const contentBlock = (
    <div className="r20-content">
      {!isContinuation && msg.speaker && (
        <div className="r20-speaker">{msg.speaker}</div>
      )}
      {msg.type === 'template' && (
        <div dangerouslySetInnerHTML={{ __html: msg.templateHtml }} />
      )}
      {msg.type === 'rollresult' && (
        <>
          {msg.formula && <div className="r20-formula">{msg.formula}</div>}
          {msg.formattedHtml && <div dangerouslySetInnerHTML={{ __html: msg.formattedHtml }} />}
          {msg.rolled && <div className="r20-rolled">= {msg.rolled}</div>}
        </>
      )}
      {msg.content && msg.type !== 'template' && msg.type !== 'rollresult' && (
        <span dangerouslySetInnerHTML={{ __html: msg.content }} />
      )}
    </div>
  )

  if (isSadam) {
    return (
      <div data-sadam="true" className="r20-sadam" style={{
        padding: isContinuation && !isLastInGroup ? `3px 10px 3px ${AVATAR_SIZE + 18}px` : `${isContinuation ? 2 : 10}px 10px ${isLastInGroup ? 10 : 3}px ${AVATAR_SIZE + 18}px`,
        borderBottom: isLastInGroup ? R20_BORDER : 'none',
      }}>
        {contentBlock}
      </div>
    )
  }

  return (
    <div className="r20-row" style={{
      padding: isContinuation && !isLastInGroup ? '3px 10px' : `${isContinuation ? 2 : 10}px 10px ${isLastInGroup ? 10 : 3}px`,
      background: bg,
      borderBottom: isLastInGroup ? R20_BORDER : 'none',
    }}>
      <div className="r20-avatar-col">
        {!isContinuation && msg.iconUrl && (
          <div className="r20-avatar-box">
            <img src={msg.iconUrl} alt="" className="r20-avatar-img" onError={e => { e.target.style.display = 'none' }} />
          </div>
        )}
      </div>
      {contentBlock}
    </div>
  )
}


// ─── 스피너 ─────────────────────────────────────────────────────
function Spinner({ size = 14, color = 'currentColor' }) {
  return (
    <>
      <style>{`@keyframes _spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{
        width: size, height: size, flexShrink: 0,
        border: `2px solid transparent`,
        borderTopColor: color, borderRightColor: color,
        borderRadius: '50%',
        animation: '_spin 0.7s linear infinite',
        display: 'inline-block',
      }} />
    </>
  )
}

// ─── 토스트 ─────────────────────────────────────────────────────
function Toast({ toasts }) {
  return (
    <div style={{ position: 'fixed', bottom: 28, right: 28, display: 'flex', flexDirection: 'column', gap: 10, zIndex: 9999 }}>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}`}</style>
      {toasts.map(({ id, message, type }) => (
        <div key={id} style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: type === 'error' ? 'rgba(30,10,10,0.88)' : 'rgba(10,20,10,0.88)',
          backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
          color: '#fff', borderRadius: 12, padding: '11px 18px',
          fontSize: '0.85em', fontWeight: 500,
          boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
          border: `1px solid ${type === 'error' ? 'rgba(255,80,80,0.3)' : 'rgba(80,220,120,0.3)'}`,
          animation: 'fadeUp 0.25s ease',
          maxWidth: 320,
        }}>
          {type === 'error'
            ? <AlertCircle size={16} color="#ff6b6b" style={{ flexShrink: 0 }} />
            : <CheckCircle size={16} color="#6bffaa" style={{ flexShrink: 0 }} />}
          {message}
        </div>
      ))}
    </div>
  )
}

// ─── 표지 미리보기 컴포넌트 ─────────────────────────────────────
function CoverPreview({ coverImage, coverTitle, coverAuthor }) {
  return (
    <div style={{
      width: 140, height: 210, background: '#000', overflow: 'hidden', borderRadius: 4,
      display: 'flex', flexDirection: 'column',
      fontSize: 10, position: 'relative',
    }}>
      {coverImage ? (
        <img src={coverImage} alt="" style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '1.4em 1.2em' }}>
          <div style={{ textAlign: 'center' }}>
            {coverTitle && (
              <div style={{ color: '#fff', fontFamily: 'Arial, sans-serif', fontSize: '1.4em', fontWeight: 'bold', letterSpacing: '0.04em', lineHeight: 1.4 }}>
                {coverTitle}
              </div>
            )}
          </div>
          {coverAuthor && (
            <div style={{ color: 'rgba(255,255,255,0.7)', fontFamily: 'Arial, sans-serif', fontSize: '0.95em', textAlign: 'right' }}>
              {coverAuthor}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const CC_BORDER = '1px solid rgba(255,255,255,0.03)'

// ─── 코코포리아 아바타 관리 모달 ────────────────────────────────
function CcfoliaAvatarManager({ messages, avatars, setAvatars, onClose, t }) {
  const speakers = [...new Set(
    messages.map(m => m.speaker).filter(s => s && s !== 'GM')
  )]

  const handleFile = (speaker, file) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = e => setAvatars(prev => ({ ...prev, [speaker]: e.target.result }))
    reader.readAsDataURL(file)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        background: t.surface, borderRadius: 16, padding: 24,
        width: '90%', maxWidth: 480, maxHeight: '80vh',
        display: 'flex', flexDirection: 'column', gap: 16,
        boxShadow: '0 16px 48px rgba(0,0,0,0.4)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700, fontSize: '0.95em', color: t.text }}>프로필 인장 관리</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textSub, padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {speakers.length === 0 && (
            <div style={{ color: t.textSub, fontSize: '0.85em', textAlign: 'center', padding: '24px 0' }}>
              화자 정보가 없습니다.
            </div>
          )}
          {speakers.map(speaker => {
            const url = avatars[speaker]
            return (
              <div key={speaker} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 12px', borderRadius: 10,
                border: `1px solid ${t.borderSub}`, background: t.glass,
              }}>
                {/* 아바타 미리보기 */}
                <div style={{
                  width: 44, height: 44, borderRadius: 8, flexShrink: 0,
                  background: '#2a2a3a', overflow: 'hidden',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {url
                    ? <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ color: '#666', fontSize: '0.7em' }}>없음</span>
                  }
                </div>

                {/* 화자명 */}
                <span style={{ flex: 1, fontSize: '0.9em', color: t.text, fontWeight: 500 }}>{speaker}</span>

                {/* 버튼 */}
                <div style={{ display: 'flex', gap: 6 }}>
                  <label style={{
                    padding: '5px 12px', borderRadius: 7, fontSize: '0.8em', fontWeight: 600,
                    background: t.accent, color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap',
                  }}>
                    {url ? '변경' : '업로드'}
                    <input type="file" accept="image/*" style={{ display: 'none' }}
                      onChange={e => handleFile(speaker, e.target.files[0])} />
                  </label>
                  {url && (
                    <button onClick={() => setAvatars(prev => { const n = { ...prev }; delete n[speaker]; return n })} style={{
                      padding: '5px 10px', borderRadius: 7, fontSize: '0.8em',
                      border: `1px solid ${t.borderSub}`, background: 'transparent',
                      color: t.textSub, cursor: 'pointer',
                    }}>삭제</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <button onClick={onClose} style={{
          padding: '8px 0', borderRadius: 8, border: `1px solid ${t.borderSub}`,
          background: 'transparent', color: t.textSub, fontSize: '0.85em', cursor: 'pointer',
        }}>닫기</button>
      </div>
    </div>
  )
}

// ─── 코코포리아 스타일 메시지 행 ─────────────────────────────────
function CcfoliaMessageRow({ msg, isContinuation, isLastInGroup }) {
  if (msg.type === 'desc' || msg.type === 'emote') {
    return (
      <div className={`ccf-desc ${msg.type === 'emote' ? 'ccf-desc--emote' : 'ccf-desc--gm'}`} style={{
        borderBottom: isLastInGroup ? CC_BORDER : 'none',
      }}>
        <span dangerouslySetInnerHTML={{ __html: msg.content }} />
      </div>
    )
  }

  let contentBlock
  if (msg.type === 'template') {
    contentBlock = (
      <div className="ccf-template">
        <div dangerouslySetInnerHTML={{ __html: msg.templateHtml }} />
      </div>
    )
  } else if (msg.type === 'rollresult') {
    contentBlock = (
      <div className="ccf-roll">
        {msg.formula && <div className="ccf-formula">{msg.formula}</div>}
        {msg.formattedHtml && <div dangerouslySetInnerHTML={{ __html: msg.formattedHtml }} />}
        {msg.rolled && <div className="ccf-rolled">= {msg.rolled}</div>}
      </div>
    )
  } else {
    contentBlock = (
      <div className={`ccf-text ${msg.isSadam ? 'ccf-text--sadam' : 'ccf-text--normal'}`}
        dangerouslySetInnerHTML={{ __html: msg.content }}
      />
    )
  }

  return (
    <div data-sadam={msg.isSadam ? 'true' : undefined}
      className={`ccf-row${msg.isSadam ? ' ccf-sadam' : ''}`}
      style={{
        padding: isContinuation ? '2px 14px' : '10px 14px 6px',
        borderBottom: isLastInGroup ? CC_BORDER : 'none',
      }}>
      <div className="ccf-avatar-col">
        {!isContinuation && (
          <div className="ccf-avatar-box">
            {msg.iconUrl
              ? <img src={msg.iconUrl} alt="" className="ccf-avatar-img" onError={e => { e.target.style.display = 'none' }} />
              : msg.speaker === 'GM'
                ? <span className="ccf-gm-label">GM</span>
                : null
            }
          </div>
        )}
      </div>
      <div className="ccf-content">
        {!isContinuation && (
          <div className="ccf-speaker-row">
            <span className="ccf-speaker" style={{ color: msg.charColor || '#7eb8d4' }}>
              {msg.speaker || '(이름 없음)'}
            </span>
            {msg.isSadam && <span className="ccf-badge ccf-badge--sadam">사담</span>}
            {msg.type === 'hidden' && <span className="ccf-badge ccf-badge--hidden">숨김</span>}
            {msg.type === 'whisper' && <span className="ccf-badge ccf-badge--whisper">귓속말</span>}
          </div>
        )}
        {contentBlock}
      </div>
    </div>
  )
}

// ─── 사담 토글 스위치 ───────────────────────────────────────────
function ToggleSwitch({ checked, onChange, label, labelColor, offColor }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none', fontSize: '0.84em', color: labelColor || '#555' }}>
      <div onClick={() => onChange(!checked)} style={{
        width: 36, height: 20, borderRadius: 10,
        background: checked ? '#3b82f6' : (offColor || '#ccc'),
        position: 'relative', transition: 'background 0.2s', flexShrink: 0,
      }}>
        <div style={{
          width: 16, height: 16, borderRadius: '50%', background: '#fff',
          position: 'absolute', top: 2, left: checked ? 18 : 2,
          transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }} />
      </div>
      {label}
    </label>
  )
}

// ─── HTML 복사 팝오버 ────────────────────────────────────────────
const CHUNK_SIZE = 2000 // 섹션당 메시지 수

// base64 이미지를 canvas로 리사이즈+JPEG 압축
function compressBase64Img(src, quality = 0.82, bgColor = '#ffffff', maxW = 400, maxH = 400) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1)
      const w = Math.max(1, Math.round(img.naturalWidth * scale))
      const h = Math.max(1, Math.round(img.naturalHeight * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = bgColor
      ctx.fillRect(0, 0, w, h)
      ctx.drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => resolve(src) // 실패 시 원본 유지
    img.src = src
  })
}

const EBOOK_FONTS = [
  {
    id: 'serif',
    label: '명조체',
    stack: '"Noto Serif KR", "Source Han Serif KR", Georgia, serif',
    preview: '가나다라마바사',
  },
  {
    id: 'sans-serif',
    label: '고딕체',
    stack: '"Noto Sans KR", "Apple SD Gothic Neo", sans-serif',
    preview: '가나다라마바사',
  },
]

const EBOOK_CHUNK = 10000

function EbookFontPopover({ font, setFont, onCopy, onClose, t, chunkCount }) {
  const [copied, setCopied] = useState(null)
  const [copying, setCopying] = useState(null)

  const handleCopy = async (i) => {
    if (copying !== null) return
    setCopying(i)
    await onCopy(font, i)
    setCopying(null)
    setCopied(i)
    setTimeout(() => setCopied(null), 1800)
  }

  return (
    <div
      style={{
        position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 200,
        background: '#fff',
        border: `1px solid ${t.glassBorder}`, borderRadius: 12,
        padding: '14px 16px', width: 280, boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
      }}
    >
      <div style={{ fontSize: '0.8em', color: t.textSub, marginBottom: 10, textAlign: 'left' }}>폰트 선택</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
        {EBOOK_FONTS.map(f => (
          <label key={f.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, cursor: 'pointer', padding: '8px 10px', borderRadius: 8, border: `1.5px solid ${font === f.id ? t.accent : t.borderSub}`, background: font === f.id ? `${t.accent}18` : 'transparent', transition: 'all 0.15s' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="radio" name="ebook-font" value={f.id} checked={font === f.id} onChange={() => setFont(f.id)} style={{ accentColor: t.accent }} />
              <span style={{ fontSize: '0.85em', color: t.text, fontWeight: 500 }}>{f.label}</span>
            </div>
            <span style={{ fontFamily: f.stack, fontSize: '0.95em', color: t.textSub, paddingLeft: 22 }}>{f.preview}</span>
          </label>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
        {Array.from({ length: chunkCount }, (_, i) => (
          <button key={i} onClick={() => handleCopy(i)} disabled={copying !== null} style={{ padding: '6px 0', borderRadius: 7, border: 'none', background: copied === i ? '#4caf50' : t.accent, color: '#fff', fontWeight: 600, fontSize: '0.85em', cursor: copying !== null ? 'not-allowed' : 'pointer', transition: 'background 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            {copied === i ? '복사 완료!' : copying === i ? <><Spinner size={13} color="#fff" />복사 중...</> : chunkCount === 1 ? '복사' : `섹션 ${i + 1} 복사`}
          </button>
        ))}
      </div>
      <button onClick={onClose} style={{ width: '100%', padding: '5px 0', borderRadius: 7, border: `1px solid ${t.borderSub}`, background: 'transparent', color: t.textSub, fontSize: '0.85em', cursor: 'pointer' }}>
        닫기
      </button>
    </div>
  )
}


function HtmlCopyPopover({ el, mode, includeSadam, templateCss, viewCss, onClose, toast, t, GLASS, BTN_PRIMARY, BTN_SECONDARY }) {
  const children = Array.from(el.children).filter(c => includeSadam || c.getAttribute('data-sadam') !== 'true')
  const bgColor = mode === 'ccfolia' ? '#0e0e16' : '#ffffff'
  const total = children.length
  const chunkCount = Math.ceil(total / CHUNK_SIZE)

  const [copied, setCopied] = useState(null) // 복사된 섹션 인덱스
  const [copying, setCopying] = useState(null) // 직렬화 중인 섹션 인덱스

  const copyChunk = (i) => {
    if (copying !== null) return
    setCopying(i)

    setTimeout(async () => {
      const imgBg = mode === 'roll20' ? '#e8f4ff' : '#f5f5f5'
      const slice = children.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)

      // ── 1. 고유 data: src 수집 ──────────────────────────────────
      const srcToToken = new Map()
      slice.forEach(row => {
        row.querySelectorAll('img[src^="data:"]').forEach(img => {
          const src = img.getAttribute('src')
          if (!srcToToken.has(src)) srcToToken.set(src, `__T${srcToToken.size}__`)
        })
      })

      // ── 2. src → 토큰으로 교체 (동기, DOM 바로 복구) ───────────
      const toRestore = []
      slice.forEach(row => {
        row.querySelectorAll('img[src^="data:"]').forEach(img => {
          const src = img.getAttribute('src')
          toRestore.push([img, src])
          img.setAttribute('src', srcToToken.get(src))
        })
      })

      // ── 3. 직렬화 (토큰이 짧아서 빠름) ────────────────────────
      const inner = slice.map(c => c.outerHTML).join('')

      // ── 4. DOM 즉시 복구 ───────────────────────────────────────
      toRestore.forEach(([img, src]) => img.setAttribute('src', src))

      // ── 5. 고유 이미지만 canvas 압축 ──────────────────────────
      const tokenToCompressed = new Map()
      await Promise.all([...srcToToken.entries()].map(async ([src, token]) => {
        tokenToCompressed.set(token, await compressBase64Img(src, 0.72, imgBg, 400, 400))
      }))

      // ── 6. 토큰 → 압축 URL 치환 ───────────────────────────────
      let finalInner = inner
      tokenToCompressed.forEach((compressed, token) => {
        finalInner = finalInner.replaceAll(token, compressed)
      })

      // CSS: img 배경 + rolltemplate 스타일
      const html = `<style>img{background-color:${imgBg}!important;max-width:100%!important}${viewCss || ''}${templateCss || ''}</style><div style="background:${bgColor};padding:8px;">${finalInner}</div>`

      try {
        await navigator.clipboard.writeText(html)
      } catch {
        const ta = document.createElement('textarea')
        ta.value = html
        ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0.01;'
        document.body.appendChild(ta)
        ta.focus(); ta.select()
        document.execCommand('copy')
        ta.remove()
      }
      setCopying(null)
      setCopied(i)
      toast(`섹션 ${i + 1} 복사 완료!`)
      setTimeout(() => setCopied(null), 2000)
    }, 30)
  }

  return (
    <div style={{
      position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 200,
      background: '#fff', border: `1px solid ${t.glassBorder}`, borderRadius: 12,
      padding: '14px 16px', width: 300, boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ fontSize: '0.8em', color: t.textSub, textAlign: 'left' }}>
        {mode === 'roll20' ? 'Roll20' : '코코포리아'} · {total}개 메시지 · {chunkCount}개 섹션
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
        {Array.from({ length: chunkCount }, (_, i) => {
          const start = i * CHUNK_SIZE + 1
          const end = Math.min((i + 1) * CHUNK_SIZE, total)
          const isCopied = copied === i
          return (
            <button key={i} onClick={() => copyChunk(i)} disabled={copying !== null} style={{
              padding: '7px 12px', borderRadius: 7, border: 'none',
              background: isCopied ? '#22c55e' : t.accent, color: '#fff',
              fontWeight: 600, fontSize: '0.85em', cursor: copying !== null ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              transition: 'background 0.2s', opacity: copying !== null && copying !== i ? 0.5 : 1,
            }}>
              <span>{chunkCount === 1 ? '복사' : `섹션 ${i + 1}`}</span>
              <span style={{ opacity: 0.8, fontSize: '0.85em', display: 'flex', alignItems: 'center', gap: 5 }}>
                {isCopied ? '✓ 복사됨' : copying === i ? <><Spinner size={12} color="#fff" />처리 중...</> : chunkCount > 1 ? `${start}–${end}` : ''}
              </span>
            </button>
          )
        })}
      </div>

      <button onClick={onClose} style={{
        padding: '5px 0', borderRadius: 7, border: `1px solid ${t.borderSub}`,
        background: 'transparent', color: t.textSub, fontSize: '0.85em', cursor: 'pointer',
      }}>닫기</button>
    </div>
  )
}

// ─── 메인 앱 ────────────────────────────────────────────────────
export default function App() {
  const [isDark, setIsDark] = useState(() => localStorage.getItem('theme') === 'dark')

  const t = isDark ? {
    bg: 'linear-gradient(135deg, #0f0c1e 0%, #1a0f2e 50%, #0c1a2e 100%)',
    glass: 'rgba(255,255,255,0.06)',
    glassBorder: 'rgba(255,255,255,0.12)',
    surface: 'rgba(255,255,255,0.06)', surfaceAlt: 'rgba(255,255,255,0.03)',
    border: 'rgba(255,255,255,0.12)', borderSub: 'rgba(255,255,255,0.07)',
    text: '#f0f0f5', textSub: '#8e8e99', textMuted: '#55555a',
    accent: '#f0f0f5', accentFg: '#111118',
    inputBg: 'rgba(255,255,255,0.09)', inputBorder: 'rgba(255,255,255,0.18)',
    shadow: '0 4px 28px rgba(0,0,0,0.35)',
  } : {
    bg: 'linear-gradient(135deg, #dbeafe 0%, #ede9fe 50%, #fce7f3 100%)',
    glass: 'rgba(255,255,255,0.55)',
    glassBorder: 'rgba(255,255,255,0.80)',
    surface: 'rgba(255,255,255,0.55)', surfaceAlt: 'rgba(255,255,255,0.35)',
    border: 'rgba(180,180,210,0.45)', borderSub: 'rgba(180,180,210,0.30)',
    text: '#1c1c1e', textSub: '#6c6c70', textMuted: '#aeaeb2',
    accent: '#1c1c1e', accentFg: '#ffffff',
    inputBg: 'rgba(255,255,255,0.70)', inputBorder: 'rgba(180,180,210,0.55)',
    shadow: '0 4px 28px rgba(100,80,160,0.08)',
  }

  const GLASS = {
    background: t.glass,
    backdropFilter: 'blur(18px) saturate(180%)',
    WebkitBackdropFilter: 'blur(18px) saturate(180%)',
    border: `1px solid ${t.glassBorder}`,
    boxShadow: t.shadow,
  }

  const modeRef = useRef(null)
  const [toasts, setToasts] = useState([])
  const toast = useCallback((message, type = 'success') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500)
  }, [])

  useEffect(() => {
    const style = document.createElement('style')
    style.textContent = ROLL20_CSS + CCFOLIA_CSS
    document.head.appendChild(style)
    return () => style.remove()
  }, [])

  useEffect(() => {
    localStorage.setItem('theme', isDark ? 'dark' : 'light')
    const grad = isDark
      ? 'linear-gradient(135deg, #0f0c1e 0%, #1a0f2e 50%, #0c1a2e 100%)'
      : 'linear-gradient(135deg, #dbeafe 0%, #ede9fe 50%, #fce7f3 100%)'
    document.body.style.background = grad
    document.body.style.backgroundSize = 'cover'
    document.body.style.minHeight = '100vh'
    document.body.style.transition = 'background 0.3s'
  }, [isDark])

  const INP = { width: '100%', padding: '9px 12px', borderRadius: 8, border: `1px solid ${t.inputBorder}`, fontSize: '0.88em', boxSizing: 'border-box', background: t.inputBg, color: t.text, fontFamily: 'inherit', outline: 'none' }
  const LBL = { fontSize: '0.7em', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: t.textSub, marginBottom: 6, display: 'block', paddingLeft: 8 }
  const FIELD = { marginBottom: 14 }

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

  // 모드 선택: null | 'epub' | 'roll20' | 'ccfolia'
  const [selectedMode, setSelectedMode] = useState(null)
  const [isParsing, setIsParsing] = useState(false)

  // 플랫폼 선택
  const [source, setSource] = useState(() => localStorage.getItem('trpg_source') || 'roll20') // 'roll20' | 'ccfolia'

  // HTML 복사 팝오버
  const [htmlPopover, setHtmlPopover] = useState(null) // null | { mode, html }
  // eBook 폰트 팝오버
  const [ebookFontPopover, setEbookFontPopover] = useState(false)
  const [ebookFont, setEbookFont] = useState('serif') // 'serif' | 'sans-serif'
  // 코코포리아 아바타 관리
  const [ccfoliaAvatars, setCcfoliaAvatars] = useState({}) // { speakerName: base64 }
  const [showAvatarManager, setShowAvatarManager] = useState(false)
  const messagesWithAvatars = useMemo(() => {
    if (!Object.keys(ccfoliaAvatars).length) return messages
    return messages.map(m => (m.speaker && ccfoliaAvatars[m.speaker])
      ? { ...m, iconUrl: ccfoliaAvatars[m.speaker] }
      : m)
  }, [messages, ccfoliaAvatars])

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
        if (!htmlText) { toast('ZIP에서 HTML 로그 파일을 찾을 수 없습니다.', 'error'); setIsParsing(false); return }
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
        toast(result.parseError, 'error')
        setIsParsing(false)
        return
      }
      applyParsedResult(result, file.name, false)
    }
    reader.readAsText(file, 'utf-8')
  }, [applyParsedResult])

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

  const [isCoverDragging, setIsCoverDragging] = useState(false)
  const coverInputRef = useRef(null)
  const onCoverDrop = useCallback((e) => {
    e.preventDefault()
    setIsCoverDragging(false)
    const file = e.dataTransfer.files[0]
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = (ev) => setCoverImage(ev.target.result)
    reader.readAsDataURL(file)
  }, [])

  const handleDownload = useCallback(async () => {
    if (!messages.length || isGenerating) return
    setIsGenerating(true)
    try {
      const blob = await generateEpub(messagesWithAvatars, {
        title, author, coverImage,
        coverTitle: title,
        includeSadam, templateCss,
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${title || fileName.replace(/\.(html|zip)$/i, '')}.epub`
      a.click()
      URL.revokeObjectURL(url)
      toast('epub 다운로드 완료!')
    } finally {
      setIsGenerating(false)
    }
  }, [messages, title, author, coverImage, fileName, isGenerating, includeSadam, templateCss])

  // ─── eBook HTML 복사 ─────────────────────────────────────────
  const handleCopyEbookHtml = useCallback(async (font, chunkIndex) => {
    const filtered = messagesWithAvatars.filter(m => includeSadam || !m.isSadam)
    const slice = chunkIndex !== undefined
      ? filtered.slice(chunkIndex * EBOOK_CHUNK, (chunkIndex + 1) * EBOOK_CHUNK)
      : filtered
    const css = epubCss + (templateCss ? '\n' + templateCss : '')
    const body = messagesToBlogHtml(slice, true, font)
    const html = `<style>${css}</style>${body}`
    try {
      await navigator.clipboard.writeText(html)
      toast('eBook HTML 복사 완료!')
    } catch {
      const ta = document.createElement('textarea')
      ta.value = html
      ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0.01;'
      document.body.appendChild(ta)
      ta.focus(); ta.select()
      document.execCommand('copy')
      ta.remove()
      toast('eBook HTML 복사 완료!')
    }
  }, [messagesWithAvatars, includeSadam, templateCss, toast])

  // ─── HTML 복사 팝오버 열기 ───────────────────────────────────
  const handleCopyHtml = useCallback((mode) => {
    const id = mode === 'roll20' ? 'roll20-preview-msgs' : 'ccfolia-preview-msgs'
    const el = document.getElementById(id)
    if (!el) return
    setHtmlPopover(prev => (prev?.mode === mode ? null : {
      mode, el, templateCss,
      viewCss: mode === 'roll20' ? ROLL20_CSS : CCFOLIA_CSS,
    }))
  }, [templateCss])

  // ─── PDF 다운로드 ─────────────────────────────────────────────
  const handlePdf = useCallback((mode) => {
    const id = mode === 'roll20' ? 'roll20-preview-msgs' : 'ccfolia-preview-msgs'
    const el = document.getElementById(id)
    if (!el) return

    const bgColor = mode === 'ccfolia' ? '#0e0e16' : '#fff'

    // body 직하에 print 전용 div 생성
    // - visibility:hidden 대신 display:none 으로 기존 UI 완전 제거 (레이아웃 공간 없앰)
    // - body 직하이므로 GLASS 컨테이너의 containing block / overflow 영향 없음
    const printDiv = document.createElement('div')
    printDiv.id = 'trpg-pdf-print'
    printDiv.innerHTML = el.innerHTML
    printDiv.style.cssText = `background:${bgColor};margin:0;padding:0;`
    document.body.appendChild(printDiv)

    const style = document.createElement('style')
    style.textContent =
      '@media print{' +
      'body > *:not(#trpg-pdf-print){display:none!important;}' +
      '#trpg-pdf-print{display:block!important;}' +
      'body{margin:0;padding:0;background:' + bgColor + '!important;-webkit-print-color-adjust:exact;print-color-adjust:exact;}' +
      '}'
    document.head.appendChild(style)

    const cleanup = () => {
      printDiv.remove()
      style.remove()
      window.removeEventListener('afterprint', cleanup)
    }
    window.addEventListener('afterprint', cleanup)

    window.print()
  }, [])

  // 플랫폼 전환 시 기존 파싱 결과 초기화
  const switchSource = (s) => {
    localStorage.setItem('trpg_source', s)
    setSource(s)
    setMessages([])
    setStats(null)
    setFileName('')
    setTemplateCss('')
    setSelectedMode(null)
    setIsParsing(false)
  }

  const BTN_PRIMARY = {
    background: t.accent, color: t.accentFg, border: 'none',
    borderRadius: 8, padding: '10px 22px', fontSize: '0.9em', fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit', transition: 'opacity 0.15s',
  }
  const BTN_SECONDARY = {
    background: t.surface, color: t.text, border: `1px solid ${t.border}`,
    borderRadius: 8, padding: '7px 16px', fontSize: '0.82em', fontWeight: 500,
    cursor: 'pointer', fontFamily: 'inherit',
  }
  const SECTION_LABEL = {
    fontSize: '0.7em', fontWeight: 700, letterSpacing: '0.08em',
    textTransform: 'uppercase', color: t.textSub, margin: '0 0 18px',
  }

  return (
    <div style={{
      fontFamily: "'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      width: '100%', maxWidth: 800, margin: '0 auto', padding: '40px 28px',
      color: t.text, transition: 'color 0.2s',
    }}>
      {templateCss && <style>{templateCss}</style>}

      {/* ── 헤더 ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 30, marginBottom: 40 }}>
        <div>
          <h1 style={{ fontSize: '1.6em', fontWeight: 700, margin: 0, letterSpacing: '-0.01em', color: t.text, fontFamily: "'Nanum Myeongjo', serif" }}>
            [무공비급] TRPG 세션 제본소
            <span style={{ fontSize: '0.38em', fontWeight: 400, color: t.textMuted, letterSpacing: '0.04em', marginLeft: '0.8em', verticalAlign: 'baseline' }}>made by pong</span>
          </h1>
          <p style={{ fontSize: '0.82em', color: t.textSub, margin: '5px 0 0 1px', letterSpacing: 0 }}>
            Roll20 · 코코포리아 세션 로그 → eBook / PDF
          </p>
        </div>
        <button onClick={() => setIsDark(d => !d)} style={{ ...BTN_SECONDARY, display: 'flex', alignItems: 'center', gap: 6, borderRadius: 20 }}>
          {isDark ? <><Sun size={14} /> 라이트</> : <><Moon size={14} /> 다크</>}
        </button>
      </div>

      {/* ── 플랫폼 탭 ── */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${t.border}`, marginBottom: 28 }}>
        {[['roll20', 'Roll20'], ['ccfolia', '코코포리아']].map(([key, label]) => (
          <button key={key} onClick={() => switchSource(key)} style={{
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


      {/* ── 드롭존 ── */}
      {(source === 'roll20' || source === 'ccfolia') && (
        <div
          onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
          onClick={() => document.getElementById('fileInput').click()}
          style={{
            ...GLASS,
            border: `1.5px dashed ${isDragging ? t.text : t.glassBorder}`,
            background: isDragging ? (isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.75)') : (isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.30)'),
            borderRadius: 16, padding: '36px 20px', textAlign: 'center',
            cursor: 'pointer', marginBottom: 24, transition: 'all 0.2s',
          }}
        >
          <input
            id="fileInput" type="file"
            accept={source === 'roll20' ? '.zip' : '.html'}
            style={{ display: 'none' }} onChange={onInputChange}
          />
          {fileName
            ? <span style={{ color: t.text, fontWeight: 600, fontSize: '0.9em', display: 'inline-flex', alignItems: 'center', gap: 6 }}><FileText size={15} /> {fileName}</span>
            : <>
                <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'center' }}><FolderOpen size={28} strokeWidth={1.5} color={t.textSub} /></div>
                <div style={{ color: t.textSub, fontSize: '0.88em' }}>
                  {source === 'roll20' ? 'Roll20 ZIP 파일 드롭 또는 클릭' : '코코포리아 HTML 파일 드롭 또는 클릭'}
                </div>
              </>
          }
        </div>
      )}


      {/* ── 통계 ── */}
      {stats && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 28 }}>
          {(source === 'roll20'
            ? [
                ['전체', stats.total, t.text],
                ['대사', stats.general, '#3b82f6'], ['사담', stats.sadam, t.textSub],
                ['숨김굴림', stats.hidden, '#ef4444'], ['귓속말', stats.whisper, '#eab308'],
                ['GM 지문', stats.desc, '#22c55e'], ['GM 특수', stats.emote, '#f97316'],
              ]
            : [
                ['전체', stats.total, t.text], ['일반', stats.general, '#3b82f6'],
                ['잡담', stats.sadam, t.textSub], ['비밀', stats.hidden, '#ef4444'],
              ]
          ).map(([label, count, color]) => (
            <span key={label} style={{
              ...GLASS,
              borderRadius: 20, padding: '4px 12px', fontSize: '0.78em',
              display: 'inline-flex', alignItems: 'center', gap: 5,
            }}>
              <strong style={{ color, fontWeight: 700 }}>{count}</strong>
              <span style={{ color: t.textSub }}>{label}</span>
            </span>
          ))}
        </div>
      )}

      {/* ── 파싱 중 ── */}
      {isParsing && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0 24px', color: t.textSub, fontSize: '0.9em' }}>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          <div style={{ width: 16, height: 16, border: `2px solid ${t.borderSub}`, borderTopColor: t.textSub, borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
          로그 변환 준비 중 ...
        </div>
      )}

      {/* ── 모드 선택 ── */}
      {!isParsing && messages.length > 0 && (
        <div style={{ marginBottom: 32 }} ref={modeRef}>
          <p style={{ fontSize: '0.85em', color: t.textSub, margin: '0 0 14px' }}>
            로그 변환 준비 완료. 어떤 형식으로 작업을 원하세요?
          </p>
          {source === 'ccfolia' && (
            <button onClick={() => setShowAvatarManager(true)} style={{ ...BTN_SECONDARY, marginBottom: 12, padding: '5px 14px', fontSize: '0.82em', display: 'flex', alignItems: 'center', gap: 6 }}>
              프로필 인장 관리
            </button>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            {[
              ['epub', <BookOpen size={20} strokeWidth={1.5} />, 'eBook 스타일'],
              ['roll20', <Dices size={20} strokeWidth={1.5} />, 'Roll20 스타일'],
              ['ccfolia', <Theater size={20} strokeWidth={1.5} />, '코코포리아 스타일'],
            ].map(([mode, icon, label]) => (
              <button key={mode}
                onClick={() => {
                  setSelectedMode(prev => prev === mode ? null : mode)
                  setTimeout(() => modeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
                }}
                style={{
                  ...GLASS,
                  flex: 1,
                  background: selectedMode === mode ? t.accent : t.glass,
                  color: selectedMode === mode ? t.accentFg : t.text,
                  border: `1px solid ${selectedMode === mode ? t.accent : t.glassBorder}`,
                  borderRadius: 16, padding: '16px 12px', cursor: 'pointer',
                  fontFamily: 'inherit', transition: 'all 0.2s', textAlign: 'center',
                }}
              >
                <div style={{ marginBottom: 5, display: 'flex', justifyContent: 'center' }}>{icon}</div>
                <div style={{ fontSize: '0.82em', fontWeight: selectedMode === mode ? 600 : 400 }}>{label}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── EPUB 패널 ── */}
      {selectedMode === 'epub' && (
        <>
          <div style={{ ...GLASS, borderRadius: 16, padding: 28, marginBottom: 24 }}>
            <p style={SECTION_LABEL}>표지 편집</p>
            <div style={{ display: 'flex', gap: 28, alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ ...FIELD, flex: 2 }}>
                    <label style={{ ...LBL, textAlign: 'left' }}>제목</label>
                    <input value={title} onChange={e => setTitle(e.target.value)} placeholder="시나리오 제목" style={INP} />
                  </div>
                  <div style={{ ...FIELD, flex: 1 }}>
                    <label style={{ ...LBL, textAlign: 'left' }}>작가명</label>
                    <input value={author} onChange={e => setAuthor(e.target.value)} placeholder="페어명 또는 팀명" style={INP} />
                  </div>
                </div>
                <div style={FIELD}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
                    <label style={{ ...LBL, marginBottom: 0 }}>표지 이미지</label>
                    <span style={{ fontSize: '0.68em', color: t.textMuted }}>*선택 사항</span>
                  </div>
                  <input ref={coverInputRef} type="file" accept="image/*" onChange={onCoverChange} style={{ display: 'none' }} />
                  {coverImage ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <img src={coverImage} alt="cover" style={{ height: 56, borderRadius: 6, border: `1px solid ${t.border}`, objectFit: 'cover' }} />
                      <button onClick={() => setCoverImage(null)} style={{ color: t.textMuted, background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8em' }}>
                        <X size={13} /> 제거
                      </button>
                    </div>
                  ) : (
                    <div
                      onClick={() => coverInputRef.current?.click()}
                      onDragOver={(e) => { e.preventDefault(); setIsCoverDragging(true) }}
                      onDragLeave={() => setIsCoverDragging(false)}
                      onDrop={onCoverDrop}
                      style={{
                        border: `2px dashed ${isCoverDragging ? t.text : t.inputBorder}`,
                        borderRadius: 10,
                        padding: '18px 0',
                        textAlign: 'center',
                        cursor: 'pointer',
                        background: isCoverDragging ? `${t.inputBorder}33` : t.inputBg,
                        transition: 'border-color 0.15s, background 0.15s',
                      }}
                    >
                      <p style={{ margin: 0, fontSize: '0.82em', color: t.textSub }}>클릭하거나 이미지를 드래그하세요</p>
                    </div>
                  )}
                </div>
              </div>
              <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <CoverPreview coverImage={coverImage} coverTitle={title} coverAuthor={author} />
                <span style={{ fontSize: '0.72em', color: t.textMuted }}>표지 미리보기</span>
              </div>
            </div>
          </div>

          <div style={{ ...GLASS, borderRadius: 16, overflow: 'hidden', marginBottom: 32 }}>
            <div style={{ background: t.glass, backdropFilter: 'blur(18px)', padding: '8px 16px', borderBottom: `1px solid ${t.glassBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.78em', color: t.textSub }}>eBook 본문 미리보기</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <ToggleSwitch checked={includeSadam} onChange={setIncludeSadam} label="사담 포함" labelColor={t.textSub} offColor={t.borderSub} />
                <div style={{ position: 'relative' }}>
                  <button onClick={() => setEbookFontPopover(v => !v)} style={{ ...BTN_SECONDARY, padding: '5px 14px', fontSize: '0.82em', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Clipboard size={13} />HTML 복사
                  </button>
                  {ebookFontPopover && (
                    <EbookFontPopover
                      font={ebookFont}
                      setFont={setEbookFont}
                      onCopy={(f, i) => handleCopyEbookHtml(f, i)}
                      onClose={() => setEbookFontPopover(false)}
                      t={t}
                      chunkCount={Math.ceil(messagesWithAvatars.filter(m => includeSadam || !m.isSadam).length / EBOOK_CHUNK) || 1}
                    />
                  )}
                </div>
                <button onClick={handleDownload} disabled={isGenerating} style={{ ...BTN_PRIMARY, padding: '5px 14px', fontSize: '0.82em', opacity: isGenerating ? 0.5 : 1, cursor: isGenerating ? 'not-allowed' : 'pointer' }}>
                  {isGenerating ? <><Spinner size={13} color="#fff" /> 생성 중...</> : <><Download size={13} style={{ marginRight: 5 }} />epub 다운로드</>}
                </button>
              </div>
            </div>
            <iframe srcDoc={generatePreviewHtml(messagesWithAvatars, { title, includeSadam, templateCss })}
              style={{ width: '100%', height: 600, border: 'none', background: '#fff' }}
              title="eBook 본문 미리보기"
            />
          </div>
        </>
      )}

      {/* ── Roll20 패널 ── */}
      {selectedMode === 'roll20' && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ ...GLASS, borderRadius: 16, overflow: 'hidden', marginTop: 8 }}>
            <div style={{ background: t.glass, backdropFilter: 'blur(18px)', padding: '8px 16px', borderBottom: `1px solid ${t.glassBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.78em', color: t.textSub }}>Roll20 스타일 미리보기</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <ToggleSwitch checked={includeSadam} onChange={setIncludeSadam} label="사담 포함" labelColor={t.textSub} offColor={t.borderSub} />
                <div style={{ position: 'relative' }}>
                  <button onClick={() => handleCopyHtml('roll20')} style={{ ...BTN_SECONDARY, padding: '5px 14px', fontSize: '0.82em', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Clipboard size={13} />HTML 복사
                  </button>
                  {htmlPopover?.mode === 'roll20' && (
                    <HtmlCopyPopover el={htmlPopover.el} mode="roll20" includeSadam={includeSadam} templateCss={htmlPopover.templateCss} viewCss={htmlPopover.viewCss} onClose={() => setHtmlPopover(null)} toast={toast} t={t} GLASS={GLASS} BTN_PRIMARY={BTN_PRIMARY} BTN_SECONDARY={BTN_SECONDARY} />
                  )}
                </div>
                <button onClick={() => handlePdf('roll20')} style={{ ...BTN_PRIMARY, padding: '5px 14px', fontSize: '0.82em', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Printer size={13} />PDF 다운로드
                </button>
              </div>
            </div>
            <div id="roll20-preview-msgs" style={{ maxHeight: 600, overflowY: 'auto', overflowX: 'hidden', background: '#fff', color: '#1c1c1e' }}>
              {(() => {
                let lastSpeaker = ''
                let lastChannel = ''
                const filtered = messagesWithAvatars.filter(msg => !(msg.isSadam && !includeSadam))
                const annotated = filtered.map(msg => {
                  const isContinuation = !!msg.speaker && msg.speaker === lastSpeaker && (msg.channelName || '') === lastChannel
                  lastSpeaker = msg.speaker
                  lastChannel = msg.channelName || ''
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

      {/* ── 코코포리아 패널 ── */}
      {selectedMode === 'ccfolia' && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ ...GLASS, borderRadius: 16, overflow: 'hidden', marginTop: 8 }}>
            <style>{`#ccfolia-preview-msgs img { background: #f5f5f5; }`}</style>
            <div style={{ background: t.glass, backdropFilter: 'blur(18px)', padding: '8px 16px', borderBottom: `1px solid ${t.glassBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.78em', color: '#555' }}>코코포리아 스타일 미리보기</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <ToggleSwitch checked={includeSadam} onChange={setIncludeSadam} label="사담 포함" labelColor={t.textSub} offColor={t.borderSub} />
                <div style={{ position: 'relative' }}>
                  <button onClick={() => handleCopyHtml('ccfolia')} style={{ ...BTN_SECONDARY, padding: '5px 14px', fontSize: '0.82em', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Clipboard size={13} />HTML 복사
                  </button>
                  {htmlPopover?.mode === 'ccfolia' && (
                    <HtmlCopyPopover el={htmlPopover.el} mode="ccfolia" includeSadam={includeSadam} templateCss={htmlPopover.templateCss} viewCss={htmlPopover.viewCss} onClose={() => setHtmlPopover(null)} toast={toast} t={t} GLASS={GLASS} BTN_PRIMARY={BTN_PRIMARY} BTN_SECONDARY={BTN_SECONDARY} />
                  )}
                </div>
                <button onClick={() => handlePdf('ccfolia')} style={{ ...BTN_PRIMARY, padding: '5px 14px', fontSize: '0.82em', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Printer size={13} />PDF 다운로드
                </button>
              </div>
            </div>
            <div id="ccfolia-preview-msgs" style={{ maxHeight: 600, overflowY: 'auto', background: '#0e0e16' }}>
              {(() => {
                let lastSpeaker = ''
                let lastChannel = ''
                const filtered = messagesWithAvatars.filter(msg => !(msg.isSadam && !includeSadam))
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
      {showAvatarManager && (
        <CcfoliaAvatarManager
          messages={messages}
          avatars={ccfoliaAvatars}
          setAvatars={setCcfoliaAvatars}
          onClose={() => setShowAvatarManager(false)}
          t={t}
        />
      )}
      <Toast toasts={toasts} />
    </div>
  )
}

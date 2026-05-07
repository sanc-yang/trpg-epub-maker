import { useState, useCallback } from 'react'
import { parseRoll20Html } from './utils/parseRoll20'
import { generateEpub, generatePreviewHtml } from './utils/generateEpub'
import './App.css'

const TYPE_LABEL = {
  general: '대사',
  hidden: '귓속말',
  desc: 'GM 지문',
  emote: 'GM 특수',
}

const TYPE_COLOR = {
  general: '#e8f4ff',
  hidden: '#fff0f0',
  desc: '#f0fff0',
  emote: '#fff8e0',
}

const SUCCESS_BAR_COLOR = {
  '대성공':    '#a5d6a7',  // 연한 녹색
  '어려운 성공': '#388e3c', // 중간 녹색
  '성공':      '#1e7e34',  // 진한 녹색
  '실패':      '#c62828',  // 중간 빨강
  '대실패':    '#7b0000',  // 진한 빨강
}

function RollBlock({ roll }) {
  const barColor = SUCCESS_BAR_COLOR[roll.successLevel] || '#555'

  return (
    <div style={{
      background: '#000',
      border: '1px solid #e5d280',
      borderRadius: 2,
      padding: '6px',
      margin: '6px 0',
      fontFamily: '"Droid Serif", "Georgia", serif',
      color: '#fff',
      textAlign: 'center',
      maxWidth: 480,
    }}>
      {/* 캐릭터명 */}
      <div style={{ fontSize: '0.72em', color: '#ccc', letterSpacing: '0.15em', marginBottom: 1 }}>
        {roll.character}
      </div>
      {/* 기능명 */}
      <div style={{ fontSize: '1.1em', fontWeight: 'bold', color: '#e5d280', marginBottom: 1 }}>
        {roll.skill}
      </div>
      {/* 난이도 */}
      <div style={{ fontSize: '0.8em', color: '#fff', marginBottom: 3 }}>
        보통
      </div>
      {/* 성공 정도 바 */}
      <div style={{
        background: barColor,
        padding: '2px 0',
        fontWeight: 'bold',
        fontSize: '0.95em',
        letterSpacing: '0.1em',
        marginBottom: 4,
      }}>
        {roll.successLevel}
      </div>
      {/* 주사위 값 */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 24,
        fontSize: '1.6em',
        fontWeight: 'bold',
        padding: '2px 0 4px',
      }}>
        <span>{roll.rollValue}</span>
        <span style={{ fontSize: '0.5em', color: '#aaa' }}>vs.</span>
        <span>{roll.skillValue}</span>
      </div>
    </div>
  )
}

function MessageRow({ msg }) {
  const bg = TYPE_COLOR[msg.type] || '#fff'
  const isSadam = msg.isSadam
  const isCentered = msg.type === 'desc' || msg.type === 'emote'

  return (
    <div style={{
      background: bg,
      opacity: isSadam ? 0.55 : 1,
      borderLeft: `3px solid ${isSadam ? '#aaa' : 'transparent'}`,
      padding: '6px 10px',
      marginBottom: '2px',
      fontSize: isSadam ? '0.85em' : '1em',
      textAlign: isCentered ? 'center' : 'left',
    }}>
      {msg.speaker && (
        <strong style={{ marginRight: 6 }}>{msg.speaker}:</strong>
      )}
      {msg.roll && <RollBlock roll={msg.roll} />}
      {msg.content && (
        <span style={{
          fontStyle: msg.type === 'emote' ? 'italic' : 'normal',
          fontWeight: msg.type === 'emote' || msg.type === 'desc' ? 'bold' : 'normal',
        }}>
          {msg.content}
        </span>
      )}
    </div>
  )
}

export default function App() {
  const [messages, setMessages] = useState([])
  const [fileName, setFileName] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [stats, setStats] = useState(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [includeSadam, setIncludeSadam] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  const handleFile = useCallback((file) => {
    if (!file || !file.name.endsWith('.html')) return
    setFileName(file.name)

    const reader = new FileReader()
    reader.onload = (e) => {
      const parsed = parseRoll20Html(e.target.result)
      setMessages(parsed)
      setStats({
        total: parsed.length,
        general: parsed.filter(m => m.type === 'general' && !m.isSadam).length,
        sadam: parsed.filter(m => m.isSadam).length,
        hidden: parsed.filter(m => m.type === 'hidden').length,
        desc: parsed.filter(m => m.type === 'desc').length,
        emote: parsed.filter(m => m.type === 'emote').length,
      })
    }
    reader.readAsText(file, 'utf-8')
  }, [])

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    handleFile(file)
  }, [handleFile])

  const onDragOver = (e) => { e.preventDefault(); setIsDragging(true) }
  const onDragLeave = () => setIsDragging(false)

  const onInputChange = (e) => handleFile(e.target.files[0])

  const handleDownload = useCallback(async () => {
    if (!messages.length || isGenerating) return
    setIsGenerating(true)
    try {
      const baseName = fileName.replace(/\.html$/i, '')
      const blob = await generateEpub(messages, { title: baseName, includeSadam })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${baseName}.epub`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setIsGenerating(false)
    }
  }, [messages, fileName, isGenerating, includeSadam])

  return (
    <div style={{ fontFamily: 'sans-serif', maxWidth: 900, margin: '0 auto', padding: 24 }}>
      <h1 style={{ fontSize: '1.4em', marginBottom: 4 }}>TRPG EPUB Maker — 파싱 테스트</h1>
      <p style={{ color: '#666', marginBottom: 20 }}>Roll20 아카이브 HTML 파일을 드래그앤드롭하거나 선택하세요.</p>

      {/* 드롭존 */}
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        style={{
          border: `2px dashed ${isDragging ? '#4a90e2' : '#ccc'}`,
          background: isDragging ? '#f0f7ff' : '#fafafa',
          borderRadius: 8,
          padding: '40px 20px',
          textAlign: 'center',
          cursor: 'pointer',
          marginBottom: 20,
          transition: 'all 0.15s',
        }}
        onClick={() => document.getElementById('fileInput').click()}
      >
        <input
          id="fileInput"
          type="file"
          accept=".html"
          style={{ display: 'none' }}
          onChange={onInputChange}
        />
        {fileName
          ? <span style={{ color: '#4a90e2', fontWeight: 'bold' }}>📄 {fileName}</span>
          : <span style={{ color: '#aaa' }}>HTML 파일을 여기에 드롭하거나 클릭해서 선택</span>
        }
      </div>

      {/* 통계 */}
      {stats && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
          {[
            ['전체', stats.total, '#333'],
            ['대사', stats.general, '#4a90e2'],
            ['사담', stats.sadam, '#aaa'],
            ['귓속말', stats.hidden, '#e24a4a'],
            ['GM 지문', stats.desc, '#4aae4a'],
            ['GM 특수', stats.emote, '#e2a84a'],
          ].map(([label, count, color]) => (
            <div key={label} style={{
              background: '#f5f5f5', borderRadius: 6, padding: '6px 14px',
              fontSize: '0.85em', color,
            }}>
              <strong>{count}</strong> {label}
            </div>
          ))}
        </div>
      )}

      {/* EPUB 다운로드 */}
      {messages.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
          <button
            onClick={handleDownload}
            disabled={isGenerating}
            style={{
              background: isGenerating ? '#aaa' : '#2c5f2e',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '10px 24px',
              fontSize: '1em',
              fontWeight: 'bold',
              cursor: isGenerating ? 'not-allowed' : 'pointer',
            }}
          >
            {isGenerating ? '생성 중...' : '📥 EPUB 다운로드'}
          </button>
          <button
            onClick={() => setShowPreview(v => !v)}
            style={{
              background: showPreview ? '#4a4a4a' : '#f0f0f0',
              color: showPreview ? '#fff' : '#333',
              border: '1px solid #ccc',
              borderRadius: 6,
              padding: '10px 20px',
              fontSize: '1em',
              fontWeight: 'bold',
              cursor: 'pointer',
            }}
          >
            {showPreview ? '미리보기 닫기' : '👁 미리보기'}
          </button>
          <label style={{ fontSize: '0.9em', color: '#555', cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={includeSadam}
              onChange={e => setIncludeSadam(e.target.checked)}
              style={{ marginRight: 6 }}
            />
            사담(OOC) 포함
          </label>
        </div>
      )}

      {/* EPUB 미리보기 */}
      {showPreview && messages.length > 0 && (
        <div style={{ marginBottom: 24, border: '1px solid #ddd', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ background: '#f5f5f5', padding: '6px 14px', fontSize: '0.85em', color: '#666', borderBottom: '1px solid #ddd' }}>
            EPUB 미리보기 — 실제 리더기 폰트에 따라 다를 수 있어요
          </div>
          <iframe
            srcDoc={generatePreviewHtml(messages, {
              title: fileName.replace(/\.html$/i, ''),
              includeSadam,
            })}
            style={{ width: '100%', height: 600, border: 'none', background: '#fff' }}
            title="EPUB 미리보기"
          />
        </div>
      )}

      {/* 메시지 목록 */}
      {messages.length > 0 && (
        <div style={{ border: '1px solid #eee', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ maxHeight: 600, overflowY: 'auto', padding: '8px 0' }}>
            {messages.map((msg, i) => (
              <MessageRow key={msg.id || i} msg={msg} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

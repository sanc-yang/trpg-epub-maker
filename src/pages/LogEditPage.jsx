import { useState } from 'react'
import { Eye, EyeOff, RotateCcw, Scissors } from 'lucide-react'
import { glass, styles } from '../theme'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'

const BATCH = 300

// 메시지 타입별로 미리보기에 쓸 텍스트를 뽑아냄 — 롤템플릿/굴림결과는 content 가 아니라 다른 필드에 담겨있음
function messageText(msg) {
  if (msg.type === 'template') return msg.templateHtml || ''
  if (msg.type === 'rollresult') {
    return msg.formattedHtml || [msg.formula, msg.rolled != null ? `= ${msg.rolled}` : ''].filter(Boolean).join(' ')
  }
  return msg.content || ''
}

function Row({ msg, index, hidden, rangeState, onToggleHidden, onPickStart, onPickEnd, t }) {
  const { startId, endId } = rangeState
  const isStart = msg.id === startId
  const isEnd = msg.id === endId

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '8px 12px', borderBottom: `1px solid ${t.borderSub}`,
      opacity: hidden ? 0.4 : 1,
      background: isStart || isEnd ? t.hover : 'transparent',
    }}>
      <span style={{ fontSize: '0.72em', color: t.textMuted, width: 40, flexShrink: 0, textAlign: 'right', paddingTop: 3 }}>
        {index + 1}
      </span>

      <button type="button" onClick={() => onToggleHidden(msg.id)} title={hidden ? '다시 보이기' : '숨기기'} style={{
        background: 'none', border: 'none', cursor: 'pointer', padding: 3, flexShrink: 0,
        color: hidden ? t.textMuted : t.textSub, display: 'flex',
      }}>
        {hidden ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        {msg.speaker && (
          <span style={{ fontWeight: 700, fontSize: '0.8em', color: t.text, marginRight: 6 }}>{msg.speaker}</span>
        )}
        <span
          style={{ fontSize: '0.82em', color: t.textSub, wordBreak: 'break-word' }}
          dangerouslySetInnerHTML={{ __html: messageText(msg) || '<i>(내용 없음)</i>' }}
        />
      </div>

      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        <button type="button" onClick={() => onPickStart(msg.id)} style={{
          fontSize: '0.72em', padding: '3px 8px', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap',
          border: `1px solid ${isStart ? t.accent : t.borderSub}`,
          background: isStart ? t.accent : 'transparent',
          color: isStart ? t.accentFg : t.textMuted,
        }}>{isStart ? '시작점' : '시작으로'}</button>
        <button type="button" onClick={() => onPickEnd(msg.id)} style={{
          fontSize: '0.72em', padding: '3px 8px', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap',
          border: `1px solid ${isEnd ? t.accent : t.borderSub}`,
          background: isEnd ? t.accent : 'transparent',
          color: isEnd ? t.accentFg : t.textMuted,
        }}>{isEnd ? '끝점' : '끝으로'}</button>
      </div>
    </div>
  )
}

export default function LogEditPage({ app }) {
  const { t, messages, hiddenMessageIds, setHiddenMessageIds, setPage } = app
  const S = styles(t)

  const [visibleCount, setVisibleCount] = useState(BATCH)
  const [startId, setStartId] = useState(null)
  const [endId, setEndId] = useState(null)

  // 편집 대상이 바뀌면(다른 로그 열기) 점진 렌더링 개수 리셋 — effect 대신 렌더 중 조정
  const resetKey = messages.length ? messages[0].id : ''
  const [lastResetKey, setLastResetKey] = useState(resetKey)
  if (resetKey !== lastResetKey) {
    setLastResetKey(resetKey)
    setVisibleCount(BATCH)
    setStartId(null)
    setEndId(null)
  }

  if (messages.length === 0) {
    return (
      <>
        <PageHeader title="로그 편집" desc="메시지를 숨기거나 필요한 구간만 남길 수 있습니다" t={t} />
        <EmptyState
          t={t}
          onGoConvert={() => setPage('convert')}
          desc="먼저 로그 변환에서 로그를 불러와야 편집할 수 있습니다."
        />
      </>
    )
  }

  const toggleHidden = (id) => {
    setHiddenMessageIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const startIndex = startId != null ? messages.findIndex(m => m.id === startId) : -1
  const endIndex = endId != null ? messages.findIndex(m => m.id === endId) : -1
  const rangeReady = startIndex !== -1 && endIndex !== -1
  const rangeLo = rangeReady ? Math.min(startIndex, endIndex) : -1
  const rangeHi = rangeReady ? Math.max(startIndex, endIndex) : -1
  const outsideCount = rangeReady ? messages.length - (rangeHi - rangeLo + 1) : 0

  const applyRange = () => {
    if (!rangeReady) return
    setHiddenMessageIds(prev => {
      const next = new Set(prev)
      messages.forEach((m, i) => {
        if (i < rangeLo || i > rangeHi) next.add(m.id)
      })
      return next
    })
    setStartId(null); setEndId(null)
  }

  const handleScroll = (e) => {
    const el = e.currentTarget
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) {
      setVisibleCount(v => Math.min(v + BATCH, messages.length))
    }
  }

  return (
    <>
      <PageHeader title="로그 편집" desc="메시지를 숨기거나 필요한 구간만 남길 수 있습니다. 미리보기/변환 결과에 그대로 반영됩니다." t={t} />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <span style={{ ...glass(t), borderRadius: 20, padding: '4px 12px', fontSize: '0.78em', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <strong style={{ color: t.text }}>{messages.length}</strong><span style={{ color: t.textSub }}>전체</span>
        </span>
        <span style={{ ...glass(t), borderRadius: 20, padding: '4px 12px', fontSize: '0.78em', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <strong style={{ color: hiddenMessageIds.size ? '#ef4444' : t.text }}>{hiddenMessageIds.size}</strong><span style={{ color: t.textSub }}>숨김</span>
        </span>
        {hiddenMessageIds.size > 0 && (
          <button type="button" className="btn-secondary" onClick={() => setHiddenMessageIds(new Set())} style={{
            ...S.btnSecondary, padding: '4px 12px', fontSize: '0.78em',
            display: 'inline-flex', alignItems: 'center', gap: 5,
          }}><RotateCcw size={12} />전체 되돌리기</button>
        )}
      </div>

      <div style={{ ...glass(t), borderRadius: 16, overflow: 'hidden', marginBottom: 30 }}>
        <div className="panel-bar" style={{ background: t.glass, borderBottom: `1px solid ${t.glassBorder}` }}>
          <span style={{ fontSize: '0.78em', color: t.textSub, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Scissors size={13} />구간 잘라내기
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.78em', color: t.textSub }}>
              {rangeReady
                ? `${rangeLo + 1}번째 ~ ${rangeHi + 1}번째만 남기기 (구간 밖 ${outsideCount}개 숨김)`
                : '아래 목록에서 시작/끝 지점을 지정하세요'}
            </span>
            <button type="button" className="btn-primary" onClick={applyRange} disabled={!rangeReady} style={{
              ...S.btnPrimary, padding: '5px 14px', fontSize: '0.82em',
              ...(!rangeReady && { opacity: 0.5, cursor: 'not-allowed' }),
            }}>적용</button>
          </div>
        </div>

        <div onScroll={handleScroll} style={{ maxHeight: 600, overflowY: 'auto' }}>
          {messages.slice(0, visibleCount).map((msg, i) => (
            <Row
              key={msg.id || i}
              msg={msg} index={i}
              hidden={hiddenMessageIds.has(msg.id)}
              rangeState={{ startId, endId }}
              onToggleHidden={toggleHidden}
              onPickStart={id => setStartId(prev => prev === id ? null : id)}
              onPickEnd={id => setEndId(prev => prev === id ? null : id)}
              t={t}
            />
          ))}
          {visibleCount < messages.length && (
            <div style={{ padding: '10px 14px', fontSize: '0.76em', color: t.textMuted, textAlign: 'center' }}>
              {visibleCount.toLocaleString()} / {messages.length.toLocaleString()}개 표시 중 · 스크롤하면 더 불러옵니다
            </div>
          )}
        </div>
      </div>
    </>
  )
}

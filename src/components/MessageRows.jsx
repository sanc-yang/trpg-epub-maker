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

export function MessageRow({ msg, isContinuation, isLastInGroup, hideAvatar }) {
  const isCentered = msg.type === 'desc' || msg.type === 'emote'
  // 아바타 칸이 있을 땐 그 너비만큼 들여써서 정렬, 없으면 다른 줄과 같은 10px
  const avatarGutter = hideAvatar ? 10 : AVATAR_SIZE + 18

  // desc / emote: 아바타 없이 원래 스타일 유지
  if (isCentered) {
    const isDesc = msg.type === 'desc'
    return (
      <div style={{
        background: isDesc ? '#f5f5f5' : (TYPE_COLOR[msg.type] || '#fff'),
        padding: `6px 10px 6px ${avatarGutter}px`,
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
      <div data-sadam="true" style={{
        padding: `${isContinuation ? 2 : 6}px 10px ${isContinuation ? 2 : 6}px ${avatarGutter}px`,
        background: '#f5f5f5',
        color: '#666',
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
      {!hideAvatar && (
        <div style={{ width: AVATAR_SIZE, flexShrink: 0 }}>
          {!isContinuation && msg.iconUrl && (
            <div style={{
              width: AVATAR_SIZE, height: AVATAR_SIZE,
              borderRadius: 4, overflow: 'hidden',
              background: 'transparent',
            }}>
              <img src={msg.iconUrl} alt="" data-avatar="true" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none' }} />
            </div>
          )}
        </div>
      )}
      {contentBlock}
    </div>
  )
}

// ─── 코코포리아 스타일 메시지 행 ─────────────────────────────────
const CC_BORDER = '1px solid rgba(255,255,255,0.03)'

export function CcfoliaMessageRow({ msg, isContinuation, isLastInGroup, hideAvatar }) {
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
      <div style={{ borderRadius: 4 }}>
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
    <div data-sadam={msg.isSadam ? 'true' : undefined} style={{
      display: 'flex',
      gap: 10,
      padding: isContinuation ? '2px 14px' : '10px 14px 6px',
      background: msg.isSadam ? 'rgba(255,255,255,0.08)' : 'transparent',
      opacity: msg.isSadam ? 0.7 : 1,
      borderBottom: isLastInGroup ? CC_BORDER : 'none',
    }}>
      {/* 아바타 자리 */}
      {!hideAvatar && (
        <div style={{ width: AVATAR_W, flexShrink: 0 }}>
          {!isContinuation && (
            <div style={{
              width: AVATAR_W, height: AVATAR_W,
              borderRadius: 6, overflow: 'hidden',
              background: '#2a2a3a',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {msg.iconUrl
                ? <img src={msg.iconUrl} alt="" data-avatar="true" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none' }} />
                : msg.speaker === 'GM'
                  ? <span style={{ color: '#fff', fontWeight: 700, fontSize: '0.85em' }}>GM</span>
                  : null
              }
            </div>
          )}
        </div>
      )}

      {/* 본문 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {!isContinuation && (
          <div style={{ marginBottom: 3, display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
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

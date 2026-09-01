import { useState } from 'react'
import { X } from 'lucide-react'
import { styles } from '../theme'

/**
 * 화자 한 명의 행. 파싱 원본 이미지는 상대경로/외부 URL이라 이 화면에서도 깨질 수 있어
 * 실제 로드 성공 여부(loaded)를 썸네일뿐 아니라 "업로드"/"변경" 라벨에도 함께 반영함
 * — 문자열 URL만 있고 실제로는 안 뜨는 경우 "변경"이라고 잘못 표시되는 걸 방지.
 */
function AvatarRow({ speaker, url, hasOverride, onUpload, onRemove, t }) {
  const [loaded, setLoaded] = useState(!!url)
  const showImg = url && loaded

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 12px', borderRadius: 10,
      border: `1px solid ${t.borderSub}`, background: t.glass,
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 8, flexShrink: 0,
        background: '#2a2a3a', overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {showImg
          ? <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={() => setLoaded(false)} />
          : <span style={{ color: '#666', fontSize: '0.7em' }}>없음</span>}
      </div>

      <span style={{ flex: 1, fontSize: '0.9em', color: t.text, fontWeight: 500 }}>{speaker}</span>

      <div style={{ display: 'flex', gap: 6 }}>
        <label style={{
          padding: '5px 12px', borderRadius: 7, fontSize: '0.8em', fontWeight: 600,
          background: t.accent, color: t.accentFg, cursor: 'pointer', whiteSpace: 'nowrap',
        }}>
          {showImg ? '변경' : '업로드'}
          <input type="file" accept="image/*" style={{ display: 'none' }}
            onChange={e => onUpload(e.target.files[0])} />
        </label>
        {hasOverride && (
          <button type="button" onClick={onRemove} style={{
            padding: '5px 10px', borderRadius: 7, fontSize: '0.8em',
            border: `1px solid ${t.borderSub}`, background: 'transparent',
            color: t.textSub, cursor: 'pointer',
          }}>삭제</button>
        )}
      </div>
    </div>
  )
}

/**
 * 코코포리아엔 아바타 이미지가 원래 없고, Roll20은 로그 저장 시 일부 이미지가
 * 로컬로 안 남아(예: 본인 프로필 이미지) 변환물에서 깨지는 경우가 있어, 화자별로
 * 직접 업로드해 뷰/EPUB에 반영. 파싱 단계에서 이미 잘 잡힌 이미지는 그대로 보여주고
 * 없는 화자만 채워 넣으면 됨.
 */
export default function AvatarManager({ messages, avatars, setAvatars, onClose, source, t }) {
  const S = styles(t)
  const speakers = [...new Set(
    messages.map(m => m.speaker).filter(s => s && s !== 'GM')
  )]

  // 원본 로그 파싱 시 이미 정상적으로 잡힌 아이콘(화자별 첫 값) — 수동 업로드가 없으면 이걸 보여줌
  // data: 로 내장된 것만 인정 — 외부/상대경로 URL은 미리보기·내보낸 파일에서 어차피 안 뜸(MessageRows 참고)
  const parsedIconBySpeaker = {}
  for (const m of messages) {
    if (m.speaker && m.iconUrl?.startsWith('data:') && !parsedIconBySpeaker[m.speaker]) {
      parsedIconBySpeaker[m.speaker] = m.iconUrl
    }
  }

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
        background: t.drawerBg, borderRadius: 16, padding: 24,
        width: '90%', maxWidth: 480, maxHeight: '80vh',
        display: 'flex', flexDirection: 'column', gap: 16,
        boxShadow: '0 16px 48px rgba(0,0,0,0.4)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700, fontSize: '0.95em', color: t.text }}>프로필 인장 관리</span>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textSub, padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {source !== 'roll20' && (
          <div style={{
            fontSize: '0.78em', lineHeight: 1.6, color: t.textSub,
            background: t.glass, border: `1px solid ${t.borderSub}`, borderRadius: 10, padding: '10px 12px',
          }}>
            <p style={{ margin: 0 }}>※ 코코포리아 로그에는 인장이 포함되어 있지 않습니다.<br />인장을 표시하고 싶은 화자는 직접 업로드 할 수 있습니다.</p>
          </div>
        )}

        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {speakers.length === 0 && (
            <div style={{ color: t.textSub, fontSize: '0.85em', textAlign: 'center', padding: '24px 0' }}>
              화자 정보가 없습니다.
            </div>
          )}
          {speakers.map(speaker => {
            const override = avatars[speaker]
            const url = override || parsedIconBySpeaker[speaker]
            return (
              <AvatarRow
                key={`${speaker}:${url || ''}`}
                speaker={speaker}
                url={url}
                hasOverride={!!override}
                onUpload={file => handleFile(speaker, file)}
                onRemove={() => setAvatars(prev => { const n = { ...prev }; delete n[speaker]; return n })}
                t={t}
              />
            )
          })}
        </div>

        <button type="button" className="btn-primary" onClick={onClose} style={{
          ...S.btnPrimary, width: '100%', padding: '8px 0', fontSize: '0.85em',
        }}>적용하기</button>
      </div>
    </div>
  )
}

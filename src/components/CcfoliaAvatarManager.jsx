import { X } from 'lucide-react'

/** 코코포리아 로그에는 아바타 이미지가 없어 화자별로 직접 업로드해 뷰/EPUB에 반영 */
export default function CcfoliaAvatarManager({ messages, avatars, setAvatars, onClose, t }) {
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
                <div style={{
                  width: 44, height: 44, borderRadius: 8, flexShrink: 0,
                  background: '#2a2a3a', overflow: 'hidden',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {url
                    ? <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ color: '#666', fontSize: '0.7em' }}>없음</span>}
                </div>

                <span style={{ flex: 1, fontSize: '0.9em', color: t.text, fontWeight: 500 }}>{speaker}</span>

                <div style={{ display: 'flex', gap: 6 }}>
                  <label style={{
                    padding: '5px 12px', borderRadius: 7, fontSize: '0.8em', fontWeight: 600,
                    background: t.accent, color: t.accentFg, cursor: 'pointer', whiteSpace: 'nowrap',
                  }}>
                    {url ? '변경' : '업로드'}
                    <input type="file" accept="image/*" style={{ display: 'none' }}
                      onChange={e => handleFile(speaker, e.target.files[0])} />
                  </label>
                  {url && (
                    <button type="button" onClick={() => setAvatars(prev => { const n = { ...prev }; delete n[speaker]; return n })} style={{
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

        <button type="button" onClick={onClose} style={{
          padding: '8px 0', borderRadius: 8, border: `1px solid ${t.borderSub}`,
          background: 'transparent', color: t.textSub, fontSize: '0.85em', cursor: 'pointer',
        }}>적용하기</button>
      </div>
    </div>
  )
}

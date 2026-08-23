import { useRef } from 'react'
import { Book, FolderOpen, Check, BookOpen, Dices, Theater, Download, Printer } from 'lucide-react'
import { glass, styles } from '../theme'
import SegControl from '../components/SegControl'
import ToggleSwitch from '../components/ToggleSwitch'
import DropZone from '../components/DropZone'
import { MessageRow, CcfoliaMessageRow } from '../components/MessageRows'
import { annotate } from '../utils/annotateMessages'
import { generatePreviewHtml } from '../utils/generateEpub'
import { SHOW_CCFOLIA_URL_MODE } from '../featureFlags'
import PageHeader from '../components/PageHeader'

const STAT_ROWS = {
  roll20: (s, t) => [
    ['전체', s.total, t.text],
    ['대사', s.general, '#3b82f6'], ['사담', s.sadam, t.textSub],
    ['숨김굴림', s.hidden, '#ef4444'], ['귓속말', s.whisper, '#eab308'],
    ['GM 지문', s.desc, '#22c55e'], ['GM 특수', s.emote, '#f97316'],
  ],
  ccfolia: (s, t) => [
    ['전체', s.total, t.text], ['일반', s.general, '#3b82f6'],
    ['잡담', s.sadam, t.textSub], ['비밀', s.hidden, '#ef4444'],
  ],
}

export default function ConvertPage({ app }) {
  const {
    t, source, switchSource, ccfoliaMode, setCcfoliaMode,
    roomInput, setRoomInput, isFetching, fetchCount, handleFetchCcfolia,
    handleFileDrop, fileName, stats, isParsing, messages,
    selectedMode, setSelectedMode,
    includeSadam, setIncludeSadam, bodyFont, setBodyFont,
    title, templateCss, isGenerating, handleDownload, handlePdf,
  } = app

  const S = styles(t)
  const G = glass(t)
  const modeRef = useRef(null)

  // 코코포리아 방 입력 유효성
  const roomTrimmed = roomInput.trim()
  const roomUrlValid = /ccfolia\.com\/rooms\/[a-zA-Z0-9_-]{4,}/.test(roomTrimmed)
  const roomIdValid = /^[a-zA-Z0-9_-]{4,}$/.test(roomTrimmed)
  const roomValid = roomUrlValid || roomIdValid
  const roomInvalidMsg = roomTrimmed.length > 0 && !roomValid

  const previewRows = annotate(messages, includeSadam)

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
          icon={fileName
            ? null
            : <FolderOpen size={26} strokeWidth={1.5} color={t.textSub} style={{ margin: '0 auto 9px', display: 'block' }} />}
        >
          {fileName
            ? <span style={{ color: t.text, fontWeight: 600, fontSize: '1.02em', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Book size={15} /> {fileName}</span>
            : (source === 'roll20' ? 'Roll20 ZIP 파일 드롭 또는 클릭' : '코코포리아 HTML 파일 드롭 또는 클릭')}
        </DropZone>
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
          <div className="mode-grid">
            {[
              ['epub', BookOpen, 'eBook 스타일'],
              ['roll20', Dices, 'Roll20 스타일'],
              ['ccfolia', Theater, '코코포리아 스타일'],
            ].map(([mode, Icon, label]) => (
              <button key={mode} type="button"
                onClick={() => {
                  setSelectedMode(prev => prev === mode ? null : mode)
                  setTimeout(() => modeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
                }}
                style={{
                  ...G,
                  background: selectedMode === mode ? t.accent : t.glass,
                  color: selectedMode === mode ? t.accentFg : t.text,
                  border: `1px solid ${selectedMode === mode ? t.accent : t.glassBorder}`,
                  borderRadius: 16, padding: '15px 12px', cursor: 'pointer',
                  fontFamily: 'inherit', transition: 'all 0.2s',
                  fontSize: '0.82em', fontWeight: selectedMode === mode ? 600 : 400,
                }}
              >
                <Icon size={19} strokeWidth={1.5} className="mode-icon" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* eBook 패널 */}
      {selectedMode === 'epub' && (
        <div style={{ ...G, borderRadius: 16, overflow: 'hidden', marginBottom: 30 }}>
          <div className="panel-bar" style={{ background: t.glass, borderBottom: `1px solid ${t.glassBorder}` }}>
            <span style={{ fontSize: '0.78em', color: t.textSub }}>eBook 본문 미리보기</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <SegControl value={bodyFont} onChange={setBodyFont} options={[['gothic', '고딕'], ['serif', '명조']]} t={t} />
              <ToggleSwitch checked={includeSadam} onChange={setIncludeSadam} label="사담 포함" labelColor={t.textSub} offColor={t.borderSub} />
              <button type="button" onClick={handleDownload} disabled={isGenerating} style={{
                ...S.btnPrimary, padding: '5px 14px', fontSize: '0.82em',
                opacity: isGenerating ? 0.5 : 1, cursor: isGenerating ? 'not-allowed' : 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
              }}>
                {isGenerating ? '생성 중...' : <><Download size={13} />epub 다운로드</>}
              </button>
            </div>
          </div>
          <iframe
            srcDoc={generatePreviewHtml(messages, { title, includeSadam, templateCss, bodyFont })}
            style={{ width: '100%', height: 600, border: 'none', background: '#fff' }}
            title="eBook 본문 미리보기"
          />
        </div>
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
                <button type="button" onClick={() => handlePdf(selectedMode)} style={{
                  ...S.btnPrimary, padding: '5px 14px', fontSize: '0.82em',
                  display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
                }}>
                  <Printer size={13} />PDF 다운로드
                </button>
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
                <Row key={msg.id || i} msg={msg} isContinuation={isContinuation} isLastInGroup={isLastInGroup} />
              ))}
            </div>
          </div>
        )
      })()}
    </>
  )
}

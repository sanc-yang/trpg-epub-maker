import { useCallback, useEffect, useRef, useState } from 'react'
import { Image as ImageIcon, Check, Download, Book, Wand2 } from 'lucide-react'
import { glass, styles } from '../theme'
import PageHeader from '../components/PageHeader'
import SegControl from '../components/SegControl'
import DropZone from '../components/DropZone'
import EmptyState from '../components/EmptyState'
import {
  COVER_W, COVER_H, COVER_TEMPLATES, COVER_FONTS,
  applyTemplate, makeInitialCoverState, drawCover, clampOffset,
  SAMPLE_TITLE, SAMPLE_AUTHOR,
} from '../utils/coverCanvas'

// 템플릿 버튼 안의 미니 썸네일 — 실제 레이아웃을 축소해 그림
function TemplateThumb({ tpl }) {
  const ref = useRef(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const x = c.getContext('2d')
    const W = 28, H = 42
    x.clearRect(0, 0, W, H)
    x.fillStyle = tpl.bg || '#4a3f6b'
    x.fillRect(0, 0, W, H)
    x.fillStyle = `rgba(0,0,0,${tpl.dim / 100})`
    x.fillRect(0, 0, W, H)
    if (tpl.frame) { x.strokeStyle = tpl.fg; x.lineWidth = 1; x.strokeRect(1.5, 1.5, W - 3, H - 3) }
    x.fillStyle = tpl.fg
    const ty = tpl.vpos === 'top' ? 8 : tpl.vpos === 'mid' ? 19 : 30
    const tx = tpl.align === 'left' ? 5 : tpl.align === 'right' ? 15 : 8
    x.fillRect(tx, ty, 12, 2.4)
    x.fillRect(tx, ty + 4.6, 8, 2.4)
  }, [tpl])
  return <canvas ref={ref} width={28} height={42} style={{ display: 'block', margin: '0 auto 7px', borderRadius: 2, border: '1px solid rgba(0,0,0,0.12)' }} />
}

export default function CoverPage({ app }) {
  const {
    t, messages, uploadedEpub, handleEpubUpload,
    title, author, setCoverImage,
    epubTitle, epubAuthor, setEpubCoverImage,
    setPage, coverReturnTo, toast,
  } = app
  const S = styles(t)

  const hasEbook = messages.length > 0 || !!uploadedEpub
  // 업로드한 epub을 편집 중이면 그쪽 제목/작가명·표지 반영처를 씀 — 로그 변환 쪽과 안 섞임
  const activeTitle = uploadedEpub ? epubTitle : title
  const activeAuthor = uploadedEpub ? epubAuthor : author
  const applyCoverImage = uploadedEpub ? setEpubCoverImage : setCoverImage

  // 진입 시 목적을 먼저 고름. null = 선택 화면.
  // 'apply'  = 기존 eBook 표지 수정 → 「이 표지로 적용하기」 활성
  // 'export' = 표지만 생성        → PNG 내려받기 전용
  // eBook이 이미 있는 상태로 들어오면 고를 것도 없이 바로 apply 화면으로 감.
  // (직접 고르고 싶으면 「다시 고르기」로 선택 화면으로 돌아갈 수 있음)
  const [mode, setMode] = useState(() => hasEbook ? 'apply' : null)

  const canvasRef = useRef(null)
  const frameRef = useRef(null)
  const dragRef = useRef({ on: false, x: 0, y: 0 })

  const [st, setSt] = useState(() => makeInitialCoverState(activeTitle, activeAuthor))
  const [imgName, setImgName] = useState('')

  // 책 정보에서 제목·작가명이 바뀌면 따라감 (사용자가 표지에서 직접 고친 뒤에는 덮지 않음).
  // 비어 있으면 예시 문구를 유지해 결과가 어떤 모양인지 바로 보이게 함.
  const touched = useRef(false)
  useEffect(() => {
    if (touched.current) return
    setSt(s => ({ ...s, title: activeTitle || SAMPLE_TITLE, author: activeAuthor || SAMPLE_AUTHOR }))
  }, [activeTitle, activeAuthor])

  // 상태가 바뀔 때마다 다시 그림.
  // mode 를 의존성에 넣는 이유 = 진입 선택 화면에는 canvas 가 없어서,
  // 모드가 정해져 canvas 가 «처음 마운트되는» 순간에도 한 번 그려줘야 함.
  useEffect(() => {
    const c = canvasRef.current
    if (c) drawCover(c.getContext('2d'), st)
  }, [st, mode])

  // 오프셋이 걸린 값은 갱신 시점에 클램프해 그린 결과와 state 를 일치시킴
  const patch = useCallback((p) => {
    touched.current = true
    setSt(s => {
      const next = { ...s, ...p }
      return { ...next, ...clampOffset(next) }
    })
  }, [])

  const loadFile = useCallback((file) => {
    if (!file || !file.type.startsWith('image/')) return
    const r = new FileReader()
    r.onload = (ev) => {
      const im = new Image()
      im.onload = () => { setSt(s => ({ ...s, img: im, ox: 0, oy: 0, zoom: 100 })); setImgName(file.name) }
      im.src = ev.target.result
    }
    r.readAsDataURL(file)
  }, [])

  // 드래그로 이미지 이동
  const onPointerDown = (e) => {
    if (!st.img) return
    dragRef.current = { on: true, x: e.clientX, y: e.clientY }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e) => {
    if (!dragRef.current.on) return
    const k = COVER_W / (frameRef.current?.clientWidth || COVER_W)
    const dx = (e.clientX - dragRef.current.x) * k
    const dy = (e.clientY - dragRef.current.y) * k
    dragRef.current = { on: true, x: e.clientX, y: e.clientY }
    setSt(s => {
      const next = { ...s, ox: s.ox + dx, oy: s.oy + dy }
      return { ...next, ...clampOffset(next) }
    })
  }
  const onPointerUp = (e) => {
    dragRef.current.on = false
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* 이미 해제됨 */ }
  }

  // 휠 확대 — passive 리스너로는 preventDefault 가 막히므로 직접 등록
  useEffect(() => {
    const el = frameRef.current
    if (!el) return
    const onWheel = (e) => {
      if (!st.img) return
      e.preventDefault()
      setSt(s => {
        const next = { ...s, zoom: Math.min(300, Math.max(100, s.zoom + (e.deltaY < 0 ? 6 : -6))) }
        return { ...next, ...clampOffset(next) }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [st.img])

  const canApply = mode === 'apply' && hasEbook

  const useAsCover = () => {
    if (!canApply) return
    applyCoverImage(canvasRef.current.toDataURL('image/png'))
    toast('표지를 적용했습니다')
    setPage(coverReturnTo)
  }
  const download = () => {
    const a = document.createElement('a')
    a.href = canvasRef.current.toDataURL('image/png')
    a.download = `${st.title || 'cover'}.png`
    a.click()
  }

  // ─── 진입 선택 ───────────────────────────────────────────────
  if (mode === null) {
    const choices = [
      {
        key: 'apply', Icon: Book, label: '기존 eBook 표지 수정하기',
        desc: '변환해 둔 eBook의 표지로 바로 적용합니다',
      },
      {
        key: 'export', Icon: Wand2, label: '표지만 생성하기',
        desc: 'eBook 없이 표지 이미지만 만들어 PNG로 내려받습니다',
      },
    ]
    return (
      <>
        <PageHeader title="표지 생성기" desc="무엇을 하려는지 먼저 골라주세요" t={t} />
        <div className="choice-grid">
          {choices.map(({ key, Icon, label, desc }) => (
            <button key={key} type="button" onClick={() => setMode(key)} style={{
              ...glass(t), borderRadius: 18, padding: '32px 28px', cursor: 'pointer',
              textAlign: 'left', fontFamily: 'inherit', color: t.text,
              border: `1px solid ${t.glassBorder}`, transition: 'all 0.15s',
            }}>
              <Icon size={30} strokeWidth={1.6} style={{ display: 'block', marginBottom: 16, color: t.textSub }} />
              <div style={{ fontSize: '1.08em', fontWeight: 700, marginBottom: 8 }}>{label}</div>
              <div style={{ fontSize: '0.88em', color: t.textSub, lineHeight: 1.65 }}>{desc}</div>
            </button>
          ))}
        </div>
      </>
    )
  }

  // 「기존 eBook 표지 수정」인데 eBook 이 없으면 먼저 만들도록 보냄
  if (mode === 'apply' && !hasEbook) {
    return (
      <>
        <PageHeader title="표지 생성기" desc="기존 eBook의 표지를 수정합니다" t={t} />
        <EmptyState
          t={t}
          onGoConvert={() => setPage('convert')}
          onUploadEpub={handleEpubUpload}
          desc={<>표지를 적용할 eBook이 아직 없습니다.<br />eBook 없이 표지만 만들려면 아래에서 다시 골라주세요.</>}
        />
        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <button type="button" onClick={() => setMode(null)} style={{
            background: 'none', border: 'none', padding: 0, color: t.textSub, fontSize: '0.8em',
            textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit',
          }}>다시 고르기</button>
        </div>
      </>
    )
  }

  const stage = (
    <div className="cover-stage">
      <div
        ref={frameRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{
          position: 'relative', width: 292, height: 438, borderRadius: 6, overflow: 'hidden',
          boxShadow: '0 8px 30px rgba(60,40,110,0.22)', background: '#111',
          cursor: st.img ? 'grab' : 'default', touchAction: 'none',
        }}
      >
        <canvas ref={canvasRef} width={COVER_W} height={COVER_H} style={{ display: 'block', width: '100%', height: '100%' }} />
      </div>
      <div style={{ fontSize: '0.68em', color: t.textMuted, textAlign: 'center', marginTop: 9, lineHeight: 1.6 }}>
        <b style={{ color: t.textSub }}>600 × 900</b> · EPUB 표지 비율 2:3
        {st.img && <><br />프레임 안을 드래그하면 이미지가 이동합니다</>}
      </div>
    </div>
  )

  return (
    <>
      <PageHeader
        title="표지 생성기"
        desc={mode === 'apply'
          ? '기존 eBook의 표지를 수정합니다'
          : 'eBook 없이 표지 이미지만 만듭니다'}
        t={t}
      />
      <button type="button" onClick={() => setMode(null)} style={{
        background: 'none', border: 'none', padding: 0, marginBottom: 18,
        color: t.textSub, fontSize: '0.78em', textDecoration: 'underline',
        cursor: 'pointer', fontFamily: 'inherit', display: 'block',
      }}>다시 고르기</button>

      <div className="cover-layout">
        {/* 컨트롤 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...glass(t), borderRadius: 16, padding: 20, marginBottom: 14 }}>
            <p style={S.sectionLabel}>템플릿</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {Object.entries(COVER_TEMPLATES).map(([key, tpl]) => (
                <button key={key} type="button"
                  onClick={() => { touched.current = true; setSt(s => applyTemplate(s, key)) }}
                  style={{
                    flex: 1, minWidth: 84, borderRadius: 10, padding: '9px 4px 8px', cursor: 'pointer',
                    fontFamily: 'inherit', fontSize: '0.74em', textAlign: 'center',
                    background: st.tpl === key ? t.accent : t.inputBg,
                    color: st.tpl === key ? t.accentFg : t.textSub,
                    border: `1px solid ${st.tpl === key ? t.accent : t.border}`,
                    fontWeight: st.tpl === key ? 600 : 400,
                  }}>
                  <TemplateThumb tpl={{ ...tpl, frame: key === 'frame' }} />
                  {tpl.label}
                </button>
              ))}
            </div>
            <p style={{ fontSize: '0.7em', color: t.textMuted, margin: '9px 0 0', lineHeight: 1.6 }}>
              템플릿은 아래 값들을 한 번에 지정하는 프리셋. 고른 뒤 개별 조절 가능.
            </p>
          </div>

          <div style={{ ...glass(t), borderRadius: 16, padding: 20, marginBottom: 14 }}>
            <p style={S.sectionLabel}>배경 이미지</p>
            {st.img ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: '0.8em', color: t.textSub }}>
                <ImageIcon size={15} style={{ flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{imgName}</span>
                <button type="button" onClick={() => { patch({ img: null, ox: 0, oy: 0, zoom: 100 }); setImgName('') }} style={{
                  background: 'none', border: 'none', color: t.textMuted, fontSize: '0.9em',
                  textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit', padding: 0,
                }}>제거</button>
              </div>
            ) : (
              <DropZone t={t} size="sm" accept="image/*" onFile={loadFile}>
                클릭하거나 이미지를 드래그하세요
              </DropZone>
            )}

            <div className="field-row" style={{ marginTop: 14 }}>
              <div style={{ ...S.field, flex: 1, minWidth: 120 }}>
                <label style={{ ...S.label, display: 'flex', justifyContent: 'space-between', paddingLeft: 3 }}>
                  확대 <span style={{ color: t.textMuted, textTransform: 'none', letterSpacing: 0 }}>{st.zoom}%</span>
                </label>
                <input type="range" min={100} max={300} value={st.zoom} disabled={!st.img}
                  onChange={e => patch({ zoom: +e.target.value })} style={{ width: '100%', accentColor: t.accent }} />
              </div>
              <div style={{ ...S.field, flex: 1, minWidth: 120 }}>
                <label style={{ ...S.label, display: 'flex', justifyContent: 'space-between', paddingLeft: 3 }}>
                  어둡게 <span style={{ color: t.textMuted, textTransform: 'none', letterSpacing: 0 }}>{st.dim}%</span>
                </label>
                <input type="range" min={0} max={80} value={st.dim}
                  onChange={e => patch({ dim: +e.target.value })} style={{ width: '100%', accentColor: t.accent }} />
              </div>
            </div>
            <div style={{ marginBottom: 0 }}>
              <label style={S.label}>이미지 없을 때 배경색</label>
              <input type="color" value={st.bg} onChange={e => patch({ bg: e.target.value })}
                style={{ width: '100%', height: 34, padding: 2, borderRadius: 8, border: `1px solid ${t.inputBorder}`, background: t.inputBg }} />
            </div>
          </div>

          <div style={{ ...glass(t), borderRadius: 16, padding: 20 }}>
            <p style={S.sectionLabel}>텍스트</p>
            <div style={S.field}>
              <label style={S.label}>제목</label>
              <input value={st.title} onChange={e => patch({ title: e.target.value })} style={S.input} placeholder="시나리오 제목" />
            </div>
            <div style={S.field}>
              <label style={S.label}>작가명</label>
              <input value={st.author} onChange={e => patch({ author: e.target.value })} style={S.input} placeholder="페어명 또는 팀명" />
            </div>
            <div className="field-row">
              <div style={{ ...S.field, flex: 1, minWidth: 120 }}>
                <label style={S.label}>서체</label>
                <SegControl size="md" t={t} value={st.font} onChange={v => patch({ font: v })}
                  options={Object.entries(COVER_FONTS).map(([k, v]) => [k, v.label])} />
              </div>
              <div style={{ ...S.field, flex: 1, minWidth: 120 }}>
                <label style={S.label}>정렬</label>
                <SegControl size="md" t={t} value={st.align} onChange={v => patch({ align: v })}
                  options={[['left', '좌'], ['center', '중'], ['right', '우']]} />
              </div>
            </div>
            <div style={S.field}>
              <label style={S.label}>세로 위치</label>
              <SegControl size="md" t={t} value={st.vpos} onChange={v => patch({ vpos: v })}
                options={[['top', '상단'], ['mid', '중앙'], ['bot', '하단']]} />
            </div>
            <div className="field-row">
              <div style={{ ...S.field, flex: 1, minWidth: 120 }}>
                <label style={{ ...S.label, display: 'flex', justifyContent: 'space-between', paddingLeft: 3 }}>
                  글자 크기 <span style={{ color: t.textMuted, textTransform: 'none', letterSpacing: 0 }}>{st.size}</span>
                </label>
                <input type="range" min={30} max={90} value={st.size}
                  onChange={e => patch({ size: +e.target.value })} style={{ width: '100%', accentColor: t.accent }} />
              </div>
              <div style={{ ...S.field, flex: 1, minWidth: 120 }}>
                <label style={S.label}>글자색</label>
                <input type="color" value={st.fg} onChange={e => patch({ fg: e.target.value })}
                  style={{ width: '100%', height: 34, padding: 2, borderRadius: 8, border: `1px solid ${t.inputBorder}`, background: t.inputBg }} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', marginTop: 4 }}>
              {canApply && (
                <button type="button" onClick={useAsCover} style={{
                  ...S.btnPrimary, fontSize: '0.84em', padding: '9px 18px',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}><Check size={14} />이 표지로 적용하기</button>
              )}
              <button type="button" onClick={download} style={{
                ...(canApply ? S.btnSecondary : S.btnPrimary),
                fontSize: '0.84em', padding: '9px 16px',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}><Download size={14} />PNG 내려받기</button>
              <button type="button" onClick={() => patch({ ox: 0, oy: 0, zoom: 100 })} style={{
                ...S.btnSecondary, fontSize: '0.84em', padding: '9px 16px',
              }}>위치 초기화</button>
            </div>

            {mode === 'export' && (
              <p style={{ fontSize: '0.74em', color: t.textMuted, margin: '12px 0 0', lineHeight: 1.7 }}>
                표지만 만드는 중이라 PNG 로만 내려받습니다.
                eBook 표지로 쓰려면 <button type="button" onClick={() => setMode(null)} style={{
                  background: 'none', border: 'none', padding: 0, color: t.textSub,
                  textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit',
                }}>기존 eBook 표지 수정하기</button> 를 골라주세요.
              </p>
            )}
          </div>
        </div>

        {stage}
      </div>
    </>
  )
}

/**
 * 표지 생성 — canvas 렌더링.
 *
 * 미리보기와 결과물이 같은 canvas 하나. DOM 으로 미리보기를 만들고 export 시점에
 * canvas 로 다시 그리면 둘이 어긋나므로, 처음부터 canvas 에만 그림.
 * 결과는 toDataURL() 로 뽑아 기존 coverImage 경로에 그대로 태움.
 */

export const COVER_W = 600
export const COVER_H = 900
const PAD = 64
const FRAME_INSET = 24   // 프레임 템플릿 테두리 — 외곽 가까이

export const COVER_FONTS = {
  gothic: { label: '고딕', stack: '"Pretendard","Malgun Gothic","Apple SD Gothic Neo",sans-serif', titleWeight: 800, authorWeight: 400 },
  serif: { label: '명조', stack: '"Nanum Myeongjo",Batang,"바탕","Noto Serif KR",serif', titleWeight: 700, authorWeight: 400 },
}

/** 선언 순서 = 화면 표시 순서. 첫 항목이 기본 선택값. */
export const COVER_TEMPLATES = {
  'photo-bottom': { label: '사진+하단', dim: 35, vpos: 'bot', align: 'left', size: 54, fg: '#ffffff', font: 'gothic' },
  'minimal': { label: '미니멀', dim: 0, vpos: 'mid', align: 'center', size: 60, fg: '#ffffff', bg: '#1c1c22', font: 'gothic' },
  'frame': { label: '프레임', dim: 22, vpos: 'top', align: 'center', size: 46, fg: '#ffffff', font: 'serif' },
}
export const DEFAULT_COVER_TEMPLATE = Object.keys(COVER_TEMPLATES)[0]

/** 템플릿 프리셋을 편집 상태에 얹음 */
export function applyTemplate(state, key) {
  const t = COVER_TEMPLATES[key]
  if (!t) return state
  return {
    ...state,
    tpl: key,
    dim: t.dim, vpos: t.vpos, align: t.align, size: t.size, fg: t.fg, font: t.font,
    bg: t.bg ?? state.bg,
  }
}

/**
 * eBook 이 없어 제목·작가명을 이어받을 데가 없을 때 채워 넣는 예시 문구.
 * 빈 표지를 보여주면 무엇이 만들어지는지 알 수 없으므로 결과 예시가 바로 보이게 함.
 */
export const SAMPLE_TITLE = '시나리오 제목'
export const SAMPLE_AUTHOR = '페어명 또는 팀명'

export function makeInitialCoverState(title = '', author = '') {
  return applyTemplate({
    tpl: DEFAULT_COVER_TEMPLATE,
    img: null, zoom: 100, ox: 0, oy: 0,
    dim: 35, bg: '#1c1c22',
    title: title || SAMPLE_TITLE,
    author: author || SAMPLE_AUTHOR,
    font: 'gothic', vpos: 'bot', align: 'left', size: 54, fg: '#ffffff',
  }, DEFAULT_COVER_TEMPLATE)
}

const fitCover = (img) => Math.max(COVER_W / img.width, COVER_H / img.height)

/**
 * 이미지 이동 오프셋을 프레임에 빈 공간이 생기지 않는 범위로 제한.
 * 상태를 갱신하는 쪽(드래그·확대 핸들러)에서 미리 통과시켜야 그린 결과와 state 가 어긋나지 않음.
 */
export function clampOffset(S) {
  if (!S.img || !S.img.complete || !S.img.naturalWidth) return { ox: 0, oy: 0 }
  const sc = fitCover(S.img) * (S.zoom / 100)
  const maxX = Math.max(0, (S.img.width * sc - COVER_W) / 2)
  const maxY = Math.max(0, (S.img.height * sc - COVER_H) / 2)
  return {
    ox: Math.min(maxX, Math.max(-maxX, S.ox)),
    oy: Math.min(maxY, Math.max(-maxY, S.oy)),
  }
}

/** 표지 한 장을 canvas 에 그림. 오프셋은 그리는 시점에도 한 번 더 클램프함. */
export function drawCover(ctx, S) {
  const W = COVER_W, H = COVER_H
  ctx.clearRect(0, 0, W, H)

  if (S.img && S.img.complete && S.img.naturalWidth) {
    const sc = fitCover(S.img) * (S.zoom / 100)
    const dw = S.img.width * sc, dh = S.img.height * sc
    const { ox, oy } = clampOffset(S)
    ctx.drawImage(S.img, (W - dw) / 2 + ox, (H - dh) / 2 + oy, dw, dh)
  } else {
    ctx.fillStyle = S.bg
    ctx.fillRect(0, 0, W, H)
  }

  // 가독성 오버레이 — 텍스트가 있는 쪽만 진하게
  if (S.dim > 0) {
    const a = S.dim / 100
    if (S.vpos === 'bot') {
      const g = ctx.createLinearGradient(0, H * 0.35, 0, H)
      g.addColorStop(0, 'rgba(0,0,0,0)')
      g.addColorStop(1, `rgba(0,0,0,${Math.min(1, a * 1.7)})`)
      ctx.fillStyle = g
    } else if (S.vpos === 'top') {
      const g = ctx.createLinearGradient(0, 0, 0, H * 0.6)
      g.addColorStop(0, `rgba(0,0,0,${Math.min(1, a * 1.7)})`)
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
    } else {
      ctx.fillStyle = `rgba(0,0,0,${a})`
    }
    ctx.fillRect(0, 0, W, H)
  }

  if (S.tpl === 'frame') {
    ctx.strokeStyle = S.fg
    ctx.globalAlpha = 0.8
    ctx.lineWidth = 3
    ctx.strokeRect(FRAME_INSET, FRAME_INSET, W - FRAME_INSET * 2, H - FRAME_INSET * 2)
    ctx.globalAlpha = 1
  }

  drawText(ctx, S)
}

function drawText(ctx, S) {
  const W = COVER_W, H = COVER_H
  const F = COVER_FONTS[S.font] || COVER_FONTS.gothic
  const x = S.align === 'left' ? PAD : S.align === 'right' ? W - PAD : W / 2
  ctx.textAlign = S.align === 'left' ? 'left' : S.align === 'right' ? 'right' : 'center'
  ctx.fillStyle = S.fg
  ctx.textBaseline = 'top'

  const lh = S.size * 1.3
  const lines = wrapText(ctx, S.title, S.size, W - PAD * 2, F)
  const blockH = lines.length * lh

  let y
  if (S.vpos === 'top') y = S.tpl === 'frame' ? FRAME_INSET + 78 : 110
  else if (S.vpos === 'mid') y = (H - blockH) / 2
  else y = H - 150 - blockH

  ctx.font = `${F.titleWeight} ${S.size}px ${F.stack}`
  for (const ln of lines) { ctx.fillText(ln, x, y); y += lh }

  if (S.author) {
    ctx.globalAlpha = 0.78
    ctx.font = `${F.authorWeight} ${Math.round(S.size * 0.42)}px ${F.stack}`
    ctx.fillText(S.author, x, y + 18)
    ctx.globalAlpha = 1
  }
}

// 한글은 단어 경계가 없어 글자 단위로 폭을 재서 접음
function wrapText(ctx, text, size, maxW, F) {
  ctx.font = `${F.titleWeight} ${size}px ${F.stack}`
  const out = []
  for (const para of String(text || '').split('\n')) {
    let line = ''
    for (const ch of para) {
      if (ctx.measureText(line + ch).width > maxW && line) { out.push(line); line = ch }
      else line += ch
    }
    out.push(line)
  }
  return out.filter((l, i) => l !== '' || i === 0)
}

import JSZip from 'jszip'

/**
 * 메시지 배열을 받아 EPUB Blob을 반환 (브라우저 전용, JSZip 기반)
 * @param {object[]} messages - parseRoll20Html 반환값
 * @param {object}   meta     - { title, author, includeSadam }
 * @returns {Promise<Blob>}
 */
const COVER_EXT_MAP = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' }

/**
 * EPUB 본문 조판 서체.
 * EPUB 에 폰트를 동봉하지 않으므로 리더기·기기에 설치된 것 중 먼저 잡히는 것이 쓰임.
 * 그래서 한국어 우선 → 범용 폴백 순서로 여러 개를 나열함.
 */
export const BODY_FONTS = {
  gothic: '"Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", "Nanum Gothic", sans-serif',
  serif: '"Noto Serif KR", "Source Han Serif KR", "Nanum Myeongjo", Batang, Georgia, serif',
}
export const DEFAULT_BODY_FONT = 'gothic'

// epubCss 의 __BODY_FONT__ 토큰을 실제 스택으로 치환 + 롤템플릿 CSS 이어붙임
function buildCss(bodyFont, templateCss) {
  const stack = BODY_FONTS[bodyFont] || BODY_FONTS[DEFAULT_BODY_FONT]
  return epubCss.replace('__BODY_FONT__', stack) + (templateCss ? '\n' + templateCss : '')
}

export async function generateEpub(messages, meta = {}) {
  const title = meta.title || 'TRPG 세션 로그'
  const author = meta.author || ''
  const includeSadam = meta.includeSadam ?? false
  const id = `trpg-${Date.now()}`
  const css = buildCss(meta.bodyFont, meta.templateCss)
  const chapters = messagesToChapters(messages, includeSadam)

  const coverTitle = meta.coverTitle || title

  // cover 이미지 결정: 업로드 이미지 or canvas 렌더링
  let coverFileName, coverMime, coverB64
  if (meta.coverImage) {
    const m = meta.coverImage.match(/^data:([^;]+);base64,(.+)$/)
    if (m) {
      coverMime = m[1]
      coverB64 = m[2]
      coverFileName = `cover.${COVER_EXT_MAP[coverMime] || 'jpg'}`
    }
  }
  if (!coverB64) {
    const dataUrl = await renderCoverToPng({ coverTitle, author })
    coverMime = 'image/png'
    coverB64 = dataUrl.replace(/^data:image\/png;base64,/, '')
    coverFileName = 'cover.png'
  }

  // 각 챕터 HTML의 base64 이미지를 별도 파일로 분리 (전체 통합 처리)
  const allImages = new Map()
  let imgCounter = 0
  const processedChapters = chapters.map(ch => {
    const { html, images } = extractBase64Images(ch.html, allImages, imgCounter)
    imgCounter += images.length
    return { ...ch, html }
  })
  const embeddedImages = [...allImages.values()]

  const zip = new JSZip()
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
  zip.folder('META-INF').file('container.xml', containerXml())

  const oebps = zip.folder('OEBPS')
  oebps.file('content.opf', contentOpf({ id, title, author, coverFileName, coverMime, embeddedImages, chapters: processedChapters }))
  oebps.file('toc.ncx', tocNcx({ id, title, chapters: processedChapters }))
  oebps.file('style.css', css)
  oebps.file(coverFileName, coverB64, { base64: true })
  oebps.file('cover.xhtml', coverXhtml({ coverFileName: meta.coverImage ? coverFileName : null, coverTitle, author }))

  for (const ch of processedChapters) {
    oebps.file(ch.filename, chapterXhtml({ title: ch.title || title, bodyHtml: ch.html }))
  }

  // 분리된 이미지 파일들을 OEBPS/images/ 에 저장
  const imagesFolder = oebps.folder('images')
  for (const img of embeddedImages) {
    imagesFolder.file(img.filename, img.data, { base64: true })
  }

  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' })
  return blob
}

// ─── Canvas 표지 렌더링 (이미지 없을 때 cover.png 생성) ──────────

async function renderCoverToPng({ coverTitle, author }, W = 600, H = 900) {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, W, H)

  if (coverTitle) {
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 54px Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    canvasWrapText(ctx, coverTitle, W / 2, Math.round(H * 0.18), W - 100, 68)
  }

  if (author) {
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.font = '28px Arial, sans-serif'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'bottom'
    ctx.fillText(author, W - 50, H - 50)
  }

  return canvas.toDataURL('image/png')
}

function canvasWrapText(ctx, text, x, y, maxWidth, lineHeight) {
  let curY = y
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(' ')
    let line = ''
    for (const word of words) {
      const test = line ? line + ' ' + word : word
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, curY)
        line = word
        curY += lineHeight
      } else {
        line = test
      }
    }
    if (line) { ctx.fillText(line, x, curY); curY += lineHeight }
  }
  return curY
}

/**
 * 브라우저 미리보기용 HTML 문자열 반환
 */
export function generatePreviewHtml(messages, meta = {}) {
  const title = meta.title || 'TRPG 세션 로그'
  const includeSadam = meta.includeSadam ?? false
  const css = buildCss(meta.bodyFont, meta.templateCss)
  const bodyHtml = messagesToHtml(messages, includeSadam)
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8"/>
<title>${esc(title)}</title>
<style>${css}</style>
</head>
<body>
${bodyHtml}
</body>
</html>`
}

// ─── XML / HTML 템플릿 ───────────────────────────────────────────

function containerXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
}

function contentOpf({ id, title, author, coverFileName, coverMime, embeddedImages = [], chapters = [] }) {
  const imageItems = embeddedImages.map((img, i) =>
    `    <item id="img-${i}" href="images/${img.filename}" media-type="${img.mime}"/>`
  ).join('\n')
  const chapterItems = chapters.map(ch =>
    `    <item id="${ch.id}" href="${ch.filename}" media-type="application/xhtml+xml"/>`
  ).join('\n')
  const spineItems = chapters.map(ch =>
    `    <itemref idref="${ch.id}"/>`
  ).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">${id}</dc:identifier>
    <dc:title>${esc(title)}</dc:title>
    <dc:creator>${esc(author)}</dc:creator>
    <dc:language>ko</dc:language>
    <meta name="cover" content="cover-image"/>
  </metadata>
  <manifest>
    <item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>
    <item id="css" href="style.css" media-type="text/css"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="cover-image" href="${coverFileName}" media-type="${coverMime}" properties="cover-image"/>
${chapterItems}
${imageItems}
  </manifest>
  <spine toc="ncx">
    <itemref idref="cover" linear="yes"/>
${spineItems}
  </spine>
</package>`
}

function tocNcx({ id, title, chapters = [] }) {
  const navPoints = chapters.map((ch, i) => `
    <navPoint id="${ch.id}" playOrder="${i + 1}">
      <navLabel><text>${esc(ch.title || `챕터 ${i + 1}`)}</text></navLabel>
      <content src="${ch.filename}"/>
    </navPoint>`).join('')
  return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${id}"/>
  </head>
  <docTitle><text>${esc(title)}</text></docTitle>
  <navMap>${navPoints}
  </navMap>
</ncx>`
}

function coverXhtml({ coverFileName, coverTitle, author }) {
  const textContent = `
    <div style="padding:2em 1.8em 0;text-align:center;">
      <h1 style="color:#fff;font-family:Arial,sans-serif;font-size:1.8em;font-weight:bold;letter-spacing:0.04em;margin:0;line-height:1.4;">${esc(coverTitle)}</h1>
    </div>
    ${author ? `<div style="padding:0 1.8em;margin-top:3em;text-align:right;"><p style="color:rgba(255,255,255,0.7);font-family:Arial,sans-serif;font-size:0.85em;margin:0;">${esc(author)}</p></div>` : ''}`
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="ko">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8"/>
  <title>Cover</title>
  <style type="text/css">
    html,body{margin:0;padding:0;background:#000;}
  </style>
</head>
<body>
  ${coverFileName ? `<img src="${coverFileName}" alt="Cover" style="display:block;width:100%;"/>` : textContent}
</body>
</html>`
}

function chapterXhtml({ title, bodyHtml }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="ko">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8"/>
  <title>${esc(title)}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
${bodyHtml}
</body>
</html>`
}

// ─── 메시지 → HTML 변환 ──────────────────────────────────────────

function messagesToHtml(messages, includeSadam) {
  const parts = []
  let lastGroup = { speaker: null, type: null, channelName: null }

  const breakGroup = () => { lastGroup = { speaker: null, type: null, channelName: null } }

  for (const msg of messages) {
    if (msg.isSadam && !includeSadam) continue

    if (msg.type === 'template') {
      const speaker = msg.speaker || ''
      const isSameGroup = speaker && speaker === lastGroup.speaker && (msg.channelName || null) === lastGroup.channelName
      if (!isSameGroup) {
        if (speaker) parts.push(`<p class="speaker-name">${esc(speaker)} :</p>`)
        lastGroup = { speaker, type: 'template', channelName: msg.channelName || null }
      }
      parts.push(`<div style="margin:1em 0">${msg.templateHtml}</div>`)
      continue
    }

    if (msg.type === 'desc') {
      breakGroup()
      parts.push(`<p class="desc">${msg.content}</p>`)
      continue
    }
    if (msg.type === 'emote') {
      breakGroup()
      parts.push(`<p class="emote">${msg.content}</p>`)
      continue
    }

    // rollresult (인라인 주사위) — speaker-group에 참여
    if (msg.type === 'rollresult') {
      const speaker = msg.speaker || ''
      const isSameGroup = speaker && speaker === lastGroup.speaker && (msg.channelName || null) === lastGroup.channelName
      if (!isSameGroup) {
        if (speaker) parts.push(`<p class="speaker-name">${esc(speaker)} :</p>`)
        lastGroup = { speaker, type: 'rollresult', channelName: msg.channelName || null }
      }
      if (msg.formula) parts.push(`<p class="roll-formula">${esc(msg.formula)}</p>`)
      if (msg.formattedHtml) parts.push(`<div class="roll-formatted">${msg.formattedHtml}</div>`)
      if (msg.rolled) parts.push(`<p class="roll-total">= ${esc(msg.rolled)}</p>`)
      continue
    }

    // general / hidden / whisper / sadam
    const msgType = (msg.type === 'hidden' || msg.type === 'whisper') ? 'hidden' : (msg.isSadam ? 'sadam' : 'general')
    const cls = msgType === 'hidden' ? 'whisper' : msgType === 'sadam' ? 'sadam' : 'dialogue'
    const speaker = msg.speaker || ''

    const isSameGroup = speaker && speaker === lastGroup.speaker && msgType === lastGroup.type && (msg.channelName || null) === lastGroup.channelName

    if (!isSameGroup) {
      if (speaker) {
        parts.push(`<p class="speaker-name ${cls}-name">${esc(speaker)} :</p>`)
      }
      lastGroup = { speaker, type: msgType, channelName: msg.channelName || null }
    }

    if (msg.content) {
      // content는 이미 sanitized HTML (inlinerollresult 보존됨)
      parts.push(`<p class="${cls}">${msg.content}</p>`)
    }
  }

  return parts.join('\n')
}


// ─── base64 이미지 추출 및 파일 분리 ────────────────────────────

// seen: 챕터 간 공유 Map (중복 제거), startCounter: 이미 등록된 이미지 수
function extractBase64Images(html, seen = new Map(), startCounter = 0) {
  let counter = startCounter
  const newImages = []

  const result = html.replace(/src="(data:([^;]+);base64,([^"]+))"/g, (match, dataUrl, mime, data) => {
    if (!seen.has(dataUrl)) {
      const ext = COVER_EXT_MAP[mime] || 'png'
      const filename = `img_${String(++counter).padStart(3, '0')}.${ext}`
      const entry = { filename, mime, data }
      seen.set(dataUrl, entry)
      newImages.push(entry)
    }
    return `src="images/${seen.get(dataUrl).filename}"`
  })

  return { html: result, images: newImages }
}

// ─── 메시지 → 챕터 배열 변환 ────────────────────────────────────
// desc 기준으로 챕터 분할, 10000개 초과 시 강제 분할

const CHAPTER_SOFT_MAX = 5000

function messagesToChapters(messages, includeSadam) {
  const chapters = []
  let parts = []
  let count = 0
  let chapterTitle = null
  let lastGroup = { speaker: null, type: null, channelName: null }
  let pendingSplit = false // 5000개 초과 후 다음 desc 직전에서 자를 플래그

  const flushChapter = () => {
    if (parts.length === 0) return
    const idx = chapters.length + 1
    chapters.push({
      id: `chapter-${idx}`,
      filename: `chapter_${String(idx).padStart(3, '0')}.xhtml`,
      title: chapterTitle || `챕터 ${idx}`,
      html: parts.join('\n'),
    })
    parts = []
    count = 0
    chapterTitle = null
    pendingSplit = false
    lastGroup = { speaker: null, type: null, channelName: null }
  }

  for (const msg of messages) {
    if (msg.isSadam && !includeSadam) continue

    // 5000개 초과 시 다음 desc 직전에서 자르도록 플래그
    if (count >= CHAPTER_SOFT_MAX) pendingSplit = true

    // desc 직전 + pendingSplit이면 챕터 분할
    if (msg.type === 'desc' && pendingSplit) flushChapter()

    if (msg.type === 'template') {
      const speaker = msg.speaker || ''
      const isSameGroup = speaker && speaker === lastGroup.speaker && (msg.channelName || null) === lastGroup.channelName
      if (!isSameGroup) {
        if (speaker) parts.push(`<p class="speaker-name">${esc(speaker)} :</p>`)
        lastGroup = { speaker, type: 'template', channelName: msg.channelName || null }
      }
      parts.push(`<div style="margin:1em 0">${msg.templateHtml}</div>`)
      count++
      continue
    }

    if (msg.type === 'desc') {
      lastGroup = { speaker: null, type: null, channelName: null }
      if (!chapterTitle) chapterTitle = msg.content.replace(/<[^>]*>/g, '').trim()
      parts.push(`<p class="desc">${msg.content}</p>`)
      count++
      continue
    }
    if (msg.type === 'emote') {
      lastGroup = { speaker: null, type: null, channelName: null }
      parts.push(`<p class="emote">${msg.content}</p>`)
      count++
      continue
    }

    if (msg.type === 'rollresult') {
      const speaker = msg.speaker || ''
      const isSameGroup = speaker && speaker === lastGroup.speaker && (msg.channelName || null) === lastGroup.channelName
      if (!isSameGroup) {
        if (speaker) parts.push(`<p class="speaker-name">${esc(speaker)} :</p>`)
        lastGroup = { speaker, type: 'rollresult', channelName: msg.channelName || null }
      }
      if (msg.formula) parts.push(`<p class="roll-formula">${esc(msg.formula)}</p>`)
      if (msg.formattedHtml) parts.push(`<div class="roll-formatted">${msg.formattedHtml}</div>`)
      if (msg.rolled) parts.push(`<p class="roll-total">= ${esc(msg.rolled)}</p>`)
      count++
      continue
    }

    const msgType = (msg.type === 'hidden' || msg.type === 'whisper') ? 'hidden' : (msg.isSadam ? 'sadam' : 'general')
    const cls = msgType === 'hidden' ? 'whisper' : msgType === 'sadam' ? 'sadam' : 'dialogue'
    const speaker = msg.speaker || ''
    const isSameGroup = speaker && speaker === lastGroup.speaker && msgType === lastGroup.type && (msg.channelName || null) === lastGroup.channelName
    if (!isSameGroup) {
      if (speaker) parts.push(`<p class="speaker-name ${cls}-name">${esc(speaker)} :</p>`)
      lastGroup = { speaker, type: msgType, channelName: msg.channelName || null }
    }
    if (msg.content) parts.push(`<p class="${cls}">${msg.content}</p>`)
    count++
  }

  flushChapter()
  return chapters
}

function esc(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ─── CSS ─────────────────────────────────────────────────────────

const epubCss = `
body {
  font-family: __BODY_FONT__;
  font-size: 1em;
  line-height: 1.9;
  color: #1a1a1a;
  margin: 0 1.5em;
}

p { margin: 0.1em 0; }
img { max-width: 100%; height: auto; }

p.speaker-name {
  font-weight: bold;
  margin: 2em 0 0.1em;
}

p.dialogue { margin-left: 0; }

p.desc {
  font-weight: bold;
  text-align: center;
  margin: 1em 0;
}

p.emote {
  font-weight: bold;
  font-style: italic;
  text-align: center;
  margin: 0.8em 0;
  color: #444;
}

p.whisper-name { color: #8b0000; }
p.whisper {
  margin-left: 0;
  color: #8b0000;
  font-style: italic;
}

p.sadam-name { opacity: 0.5; font-size: 0.9em; }
p.sadam { opacity: 0.5; font-size: 0.9em; }


p.roll-formula { font-size: 0.85em; color: #555; margin: 0 0 0.2em; }
div.roll-formatted { margin: 0.2em 0; }
p.roll-total { font-weight: bold; font-size: 1.05em; margin: 0.1em 0 0; }

.dicegrouping { display: inline; }
.diceroll { display: inline-block; vertical-align: middle; }
.dicon { display: inline-block; vertical-align: middle; }
.didroll { display: inline; }

[class*="sheet-rolltemplate-"] {
  line-height: 1.5;
  font-size: 1rem;
}
[class*="sheet-rolltemplate-"] p {
  margin: revert;
}
[class*="sheet-rolltemplate-"] table {
  border-collapse: collapse;
}
[class*="sheet-rolltemplate-"] td,
[class*="sheet-rolltemplate-"] th {
  padding: revert;
  vertical-align: top;
}
`

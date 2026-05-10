import JSZip from 'jszip'

/**
 * 메시지 배열을 받아 EPUB Blob을 반환 (브라우저 전용, JSZip 기반)
 * @param {object[]} messages - parseRoll20Html 반환값
 * @param {object}   meta     - { title, author, includeSadam }
 * @returns {Promise<Blob>}
 */
export async function generateEpub(messages, meta = {}) {
  const title = meta.title || 'TRPG 세션 로그'
  const author = meta.author || ''
  const includeSadam = meta.includeSadam ?? false
  const id = `trpg-${Date.now()}`
  const css = epubCss + (meta.templateCss ? '\n' + meta.templateCss : '')

  const bodyHtml = messagesToHtml(messages, includeSadam)

  const zip = new JSZip()

  // mimetype — 반드시 비압축, 첫 번째 파일
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })

  // META-INF/container.xml
  zip.folder('META-INF').file('container.xml', containerXml())

  const oebps = zip.folder('OEBPS')
  oebps.file('content.opf', contentOpf({ id, title, author }))
  oebps.file('toc.ncx', tocNcx({ id, title }))
  oebps.file('style.css', css)
  oebps.file('chapter.xhtml', chapterXhtml({ title, bodyHtml }))

  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' })
  return blob
}

/**
 * 브라우저 미리보기용 HTML 문자열 반환
 */
export function generatePreviewHtml(messages, meta = {}) {
  const title = meta.title || 'TRPG 세션 로그'
  const includeSadam = meta.includeSadam ?? false
  const css = epubCss + (meta.templateCss ? '\n' + meta.templateCss : '')
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

function contentOpf({ id, title, author }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">${id}</dc:identifier>
    <dc:title>${esc(title)}</dc:title>
    <dc:creator>${esc(author)}</dc:creator>
    <dc:language>ko</dc:language>
  </metadata>
  <manifest>
    <item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>
    <item id="css" href="style.css" media-type="text/css"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
  </manifest>
  <spine toc="ncx">
    <itemref idref="chapter"/>
  </spine>
</package>`
}

function tocNcx({ id, title }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${id}"/>
  </head>
  <docTitle><text>${esc(title)}</text></docTitle>
  <navMap>
    <navPoint id="chapter" playOrder="1">
      <navLabel><text>세션 로그</text></navLabel>
      <content src="chapter.xhtml"/>
    </navPoint>
  </navMap>
</ncx>`
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
  let lastGroup = { speaker: null, type: null }

  const breakGroup = () => { lastGroup = { speaker: null, type: null } }

  for (const msg of messages) {
    if (msg.isSadam && !includeSadam) continue

    if (msg.type === 'template') {
      const speaker = msg.speaker || ''
      const isSameGroup = speaker && speaker === lastGroup.speaker
      if (!isSameGroup) {
        if (speaker) parts.push(`<p class="speaker-name">${esc(speaker)} :</p>`)
        lastGroup = { speaker, type: 'template' }
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
      const isSameGroup = speaker && speaker === lastGroup.speaker
      if (!isSameGroup) {
        if (speaker) parts.push(`<p class="speaker-name">${esc(speaker)} :</p>`)
        lastGroup = { speaker, type: 'rollresult' }
      }
      if (msg.formula) parts.push(`<p class="roll-formula">${esc(msg.formula)}</p>`)
      if (msg.formattedHtml) parts.push(`<div class="roll-formatted">${msg.formattedHtml}</div>`)
      if (msg.rolled) parts.push(`<p class="roll-total">= ${esc(msg.rolled)}</p>`)
      continue
    }

    // general / hidden / sadam
    const msgType = msg.type === 'hidden' ? 'hidden' : (msg.isSadam ? 'sadam' : 'general')
    const cls = msgType === 'hidden' ? 'whisper' : msgType === 'sadam' ? 'sadam' : 'dialogue'
    const speaker = msg.speaker || ''

    const isSameGroup = speaker && speaker === lastGroup.speaker && msgType === lastGroup.type

    if (!isSameGroup) {
      if (speaker) {
        parts.push(`<p class="speaker-name ${cls}-name">${esc(speaker)} :</p>`)
      }
      lastGroup = { speaker, type: msgType }
    }

    if (msg.content) {
      // content는 이미 sanitized HTML (inlinerollresult 보존됨)
      parts.push(`<p class="${cls}">${msg.content}</p>`)
    }
  }

  return parts.join('\n')
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
  font-family: "Noto Serif KR", "Source Han Serif KR", Georgia, serif;
  font-size: 1em;
  line-height: 1.9;
  color: #1a1a1a;
  margin: 0 1.5em;
}

p { margin: 0.1em 0; }

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
`

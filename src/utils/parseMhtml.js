/**
 * MHTML(단일 파일 웹페이지) → { html, imageMap } 추출
 * 크롬 "다른 이름으로 저장 > 웹페이지, 단일 파일"로 저장한 .mhtml/.mht 대응.
 *
 * 구조: multipart/related. 각 파트는 quoted-printable(주로 텍스트) 또는
 * base64(이미지 등)로 인코딩된 원본 리소스.
 * - html: text/html 파트를 디코딩한 순수 HTML 문자열
 * - imageMap: 원본 절대 URL(Content-Location) → data: URL. 아바타·본문 이미지가
 *   전부 mhtml 안에 이미 통째로 들어있으므로, 네트워크로 다시 fetch하지 않고
 *   이 맵을 parseRoll20Html의 localImageMap 인자로 그대로 넘겨 오프라인으로 임베드.
 * 롤템플릿 CSS는 <link rel="stylesheet" href="cid:...">로 별도 파트에 분리돼
 * 있어 그대로 두면 유실됨 → 파트에서 추출해 <style>로 합쳐 넣음.
 */
export function mhtmlToHtml(buffer) {
  const raw = bytesToBinaryString(new Uint8Array(buffer))

  const topHeaderEnd = raw.indexOf('\r\n\r\n')
  const topHeader = raw.slice(0, topHeaderEnd < 0 ? raw.length : topHeaderEnd)
  const boundaryMatch = topHeader.match(/boundary="?([^"\r\n;]+)"?/i)
  if (!boundaryMatch) throw new Error('MHTML boundary를 찾을 수 없습니다.')
  const delimiter = '--' + boundaryMatch[1]

  const rawParts = raw.split(delimiter).slice(1, -1)

  let htmlBody = ''
  const cssBlocks = []
  const imageMap = {}

  for (const part of rawParts) {
    const headerEnd = part.indexOf('\r\n\r\n')
    if (headerEnd < 0) continue
    const header = part.slice(0, headerEnd)
    const body = part.slice(headerEnd + 4).replace(/\r\n$/, '')

    const ct = (header.match(/Content-Type:\s*([^\r\n;]+)/i)?.[1] || '').trim().toLowerCase()
    const cte = (header.match(/Content-Transfer-Encoding:\s*([^\r\n]+)/i)?.[1] || '').trim().toLowerCase()
    const location = (header.match(/Content-Location:\s*([^\r\n]+)/i)?.[1] || '').trim()

    if (ct === 'text/html' && !htmlBody) {
      htmlBody = decodeToUtf8(body, cte)
    } else if (ct === 'text/css') {
      const css = decodeToUtf8(body, cte)
      if (css.includes('sheet-rolltemplate-')) cssBlocks.push(css)
    } else if (ct.startsWith('image/') && location) {
      const base64 = cte === 'base64'
        ? body.replace(/[\r\n]/g, '')
        : bytesToBase64(cte === 'quoted-printable' ? quotedPrintableDecode(body) : Uint8Array.from(body, c => c.charCodeAt(0)))
      imageMap[location] = `data:${ct};base64,${base64}`
    }
  }

  if (!htmlBody) throw new Error('MHTML에서 HTML 본문을 찾을 수 없습니다.')

  if (cssBlocks.length) {
    const styleTag = `<style>${cssBlocks.join('\n')}</style>`
    htmlBody = htmlBody.includes('</head>')
      ? htmlBody.replace('</head>', `${styleTag}</head>`)
      : styleTag + htmlBody
  }

  return { html: htmlBody, imageMap }
}

// 큰 파일 대응: 청크 단위로 String.fromCharCode 적용 (인자 개수 제한 회피)
// 바이트 하나 = 문자 하나로 매핑 (MIME 구조/QP 파싱용, UTF-8 텍스트 파싱용 아님)
function bytesToBinaryString(bytes) {
  const CHUNK = 0x8000
  let result = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    result += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK))
  }
  return result
}

// 청크 단위 btoa (인자 개수 제한 회피)
function bytesToBase64(bytes) {
  const CHUNK = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

function decodeToUtf8(body, cte) {
  let outBytes
  if (cte === 'base64') {
    const binary = atob(body.replace(/[\r\n]/g, ''))
    outBytes = Uint8Array.from(binary, c => c.charCodeAt(0))
  } else if (cte === 'quoted-printable') {
    outBytes = quotedPrintableDecode(body)
  } else {
    // 7bit/8bit/미지정: 이미 원문 바이트
    outBytes = Uint8Array.from(body, c => c.charCodeAt(0))
  }
  return new TextDecoder('utf-8').decode(outBytes)
}

function quotedPrintableDecode(str) {
  const bytesArr = []
  for (let i = 0; i < str.length; i++) {
    const c = str[i]
    if (c === '=') {
      if (str[i + 1] === '\r' && str[i + 2] === '\n') { i += 2; continue } // 소프트 라인브레이크
      if (str[i + 1] === '\n') { i += 1; continue }
      const hex = str.slice(i + 1, i + 3)
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        bytesArr.push(parseInt(hex, 16))
        i += 2
        continue
      }
    }
    bytesArr.push(str.charCodeAt(i) & 0xff)
  }
  return new Uint8Array(bytesArr)
}

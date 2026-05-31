/**
 * 코코포리아 로그 파서
 *
 * 지원 방식:
 * 1. fetchCcfoliaLog(roomId, onProgress) — Firestore REST API로 수집
 * 2. parseCcfoliaHtml(htmlString) — HTML 직접 업로드 파싱
 *
 * 반환 메시지 형식은 parseRoll20.js 스펙과 동일:
 * { id, type, isSadam, isYou, speaker, content, timestamp }
 */

const FIRESTORE_BASE =
  'https://firestore.googleapis.com/v1/projects/ccfolia-160aa/databases/(default)/documents'

// ── 공통 유틸 ─────────────────────────────────────────────────────
function escHtml(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * URL 또는 방 ID 문자열에서 room ID만 추출
 * - "https://ccfolia.com/rooms/abc123" → "abc123"
 * - "abc123" → "abc123"
 */
export function extractRoomId(input) {
  const match = (input || '').match(/rooms\/([a-zA-Z0-9_-]+)/)
  return match ? match[1] : input.trim()
}

// ── Firestore API fetch ────────────────────────────────────────────
/**
 * 방 ID로 전체 로그를 Firestore REST API로 수집
 * @param {string} roomId
 * @param {(count: number) => void} onProgress
 * @returns {Promise<{ messages: object[], templateCss: string }>}
 */
export async function fetchCcfoliaLog(roomId, onProgress) {
  const allDocs = []
  let pageToken = undefined

  do {
    const params = new URLSearchParams({ pageSize: '300' })
    if (pageToken) params.set('pageToken', pageToken)

    const resp = await fetch(`${FIRESTORE_BASE}/rooms/${roomId}/messages?${params}`)
    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      throw new Error(`Firestore API 오류 (${resp.status})\n방 ID를 확인해주세요.${text ? '\n' + text.slice(0, 200) : ''}`)
    }

    const data = await resp.json()
    if (data.documents?.length) {
      allDocs.push(...data.documents)
      onProgress?.(allDocs.length)
    }

    pageToken = data.nextPageToken
  } while (pageToken)

  // createTime 기준 오름차순 정렬
  allDocs.sort((a, b) => new Date(a.createTime) - new Date(b.createTime))

  return { messages: firestoreDocsToMessages(allDocs), templateCss: '' }
}

/**
 * Firestore 문서 배열 → 공통 메시지 형식 변환
 *
 * Firestore 필드 구조:
 *   fields.name.stringValue        — 발언자 이름
 *   fields.text.stringValue        — 발언 내용
 *   fields.color.stringValue       — 캐릭터 컬러 (#rrggbb)
 *   fields.secret.booleanValue     — 비밀 메시지 여부
 *   fields.channel.stringValue     — 탭 ID
 *   fields.channelName.stringValue — 탭 이름 ('잡담' = 사담)
 *   fields.iconUrl.stringValue     — 캐릭터 아바타 이미지 URL
 *   fields.extend.mapValue.fields.roll.mapValue.fields.result.stringValue — 주사위 결과
 *   createTime                     — ISO 타임스탬프
 */
function firestoreDocsToMessages(docs) {
  const messages = []

  for (const doc of docs) {
    const f = doc.fields || {}
    const name = f.name?.stringValue || ''
    const text = f.text?.stringValue || ''
    const secret = f.secret?.booleanValue ?? false
    const channelName = f.channelName?.stringValue || ''
    const charColor = f.color?.stringValue || ''
    // iconUrl 필드명은 버전마다 다를 수 있어 후보를 순서대로 시도
    const iconUrl =
      f.iconUrl?.stringValue ||
      f.imageUrl?.stringValue ||
      f.image?.stringValue ||
      ''
    const rollResult =
      f.extend?.mapValue?.fields?.roll?.mapValue?.fields?.result?.stringValue || ''
    const ts = doc.createTime
      ? new Date(doc.createTime).toLocaleString('ko-KR', {
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit',
        })
      : ''
    const docId = doc.name?.split('/').pop() || String(messages.length)

    // 이름도 텍스트도 주사위도 없으면 시스템 메시지로 간주, 스킵
    if (!name && !text && !rollResult) continue

    // '잡담' 탭 = OOC 사담
    const isSadam = channelName === '잡담'

    let content = escHtml(text)
    if (rollResult) {
      content += `<div style="font-size:0.85em;color:#888;margin-top:4px;">[🎲 ${escHtml(rollResult)}]</div>`
    }

    messages.push({
      id: `ccfolia-${docId}`,
      type: secret ? 'hidden' : 'general',
      isSadam,
      isYou: false,
      speaker: name,
      content,
      timestamp: ts,
      charColor,
      iconUrl,
      channelName,
    })
  }

  return messages
}

// ── HTML 업로드 파싱 ───────────────────────────────────────────────
/**
 * 코코포리아 HTML 내보내기 파싱
 *
 * 실제 코코포리아 HTML 내보내기 구조:
 * <p style="color:#RRGGBB;">
 *   <span> [채널명]</span>
 *   <span>화자이름</span> :
 *   <span>
 *     내용 (주사위 결과 인라인 포함: "1d2 (1D2) ＞ 1")
 *   </span>
 * </p>
 *
 * 채널명: [메인] = 본게임, [잡담] = OOC 사담
 * 주사위: content 안에 "(xDy) ＞ 결과" 형식으로 인라인 포함
 */
export async function parseCcfoliaHtml(htmlString) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(htmlString, 'text/html')
  const messages = []

  // body 직계 <p style="color:..."> 요소가 메시지 단위
  const paragraphs = doc.querySelectorAll('p[style*="color"]')

  if (!paragraphs.length) {
    return {
      messages: [],
      templateCss: '',
      parseError: 'HTML 구조를 인식하지 못했습니다. 코코포리아 HTML 내보내기 파일인지 확인해주세요.',
    }
  }

  for (const p of paragraphs) {
    const spans = p.querySelectorAll(':scope > span')
    if (spans.length < 3) continue

    // [채널명] 추출: " [메인]" → "메인"
    const channelRaw = spans[0].textContent.trim()
    const channel = channelRaw.replace(/^\[/, '').replace(/\]$/, '').trim()

    const speaker = spans[1].textContent.trim()
    const rawContent = spans[2].textContent.trim()

    if (!rawContent && !speaker) continue

    // 잡담 채널 = 사담(OOC)
    const isSadam = channel === '잡담'

    // p 태그 style에서 캐릭터 컬러 추출
    const colorMatch = p.getAttribute('style')?.match(/color\s*:\s*(#[0-9a-fA-F]{3,8})/)
    const charColor = colorMatch ? colorMatch[1] : ''

    // 주사위 결과 포함 여부 감지: (xDy...) ＞ 숫자 패턴 (전각 ＞)
    const DICE_RE = /\((\d+D[\d+\-*]+)\)\s*＞\s*(.+)/i
    const hasDice = DICE_RE.test(rawContent)

    let content
    if (hasDice) {
      // 전체를 escHtml 후, 주사위 결과 부분만 스타일링
      const escaped = escHtml(rawContent)
      content = escaped.replace(
        /\((\d+D[\d+\-*]+)\)\s*＞\s*([^<\n]+)/gi,
        '<span style="display:inline-block;font-size:0.85em;color:#888;background:rgba(0,0,0,0.06);padding:1px 6px;border-radius:4px;font-family:monospace;">($1) ＞ $2</span>'
      )
    } else {
      content = escHtml(rawContent)
    }

    messages.push({
      id: `ccfolia-html-${messages.length}`,
      type: 'general',
      isSadam,
      isYou: false,
      speaker,
      content,
      timestamp: '',
      charColor,
      iconUrl: '',
      channelName: channel,
    })
  }

  return { messages, templateCss: '' }
}
